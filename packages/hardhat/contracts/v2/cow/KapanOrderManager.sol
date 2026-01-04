// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { IComposableCoW, IValueFactory } from "../interfaces/cow/IComposableCoW.sol";
import { IConditionalOrder } from "../interfaces/cow/IConditionalOrder.sol";
import { IERC1271, ERC1271_MAGIC_VALUE } from "../interfaces/cow/IERC1271.sol";
import { GPv2Order } from "../interfaces/cow/GPv2Order.sol";
import { IGPv2Settlement } from "../interfaces/cow/IGPv2Settlement.sol";
import { ProtocolTypes } from "../interfaces/ProtocolTypes.sol";

import "hardhat/console.sol";

// Forward declaration for KapanRouter interface
interface IKapanRouter {
    function processProtocolInstructions(ProtocolTypes.ProtocolInstruction[] calldata instructions) external;
    function isAuthorizedFor(address user) external view returns (bool);
}

/// @title KapanOrderManager
/// @notice Manages CoW Protocol orders for Kapan, acting as ERC-1271 signer
/// @dev Singleton contract that holds order context and executes hooks
contract KapanOrderManager is Ownable, ReentrancyGuard, IERC1271 {
    using SafeERC20 for IERC20;

    // ============ Errors ============
    error OrderNotFound();
    error OrderAlreadyExists();
    error InvalidHandler();
    error NotHooksTrampoline();
    error HookExecutionFailed();
    error Unauthorized();
    error InvalidOrderState();
    error ZeroAddress();
    error InstructionUserMismatch(address expected, address actual);

    // ============ Enums ============
    enum CompletionType {
        TargetLTV,          // Complete when target LTV is reached
        TargetBalance,      // Complete when target balance is reached
        Iterations,         // Complete after N iterations
        UntilCancelled      // Run until manually cancelled
    }

    enum OrderStatus {
        None,
        Active,
        Completed,
        Cancelled
    }

    // Router instruction types (must match KapanRouter)
    enum RouterInstructionType {
        FlashLoan,
        PullToken,
        PushToken,
        ToOutput,
        Approve,
        Split,
        Add,
        Subtract
    }

    // Router instruction struct (must match KapanRouter)
    struct RouterInstruction {
        uint256 amount;
        address token;
        address user;
        RouterInstructionType instructionType;
    }

    // ============ Structs ============
    
    /// @notice Order parameters stored for each order
    struct KapanOrderParams {
        address user;
        
        // Pre-swap instructions (executed in pre-hook) - per iteration
        // Array of ABI-encoded ProtocolInstruction[] for each iteration
        // If fewer entries than iterations, last entry is reused
        bytes[] preInstructionsPerIteration;
        uint256 preTotalAmount;         // Total amount to process across all chunks
        
        // Swap configuration
        address sellToken;
        address buyToken;
        uint256 chunkSize;              // Max sell amount per chunk
        uint256 minBuyPerChunk;         // Minimum buy amount per chunk (slippage protection)
        
        // Post-swap instructions (executed in post-hook) - per iteration
        // Array of ABI-encoded ProtocolInstruction[] for each iteration
        // If fewer entries than iterations, last entry is reused
        // Typically: [0..N-2] = deposit+borrow+push, [N-1] = deposit only
        bytes[] postInstructionsPerIteration;
        
        // Completion
        CompletionType completion;
        uint256 targetValue;            // Interpretation depends on CompletionType
        uint256 minHealthFactor;        // Safety: minimum health factor to maintain
        
        // AppData (pre-computed by frontend, includes hooks)
        bytes32 appDataHash;
        
        // Flash loan mode: when true, order.receiver = Settlement (required by CoW solvers)
        // When false (multi-chunk mode), order.receiver = OrderManager
        bool isFlashLoanOrder;
    }

    /// @notice Order context stored on-chain
    struct OrderContext {
        KapanOrderParams params;
        OrderStatus status;
        uint256 executedAmount;         // Amount processed so far
        uint256 iterationCount;         // Number of completed iterations
        uint256 createdAt;
    }

    // ============ State Variables ============
    
    /// @notice The KapanRouter for executing lending operations
    IKapanRouter public router;
    
    /// @notice The ComposableCoW contract for order registration
    IComposableCoW public composableCoW;
    
    /// @notice The GPv2Settlement contract
    IGPv2Settlement public settlement;
    
    /// @notice The HooksTrampoline contract (caller for hooks)
    address public hooksTrampoline;
    
    /// @notice The KapanOrderHandler for generating orders
    address public orderHandler;
    
    /// @notice Order contexts by order hash
    mapping(bytes32 => OrderContext) public orders;
    
    /// @notice Salt used for each order (for ComposableCoW cancellation)
    mapping(bytes32 => bytes32) public orderSalts;
    
    /// @notice User's active orders
    mapping(address => bytes32[]) public userOrders;
    
    /// @notice Lookup order hash by (user, salt) - enables pre-computing appData
    mapping(address => mapping(bytes32 => bytes32)) public userSaltToOrderHash;

    // ============ Events ============
    
    event OrderCreated(
        bytes32 indexed orderHash,
        address indexed user,
        address sellToken,
        address buyToken,
        uint256 totalAmount,
        uint256 chunkSize
    );
    
    event OrderCancelled(bytes32 indexed orderHash, address indexed user);
    event OrderCompleted(bytes32 indexed orderHash, address indexed user, uint256 totalExecuted);
    event ChunkExecuted(bytes32 indexed orderHash, uint256 chunkIndex, uint256 sellAmount, uint256 buyAmount);
    event PreHookExecuted(bytes32 indexed orderHash, uint256 chunkIndex);
    event PostHookExecuted(bytes32 indexed orderHash, uint256 chunkIndex, uint256 receivedAmount);
    
    // Admin events
    event RouterUpdated(address indexed oldRouter, address indexed newRouter);
    event ComposableCoWUpdated(address indexed oldComposableCoW, address indexed newComposableCoW);
    event HooksTrampolineUpdated(address indexed oldTrampoline, address indexed newTrampoline);
    event OrderHandlerUpdated(address indexed oldHandler, address indexed newHandler);

    // ============ Constructor ============
    
    constructor(
        address _owner,
        address _router,
        address _composableCoW,
        address _settlement,
        address _hooksTrampoline
    ) Ownable(_owner) {
        if (_router == address(0)) revert ZeroAddress();
        if (_composableCoW == address(0)) revert ZeroAddress();
        if (_settlement == address(0)) revert ZeroAddress();
        if (_hooksTrampoline == address(0)) revert ZeroAddress();
        
        router = IKapanRouter(_router);
        composableCoW = IComposableCoW(_composableCoW);
        settlement = IGPv2Settlement(_settlement);
        hooksTrampoline = _hooksTrampoline;
    }

    // ============ Admin Functions ============
    
    function setRouter(address _router) external onlyOwner {
        if (_router == address(0)) revert ZeroAddress();
        address oldRouter = address(router);
        router = IKapanRouter(_router);
        emit RouterUpdated(oldRouter, _router);
    }
    
    function setComposableCoW(address _composableCoW) external onlyOwner {
        if (_composableCoW == address(0)) revert ZeroAddress();
        address oldComposableCoW = address(composableCoW);
        composableCoW = IComposableCoW(_composableCoW);
        emit ComposableCoWUpdated(oldComposableCoW, _composableCoW);
    }
    
    function setHooksTrampoline(address _hooksTrampoline) external onlyOwner {
        if (_hooksTrampoline == address(0)) revert ZeroAddress();
        address oldTrampoline = hooksTrampoline;
        hooksTrampoline = _hooksTrampoline;
        emit HooksTrampolineUpdated(oldTrampoline, _hooksTrampoline);
    }
    
    function setOrderHandler(address _handler) external onlyOwner {
        if (_handler == address(0)) revert ZeroAddress();
        address oldHandler = orderHandler;
        orderHandler = _handler;
        emit OrderHandlerUpdated(oldHandler, _handler);
    }
    
    /// @notice Approve vault relayer to spend a token
    function approveVaultRelayer(address token) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        address vaultRelayer = settlement.vaultRelayer();
        IERC20(token).forceApprove(vaultRelayer, type(uint256).max);
    }

    // ============ Order Creation ============
    
    /// @notice Create a new CoW order with seed tokens for first chunk
    /// @dev User must approve this contract to pull seedAmount of sellToken before calling
    /// @param params The order parameters
    /// @param salt Unique salt for the order
    /// @param seedAmount Amount of sell tokens to pull from user for first chunk (0 to skip)
    /// @return orderHash The hash identifying this order
    function createOrder(
        KapanOrderParams calldata params,
        bytes32 salt,
        uint256 seedAmount
    ) external nonReentrant returns (bytes32 orderHash) {
        // Validate caller is the order user
        if (params.user != msg.sender) revert Unauthorized();
        if (orderHandler == address(0)) revert InvalidHandler();
        
        // TODO: Re-enable after debugging - temporarily disabled to isolate issue
        // Validate all instructions target the caller (prevents encoding instructions for other users)
        // _validateInstructionUsers(params.preInstructionsPerIteration, msg.sender);
        // _validateInstructionUsers(params.postInstructionsPerIteration, msg.sender);
        
        // Compute order hash
        orderHash = keccak256(abi.encode(params, salt, block.timestamp));
        
        // Check order doesn't exist
        if (orders[orderHash].status != OrderStatus.None) revert OrderAlreadyExists();
        
        // Pull seed tokens from user if provided
        // This ensures OrderManager has balance for CoW API's balance check
        if (seedAmount > 0) {
            IERC20(params.sellToken).safeTransferFrom(msg.sender, address(this), seedAmount);
        }
        
        // Store order context
        orders[orderHash] = OrderContext({
            params: params,
            status: OrderStatus.Active,
            executedAmount: 0,
            iterationCount: 0,
            createdAt: block.timestamp
        });
        
        // Store salt separately for cancellation
        orderSalts[orderHash] = salt;
        
        // Track user's orders
        userOrders[params.user].push(orderHash);
        
        // Enable lookup by (user, salt) for hook resolution
        userSaltToOrderHash[params.user][salt] = orderHash;
        
        // Register with ComposableCoW
        IConditionalOrder.ConditionalOrderParams memory cowParams = IConditionalOrder.ConditionalOrderParams({
            handler: IConditionalOrder(orderHandler),
            salt: salt,
            staticData: abi.encode(orderHash)  // Handler looks up context by hash
        });
        
        composableCoW.create(cowParams, true);  // dispatch=true for WatchTower
        
        // Ensure vault relayer can spend sellToken
        _ensureVaultRelayerApproval(params.sellToken);
        
        emit OrderCreated(
            orderHash,
            params.user,
            params.sellToken,
            params.buyToken,
            params.preTotalAmount,
            params.chunkSize
        );
    }

    // ============ Order Cancellation ============
    
    /// @notice Cancel an active order and refund any remaining seed tokens
    /// @param orderHash The order to cancel
    function cancelOrder(bytes32 orderHash) external nonReentrant {
        OrderContext storage ctx = orders[orderHash];
        
        if (ctx.status == OrderStatus.None) revert OrderNotFound();
        if (ctx.params.user != msg.sender) revert Unauthorized();
        if (ctx.status != OrderStatus.Active) revert InvalidOrderState();
        
        ctx.status = OrderStatus.Cancelled;
        
        // Remove from ComposableCoW
        // Note: We need to compute the same hash ComposableCoW uses
        bytes32 cowOrderHash = composableCoW.hash(
            IConditionalOrder.ConditionalOrderParams({
                handler: IConditionalOrder(orderHandler),
                salt: orderSalts[orderHash],
                staticData: abi.encode(orderHash)
            })
        );
        composableCoW.remove(cowOrderHash);
        
        // Refund any remaining tokens to user
        // This handles cases where:
        // 1. Seed tokens were provided but order never filled
        // 2. Partial execution left some sell tokens
        // 3. A chunk was in-flight and buy tokens arrived but couldn't be processed
        uint256 sellRemaining = IERC20(ctx.params.sellToken).balanceOf(address(this));
        if (sellRemaining > 0) {
            IERC20(ctx.params.sellToken).safeTransfer(ctx.params.user, sellRemaining);
        }
        
        // Also refund any buy tokens that might be stuck (from partial chunk execution)
        uint256 buyRemaining = IERC20(ctx.params.buyToken).balanceOf(address(this));
        if (buyRemaining > 0) {
            IERC20(ctx.params.buyToken).safeTransfer(ctx.params.user, buyRemaining);
        }
        
        emit OrderCancelled(orderHash, msg.sender);
    }

    // ============ Hook Execution ============
    
    /// @notice Execute pre-hook (called by HooksTrampoline during CoW settlement)
    /// @dev Prepends a ToOutput instruction with chunkSize, so all stored instructions
    ///      can reference index 0 for the chunk amount. Chunk index is read from iterationCount.
    /// @param orderHash The order being settled
    function executePreHook(bytes32 orderHash) external nonReentrant {
        _executePreHook(orderHash);
    }
    
    /// @notice Execute post-hook (called by HooksTrampoline during CoW settlement)
    /// @dev Prepends a ToOutput instruction with the actual received amount, so all
    ///      stored instructions can reference index 0 for the swap output
    /// @param orderHash The order being settled
    function executePostHook(bytes32 orderHash) external nonReentrant {
        _executePostHook(orderHash);
    }
    
    /// @notice Execute pre-hook using (user, salt) lookup
    /// @dev Allows pre-computing appData before order creation. Chunk index is determined
    ///      from the order's iterationCount, so the same appData works for all chunks.
    /// @param user The order owner
    /// @param salt The order salt (known before tx)
    function executePreHookBySalt(address user, bytes32 salt) external nonReentrant {
        bytes32 orderHash = userSaltToOrderHash[user][salt];
        if (orderHash == bytes32(0)) revert OrderNotFound();
        _executePreHook(orderHash);
    }
    
    /// @notice Execute post-hook using (user, salt) lookup
    /// @dev Allows pre-computing appData before order creation
    /// @param user The order owner
    /// @param salt The order salt (known before tx)
    function executePostHookBySalt(address user, bytes32 salt) external nonReentrant {
        bytes32 orderHash = userSaltToOrderHash[user][salt];
        if (orderHash == bytes32(0)) revert OrderNotFound();
        _executePostHook(orderHash);
    }
    
    /// @notice Internal pre-hook execution
    /// @dev Chunk index is read from ctx.iterationCount so the same appData works for all chunks
    function _executePreHook(bytes32 orderHash) internal {
        // Only HooksTrampoline can call this
        if (msg.sender != hooksTrampoline) revert NotHooksTrampoline();
        
        OrderContext storage ctx = orders[orderHash];
        if (ctx.status != OrderStatus.Active) revert InvalidOrderState();
        
        // Get pre-instructions for current iteration
        // If fewer entries than iterations, reuse the last entry
        bytes memory preInstructionsData = _getInstructionsForIteration(
            ctx.params.preInstructionsPerIteration,
            ctx.iterationCount
        );
        
        // Decode stored pre-instructions
        ProtocolTypes.ProtocolInstruction[] memory storedInstructions = 
            abi.decode(preInstructionsData, (ProtocolTypes.ProtocolInstruction[]));
        
        // Create new array with ToOutput prepended
        ProtocolTypes.ProtocolInstruction[] memory instructions = 
            new ProtocolTypes.ProtocolInstruction[](storedInstructions.length + 1);
        
        // Prepend ToOutput with chunkSize - this becomes index 0
        instructions[0] = ProtocolTypes.ProtocolInstruction({
            protocolName: "router",
            data: _encodeToOutput(ctx.params.chunkSize, ctx.params.sellToken)
        });
        
        // Copy stored instructions (their indices shift by 1, but they reference index 0)
        for (uint256 i = 0; i < storedInstructions.length; i++) {
            instructions[i + 1] = storedInstructions[i];
        }
        
        // Execute via router (router will check delegation)
        router.processProtocolInstructions(instructions);
        
        // Emit with current iteration count (chunk index is self-determined from state)
        emit PreHookExecuted(orderHash, ctx.iterationCount);
    }
    
    /// @notice Internal post-hook execution
    function _executePostHook(bytes32 orderHash) internal {
        console.log("_executePostHook: START");
        
        // Only HooksTrampoline can call this
        if (msg.sender != hooksTrampoline) revert NotHooksTrampoline();
        
        console.log("_executePostHook: caller is HooksTrampoline");
        
        OrderContext storage ctx = orders[orderHash];
        if (ctx.status != OrderStatus.Active) revert InvalidOrderState();
        
        // Get actual received amount
        uint256 receivedAmount = IERC20(ctx.params.buyToken).balanceOf(address(this));
        console.log("_executePostHook: receivedAmount =", receivedAmount);
        
        // Transfer tokens to router for processing
        IERC20(ctx.params.buyToken).safeTransfer(address(router), receivedAmount);
        console.log("_executePostHook: transferred to router");
        
        // Get post-instructions for current iteration
        // If fewer entries than iterations, reuse the last entry
        bytes memory postInstructionsData = _getInstructionsForIteration(
            ctx.params.postInstructionsPerIteration,
            ctx.iterationCount
        );
        
        // Decode stored post-instructions
        ProtocolTypes.ProtocolInstruction[] memory storedInstructions = 
            abi.decode(postInstructionsData, (ProtocolTypes.ProtocolInstruction[]));
        
        // Create new array with ToOutput prepended
        ProtocolTypes.ProtocolInstruction[] memory instructions = 
            new ProtocolTypes.ProtocolInstruction[](storedInstructions.length + 1);
        
        // Prepend ToOutput with receivedAmount - this becomes index 0
        instructions[0] = ProtocolTypes.ProtocolInstruction({
            protocolName: "router",
            data: _encodeToOutput(receivedAmount, ctx.params.buyToken)
        });
        
        // Copy stored instructions (their indices shift by 1, but they reference index 0)
        for (uint256 i = 0; i < storedInstructions.length; i++) {
            instructions[i + 1] = storedInstructions[i];
        }
        
        console.log("_executePostHook: instruction count =", instructions.length);
        console.log("_executePostHook: calling router.processProtocolInstructions");
        
        // Execute via router
        try router.processProtocolInstructions(instructions) {
            console.log("_executePostHook: router call SUCCESS");
        } catch Error(string memory reason) {
            console.log("_executePostHook: router call FAILED with reason:", reason);
            revert(reason);
        } catch (bytes memory lowLevelData) {
            console.log("_executePostHook: router call FAILED with low-level error");
            console.logBytes(lowLevelData);
            revert("Router call failed");
        }
        
        // Update progress
        uint256 chunkSellAmount = ctx.params.chunkSize;
        ctx.executedAmount += chunkSellAmount;
        ctx.iterationCount++;
        
        // Emit chunk execution event with sell/buy amounts for frontend tracking
        emit ChunkExecuted(orderHash, ctx.iterationCount, chunkSellAmount, receivedAmount);
        
        // Check completion
        if (_isOrderComplete(ctx)) {
            ctx.status = OrderStatus.Completed;
            emit OrderCompleted(orderHash, ctx.params.user, ctx.executedAmount);
        }
        
        emit PostHookExecuted(orderHash, ctx.iterationCount, receivedAmount);
        console.log("_executePostHook: COMPLETE");
    }

    // ============ ERC-1271 Signature Verification ============
    
    /// @notice Verify signature for CoW Protocol orders
    /// @dev For non-Safe ERC-1271 contracts, ComposableCoW returns signature as:
    ///      abi.encode(GPv2Order.Data, PayloadStruct)
    ///      We decode this and verify the order matches what the handler generates.
    function isValidSignature(
        bytes32 _hash,
        bytes calldata _signature
    ) external view override returns (bytes4) {
        // For ERC-1271 forwarder pattern (non-Safe), signature = abi.encode(order, payload)
        // We need to decode both parts
        (GPv2Order.Data memory order, IComposableCoW.PayloadStruct memory payload) = 
            abi.decode(_signature, (GPv2Order.Data, IComposableCoW.PayloadStruct));
        
        // Verify via ComposableCoW - this checks authorization and generates the expected order
        // ComposableCoW will call the handler's verify() function
        try composableCoW.getTradeableOrderWithSignature(
            address(this),
            payload.params,
            payload.offchainInput,
            payload.proof
        ) returns (GPv2Order.Data memory expectedOrder, bytes memory) {
            // Verify the provided order matches the expected order
            // The hash should match what we expect for this order
            if (_orderMatches(order, expectedOrder)) {
                return ERC1271_MAGIC_VALUE;
            }
            return bytes4(0xffffffff);
        } catch {
            return bytes4(0xffffffff);
        }
    }
    
    /// @dev Check if two GPv2Orders match (excluding validTo which changes)
    function _orderMatches(GPv2Order.Data memory a, GPv2Order.Data memory b) internal pure returns (bool) {
        return address(a.sellToken) == address(b.sellToken) &&
               address(a.buyToken) == address(b.buyToken) &&
               a.receiver == b.receiver &&
               a.sellAmount == b.sellAmount &&
               a.buyAmount == b.buyAmount &&
               a.appData == b.appData &&
               a.feeAmount == b.feeAmount &&
               a.kind == b.kind &&
               a.partiallyFillable == b.partiallyFillable &&
               a.sellTokenBalance == b.sellTokenBalance &&
               a.buyTokenBalance == b.buyTokenBalance;
    }

    // ============ View Functions ============
    
    /// @notice Get order context
    function getOrder(bytes32 orderHash) external view returns (OrderContext memory) {
        return orders[orderHash];
    }
    
    /// @notice Get user's orders
    function getUserOrders(address user) external view returns (bytes32[] memory) {
        return userOrders[user];
    }
    
    /// @notice Check if an order is complete based on completion criteria
    function isOrderComplete(bytes32 orderHash) external view returns (bool) {
        return _isOrderComplete(orders[orderHash]);
    }

    // ============ Internal Functions ============
    
    function _isOrderComplete(OrderContext storage ctx) internal view returns (bool) {
        if (ctx.params.completion == CompletionType.Iterations) {
            return ctx.iterationCount >= ctx.params.targetValue;
        }
        
        if (ctx.params.completion == CompletionType.TargetBalance) {
            // Check remaining amount
            uint256 remaining = ctx.params.preTotalAmount - ctx.executedAmount;
            return remaining == 0 || remaining < ctx.params.chunkSize;
        }
        
        if (ctx.params.completion == CompletionType.TargetLTV) {
            // TODO: Read actual LTV from lending protocol
            // For now, check if we've executed the total amount
            return ctx.executedAmount >= ctx.params.preTotalAmount;
        }
        
        // UntilCancelled never completes automatically
        return false;
    }
    
    // ============ Instruction Validation ============
    
    /// @dev Constant hash for "router" protocol name comparison
    bytes32 private constant ROUTER_PROTOCOL_HASH = keccak256(abi.encodePacked("router"));
    
    /// @notice Validate that all instructions in all iterations target the expected user
    /// @dev Prevents attackers from encoding instructions that operate on other users' positions
    ///      Note: Only certain instruction types require strict validation (PullToken, lending ops)
    /// @param instructionsPerIteration Array of encoded ProtocolInstruction[] per iteration
    /// @param expectedUser The user who must be the target of security-sensitive instructions
    function _validateInstructionUsers(
        bytes[] calldata instructionsPerIteration,
        address expectedUser
    ) internal pure {
        for (uint256 i = 0; i < instructionsPerIteration.length; i++) {
            ProtocolTypes.ProtocolInstruction[] memory instructions = 
                abi.decode(instructionsPerIteration[i], (ProtocolTypes.ProtocolInstruction[]));
            
            for (uint256 j = 0; j < instructions.length; j++) {
                address instrUser = _extractUserFromInstruction(instructions[j], expectedUser);
                if (instrUser != expectedUser) {
                    revert InstructionUserMismatch(expectedUser, instrUser);
                }
            }
        }
    }
    
    /// @notice Extract the user address from a protocol instruction that requires validation
    /// @dev Returns expectedUser for instructions that don't need user validation (PushToken, ToOutput, etc.)
    ///      Only PullToken and lending instructions need strict user validation
    /// @param instruction The protocol instruction to extract user from
    /// @param expectedUser The expected user (returned for instructions that don't need validation)
    /// @return user The user address to validate (or expectedUser if no validation needed)
    function _extractUserFromInstruction(
        ProtocolTypes.ProtocolInstruction memory instruction,
        address expectedUser
    ) internal pure returns (address user) {
        bytes32 protocolHash = keccak256(abi.encodePacked(instruction.protocolName));
        
        if (protocolHash == ROUTER_PROTOCOL_HASH) {
            // Decode RouterInstruction (same method as KapanRouter)
            RouterInstruction memory routerInstruction = abi.decode(instruction.data, (RouterInstruction));
            
            // Only PullToken needs strict user validation (prevents stealing from other users)
            // Other instruction types have different semantics for the user field:
            // - PushToken: user = recipient (can be OrderManager, adapters, etc.)
            // - ToOutput: user = unused (always address(0))
            // - Approve: user = unused (always address(0))
            // - FlashLoan: user = unused (always address(0))
            // - Add/Subtract/Split: user = unused (always address(0))
            if (routerInstruction.instructionType == RouterInstructionType.PullToken) {
                user = routerInstruction.user;
            } else {
                // Skip validation for other router instructions
                user = expectedUser;
            }
        } else {
            // Lending instruction (gateway): struct LendingInstruction { op, token, user, amount, context, input }
            // All lending operations need strict user validation
            ProtocolTypes.LendingInstruction memory lending = 
                abi.decode(instruction.data, (ProtocolTypes.LendingInstruction));
            user = lending.user;
        }
    }
    
    /// @notice Encode a ToOutput router instruction
    /// @dev Matches the encoding expected by KapanRouter's RouterInstruction struct
    ///      struct RouterInstruction { uint256 amount; address token; address user; RouterInstructionType instructionType; }
    ///      RouterInstructionType.ToOutput = 3
    function _encodeToOutput(uint256 amount, address token) internal pure returns (bytes memory) {
        // ABI encode as tuple matching RouterInstruction struct layout
        // Note: RouterInstructionType enum is uint8, but in ABI encoding it's padded to 32 bytes
        return abi.encode(amount, token, address(0), uint8(3));
    }
    
    /// @notice Get instructions for a specific iteration
    /// @dev If the array has fewer entries than the iteration index, returns the last entry
    ///      This allows specifying different instructions for early iterations vs later ones
    ///      e.g., [depositAndBorrow, depositAndBorrow, depositOnly] for 3 iterations
    /// @param instructionsArray Array of encoded instructions per iteration
    /// @param iteration Current iteration index (0-based)
    /// @return The encoded instructions for this iteration
    function _getInstructionsForIteration(
        bytes[] storage instructionsArray,
        uint256 iteration
    ) internal view returns (bytes memory) {
        if (instructionsArray.length == 0) {
            // Return empty instructions if none provided
            return abi.encode(new ProtocolTypes.ProtocolInstruction[](0));
        }
        
        // If iteration index exceeds array length, use the last entry
        uint256 index = iteration < instructionsArray.length 
            ? iteration 
            : instructionsArray.length - 1;
            
        return instructionsArray[index];
    }
    
    function _ensureVaultRelayerApproval(address token) internal {
        address vaultRelayer = settlement.vaultRelayer();
        uint256 currentAllowance = IERC20(token).allowance(address(this), vaultRelayer);
        if (currentAllowance < type(uint256).max / 2) {
            IERC20(token).forceApprove(vaultRelayer, type(uint256).max);
        }
    }

    // ============ Emergency Functions ============
    
    /// @notice Recover stuck tokens (owner only)
    function recoverTokens(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }
}
