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

    // ============ Structs ============
    
    /// @notice Order parameters stored for each order
    struct KapanOrderParams {
        address user;
        
        // Pre-swap instructions (executed in pre-hook)
        bytes preInstructionsData;      // ABI-encoded ProtocolInstruction[]
        uint256 preTotalAmount;         // Total amount to process across all chunks
        
        // Swap configuration
        address sellToken;
        address buyToken;
        uint256 chunkSize;              // Max sell amount per chunk
        uint256 minBuyPerChunk;         // Minimum buy amount per chunk (slippage protection)
        
        // Post-swap instructions (executed in post-hook)
        bytes postInstructionsData;     // ABI-encoded ProtocolInstruction[]
        
        // Completion
        CompletionType completion;
        uint256 targetValue;            // Interpretation depends on CompletionType
        uint256 minHealthFactor;        // Safety: minimum health factor to maintain
        
        // AppData (pre-computed by frontend, includes hooks)
        bytes32 appDataHash;
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

    // ============ Constructor ============
    
    constructor(
        address _owner,
        address _router,
        address _composableCoW,
        address _settlement,
        address _hooksTrampoline
    ) Ownable(_owner) {
        router = IKapanRouter(_router);
        composableCoW = IComposableCoW(_composableCoW);
        settlement = IGPv2Settlement(_settlement);
        hooksTrampoline = _hooksTrampoline;
        
        // Approve vault relayer to spend all tokens (will be set per-token as needed)
    }

    // ============ Admin Functions ============
    
    function setRouter(address _router) external onlyOwner {
        router = IKapanRouter(_router);
    }
    
    function setComposableCoW(address _composableCoW) external onlyOwner {
        composableCoW = IComposableCoW(_composableCoW);
    }
    
    function setHooksTrampoline(address _hooksTrampoline) external onlyOwner {
        hooksTrampoline = _hooksTrampoline;
    }
    
    function setOrderHandler(address _handler) external onlyOwner {
        orderHandler = _handler;
    }
    
    /// @notice Approve vault relayer to spend a token
    function approveVaultRelayer(address token) external onlyOwner {
        address vaultRelayer = settlement.vaultRelayer();
        IERC20(token).approve(vaultRelayer, type(uint256).max);
    }

    // ============ Order Creation ============
    
    /// @notice Create a new CoW order
    /// @param params The order parameters
    /// @param salt Unique salt for the order
    /// @return orderHash The hash identifying this order
    function createOrder(
        KapanOrderParams calldata params,
        bytes32 salt
    ) external nonReentrant returns (bytes32 orderHash) {
        // Validate
        if (params.user != msg.sender) revert Unauthorized();
        if (orderHandler == address(0)) revert InvalidHandler();
        
        // Compute order hash
        orderHash = keccak256(abi.encode(params, salt, block.timestamp));
        
        // Check order doesn't exist
        if (orders[orderHash].status != OrderStatus.None) revert OrderAlreadyExists();
        
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
    
    /// @notice Cancel an active order
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
        
        emit OrderCancelled(orderHash, msg.sender);
    }

    // ============ Hook Execution ============
    
    /// @notice Execute pre-hook (called by HooksTrampoline during CoW settlement)
    /// @dev Prepends a ToOutput instruction with chunkSize, so all stored instructions
    ///      can reference index 0 for the chunk amount
    /// @param orderHash The order being settled
    /// @param chunkIndex The current chunk index
    function executePreHook(bytes32 orderHash, uint256 chunkIndex) external nonReentrant {
        // Only HooksTrampoline can call this
        if (msg.sender != hooksTrampoline) revert NotHooksTrampoline();
        
        OrderContext storage ctx = orders[orderHash];
        if (ctx.status != OrderStatus.Active) revert InvalidOrderState();
        
        // Decode stored pre-instructions
        ProtocolTypes.ProtocolInstruction[] memory storedInstructions = 
            abi.decode(ctx.params.preInstructionsData, (ProtocolTypes.ProtocolInstruction[]));
        
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
        
        emit PreHookExecuted(orderHash, chunkIndex);
    }
    
    /// @notice Execute post-hook (called by HooksTrampoline during CoW settlement)
    /// @dev Prepends a ToOutput instruction with the actual received amount, so all
    ///      stored instructions can reference index 0 for the swap output
    /// @param orderHash The order being settled
    function executePostHook(bytes32 orderHash) external nonReentrant {
        // Only HooksTrampoline can call this
        if (msg.sender != hooksTrampoline) revert NotHooksTrampoline();
        
        OrderContext storage ctx = orders[orderHash];
        if (ctx.status != OrderStatus.Active) revert InvalidOrderState();
        
        // Get actual received amount
        uint256 receivedAmount = IERC20(ctx.params.buyToken).balanceOf(address(this));
        
        // Transfer tokens to router for processing
        IERC20(ctx.params.buyToken).safeTransfer(address(router), receivedAmount);
        
        // Decode stored post-instructions
        ProtocolTypes.ProtocolInstruction[] memory storedInstructions = 
            abi.decode(ctx.params.postInstructionsData, (ProtocolTypes.ProtocolInstruction[]));
        
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
        
        // Execute via router
        router.processProtocolInstructions(instructions);
        
        // Update progress
        ctx.executedAmount += ctx.params.chunkSize;
        ctx.iterationCount++;
        
        // Check completion
        if (_isOrderComplete(ctx)) {
            ctx.status = OrderStatus.Completed;
            emit OrderCompleted(orderHash, ctx.params.user, ctx.executedAmount);
        }
        
        emit PostHookExecuted(orderHash, ctx.iterationCount, receivedAmount);
    }

    // ============ ERC-1271 Signature Verification ============
    
    /// @notice Verify signature for CoW Protocol orders
    /// @dev Delegates to ComposableCoW for conditional order verification
    function isValidSignature(
        bytes32 _hash,
        bytes calldata _signature
    ) external view override returns (bytes4) {
        // Decode the payload
        IComposableCoW.PayloadStruct memory payload = abi.decode(_signature, (IComposableCoW.PayloadStruct));
        
        // Verify via ComposableCoW
        // ComposableCoW will call the handler's verify() function
        try composableCoW.getTradeableOrderWithSignature(
            address(this),
            payload.params,
            payload.offchainInput,
            payload.proof
        ) returns (GPv2Order.Data memory, bytes memory) {
            return ERC1271_MAGIC_VALUE;
        } catch {
            return bytes4(0xffffffff);
        }
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
    
    /// @notice Encode a ToOutput router instruction
    /// @dev Matches the encoding expected by KapanRouter's RouterInstruction struct
    ///      struct RouterInstruction { uint256 amount; address token; address user; RouterInstructionType instructionType; }
    ///      RouterInstructionType.ToOutput = 3
    function _encodeToOutput(uint256 amount, address token) internal pure returns (bytes memory) {
        // ABI encode as tuple matching RouterInstruction struct layout
        // Note: RouterInstructionType enum is uint8, but in ABI encoding it's padded to 32 bytes
        return abi.encode(amount, token, address(0), uint8(3));
    }
    
    function _ensureVaultRelayerApproval(address token) internal {
        address vaultRelayer = settlement.vaultRelayer();
        uint256 currentAllowance = IERC20(token).allowance(address(this), vaultRelayer);
        if (currentAllowance < type(uint256).max / 2) {
            IERC20(token).approve(vaultRelayer, type(uint256).max);
        }
    }

    // ============ Emergency Functions ============
    
    /// @notice Recover stuck tokens (owner only)
    function recoverTokens(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }
}
