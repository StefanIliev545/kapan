// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IComposableCoW } from "../interfaces/cow/IComposableCoW.sol";
import { IConditionalOrder } from "../interfaces/cow/IConditionalOrder.sol";
import { IERC1271, ERC1271_MAGIC_VALUE } from "../interfaces/cow/IERC1271.sol";
import { GPv2Order } from "../interfaces/cow/GPv2Order.sol";
import { IGPv2Settlement } from "../interfaces/cow/IGPv2Settlement.sol";
import { ProtocolTypes } from "../interfaces/ProtocolTypes.sol";
import { IOrderTrigger } from "../interfaces/IOrderTrigger.sol";

/// @title IKapanRouter
/// @dev Minimal interface for router
interface IKapanRouter {
    function processProtocolInstructions(ProtocolTypes.ProtocolInstruction[] calldata instructions) external;
    function isAuthorizedFor(address user) external view returns (bool);
}

/// @title KapanConditionalOrderManager
/// @notice Manages trigger-based conditional orders for Kapan (ADL, stop-loss, etc.)
/// @dev Uses separate KapanConditionalOrderHandler for IConditionalOrderGenerator.
///      This contract is the OWNER in ComposableCoW and handles ERC-1271 signature verification.
///      It intentionally does NOT implement IERC165 to avoid Safe/fallback handler detection.
///
/// Key differences from KapanOrderManager:
/// - Orders have pluggable triggers (IOrderTrigger) that determine when and how much to execute
/// - Amounts are calculated dynamically at execution time via trigger.calculateExecution()
/// - Instructions are templates that reference UTXO[0] for dynamic amounts
contract KapanConditionalOrderManager is Ownable, ReentrancyGuard, IERC1271 {
    using SafeERC20 for IERC20;

    // ============ Errors ============
    error OrderNotFound();
    error OrderAlreadyExists();
    error InvalidTrigger();
    error NotHooksTrampoline();
    error Unauthorized();
    error InvalidOrderState();
    error ZeroAddress();
    error InstructionUserMismatch(address expected, address actual);
    error PreHookAlreadyExecuted();
    error PreHookNotExecuted();
    error TriggerNotMet();
    error CannotCancelMidExecution();
    error NoTokensReceived();
    error InvalidTokens();
    error ValidToOverflow();
    error SaltAlreadyUsed();
    error MaxOrdersExceeded();

    // ============ Enums ============
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

    // ============ Structs ============

    /// @notice Order parameters for conditional orders
    /// @dev Named KapanOrderParams to avoid conflict with IConditionalOrder.ConditionalOrderParams
    struct KapanOrderParams {
        address user;

        // Trigger configuration
        address trigger;              // IOrderTrigger contract
        bytes triggerStaticData;      // Params passed to trigger.shouldExecute/calculateExecution

        // Pre-swap instructions (executed in pre-hook)
        // Instructions should reference UTXO[0] for the dynamic sellAmount
        bytes preInstructions;        // ABI-encoded ProtocolInstruction[]

        // Swap configuration
        address sellToken;
        address buyToken;

        // Post-swap instructions (executed in post-hook)
        // Instructions should reference UTXO[0] for the received buyAmount
        bytes postInstructions;       // ABI-encoded ProtocolInstruction[]

        // AppData (pre-computed by frontend, includes hooks)
        bytes32 appDataHash;

        // Max iterations (0 = unlimited until cancelled)
        uint256 maxIterations;

        // Address to refund remaining sellToken after post-hook (e.g., adapter for flash loan repayment)
        // If zero, no refund is sent (user must handle via post-instructions)
        address sellTokenRefundAddress;
    }

    /// @notice Order context stored on-chain
    struct OrderContext {
        KapanOrderParams params;
        OrderStatus status;
        uint256 iterationCount;       // Number of completed iterations
        uint256 createdAt;
    }

    // ============ Constants ============

    /// @notice Chunk window duration for deterministic validTo
    uint256 public constant CHUNK_WINDOW = 30 minutes;

    // ============ State Variables ============

    /// @notice The KapanRouter for executing lending operations (immutable)
    IKapanRouter public immutable router;

    /// @notice The ComposableCoW contract for order registration (immutable)
    IComposableCoW public immutable composableCoW;

    /// @notice The GPv2Settlement contract (immutable)
    IGPv2Settlement public immutable settlement;

    /// @notice The HooksTrampoline contract (caller for hooks) (immutable)
    address public immutable hooksTrampoline;

    /// @notice The KapanConditionalOrderHandler for generating orders
    address public orderHandler;

    /// @notice Order contexts by order hash
    mapping(bytes32 => OrderContext) public orders;

    /// @notice Salt used for each order (for ComposableCoW cancellation)
    mapping(bytes32 => bytes32) public orderSalts;

    /// @notice User's active orders
    mapping(address => bytes32[]) public userOrders;

    /// @notice Lookup order hash by (user, salt)
    mapping(address => mapping(bytes32 => bytes32)) public userSaltToOrderHash;

    /// @notice Track pre-hook execution per order
    mapping(bytes32 => uint256) public preHookExecutedForIteration;

    /// @notice Track balances at end of pre-hook for delta calculation
    mapping(bytes32 => uint256) public preHookSellBalance;
    mapping(bytes32 => uint256) public preHookBuyBalance;

    /// @notice Cached execution amounts (set before pre-hook, used in signature verification)
    /// This is needed because pre-hook may change protocol state (e.g., LTV),
    /// which would cause getTradeableOrder to return different amounts.
    mapping(bytes32 => uint256) public cachedSellAmount;
    mapping(bytes32 => uint256) public cachedBuyAmount;

    // ============ Security: Order Limits ============

    /// @notice Maximum orders per user to prevent storage DOS
    uint256 public constant MAX_ORDERS_PER_USER = 100;

    // ============ Events ============

    event ConditionalOrderCreated(
        bytes32 indexed orderHash,
        address indexed user,
        address trigger,
        address sellToken,
        address buyToken
    );

    event ConditionalOrderCancelled(bytes32 indexed orderHash, address indexed user);
    event ConditionalOrderCompleted(bytes32 indexed orderHash, address indexed user, uint256 iterations);
    event TriggerExecuted(bytes32 indexed orderHash, uint256 iteration, uint256 sellAmount, uint256 buyAmount);
    event PreHookExecuted(bytes32 indexed orderHash, uint256 iteration);
    event PostHookExecuted(bytes32 indexed orderHash, uint256 iteration, uint256 receivedAmount);

    // Admin events
    event VaultRelayerApproved(address indexed token, address indexed vaultRelayer);
    event TokensRecovered(address indexed token, address indexed to, uint256 amount);
    event StuckOrderReset(bytes32 indexed orderHash, address indexed user);
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

    /// @notice Approve vault relayer to spend tokens
    /// @param token Token to approve
    function approveVaultRelayer(address token) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        address vaultRelayer = settlement.vaultRelayer();
        IERC20(token).forceApprove(vaultRelayer, type(uint256).max);
        emit VaultRelayerApproved(token, vaultRelayer);
    }

    /// @notice Update the order handler address
    /// @param _orderHandler New order handler address
    function setOrderHandler(address _orderHandler) external onlyOwner {
        if (_orderHandler == address(0)) revert ZeroAddress();
        address oldHandler = orderHandler;
        orderHandler = _orderHandler;
        emit OrderHandlerUpdated(oldHandler, _orderHandler);
    }

    // ============ Order Creation ============

    /// @notice Create a new conditional order
    /// @param params The order parameters
    /// @param salt Unique salt for the order
    /// @return orderHash The hash identifying this order
    function createOrder(
        KapanOrderParams calldata params,
        bytes32 salt
    ) external nonReentrant returns (bytes32 orderHash) {
        if (params.user != msg.sender) revert Unauthorized();
        if (params.trigger == address(0)) revert InvalidTrigger();
        if (params.sellToken == address(0) || params.buyToken == address(0)) revert ZeroAddress();
        if (params.sellToken == params.buyToken) revert InvalidTokens();

        // Security: Prevent salt reuse
        if (userSaltToOrderHash[msg.sender][salt] != bytes32(0)) revert SaltAlreadyUsed();

        // Security: Limit orders per user to prevent storage DOS
        if (userOrders[msg.sender].length >= MAX_ORDERS_PER_USER) revert MaxOrdersExceeded();

        // Validate instructions target the calling user
        _validateInstructionUsers(params.preInstructions, msg.sender);
        _validateInstructionUsers(params.postInstructions, msg.sender);

        // Compute order hash
        orderHash = keccak256(abi.encode(params, salt, block.timestamp));

        if (orders[orderHash].status != OrderStatus.None) revert OrderAlreadyExists();

        // Store order context
        orders[orderHash] = OrderContext({
            params: params,
            status: OrderStatus.Active,
            iterationCount: 0,
            createdAt: block.timestamp
        });

        orderSalts[orderHash] = salt;
        userOrders[params.user].push(orderHash);
        userSaltToOrderHash[params.user][salt] = orderHash;

        // Register with ComposableCoW
        IConditionalOrder.ConditionalOrderParams memory cowParams = IConditionalOrder.ConditionalOrderParams({
            handler: IConditionalOrder(orderHandler),
            salt: salt,
            staticData: abi.encode(orderHash)
        });

        composableCoW.create(cowParams, true);

        // Ensure vault relayer can spend sellToken
        _ensureVaultRelayerApproval(params.sellToken);

        emit ConditionalOrderCreated(
            orderHash,
            params.user,
            params.trigger,
            params.sellToken,
            params.buyToken
        );
    }

    // ============ Order Cancellation ============

    /// @notice Cancel an active conditional order
    function cancelOrder(bytes32 orderHash) external nonReentrant {
        OrderContext storage ctx = orders[orderHash];

        if (ctx.status == OrderStatus.None) revert OrderNotFound();
        if (ctx.params.user != msg.sender) revert Unauthorized();
        if (ctx.status != OrderStatus.Active) revert InvalidOrderState();
        if (preHookExecutedForIteration[orderHash] != 0) revert CannotCancelMidExecution();

        ctx.status = OrderStatus.Cancelled;

        // Remove from ComposableCoW
        bytes32 cowOrderHash = composableCoW.hash(
            IConditionalOrder.ConditionalOrderParams({
                handler: IConditionalOrder(orderHandler),
                salt: orderSalts[orderHash],
                staticData: abi.encode(orderHash)
            })
        );
        composableCoW.remove(cowOrderHash);

        emit ConditionalOrderCancelled(orderHash, msg.sender);
    }

    // ============ Hook Execution ============

    /// @notice Execute pre-hook (called by HooksTrampoline)
    /// @param orderHash The order hash
    function executePreHook(bytes32 orderHash) external nonReentrant {
        if (msg.sender != hooksTrampoline) revert NotHooksTrampoline();
        _executePreHookInternal(orderHash);
    }

    /// @notice Execute pre-hook using (user, salt) lookup
    /// @param user The user address
    /// @param salt The order salt
    function executePreHookBySalt(address user, bytes32 salt) external nonReentrant {
        if (msg.sender != hooksTrampoline) revert NotHooksTrampoline();
        bytes32 orderHash = userSaltToOrderHash[user][salt];
        if (orderHash == bytes32(0)) revert OrderNotFound();
        _executePreHookInternal(orderHash);
    }

    /// @notice Execute post-hook (called by HooksTrampoline)
    /// @param orderHash The order hash
    function executePostHook(bytes32 orderHash) external nonReentrant {
        if (msg.sender != hooksTrampoline) revert NotHooksTrampoline();
        _executePostHookInternal(orderHash);
    }

    /// @notice Execute post-hook using (user, salt) lookup
    /// @param user The user address
    /// @param salt The order salt
    function executePostHookBySalt(address user, bytes32 salt) external nonReentrant {
        if (msg.sender != hooksTrampoline) revert NotHooksTrampoline();
        bytes32 orderHash = userSaltToOrderHash[user][salt];
        if (orderHash == bytes32(0)) revert OrderNotFound();
        _executePostHookInternal(orderHash);
    }

    /// @dev Internal pre-hook execution logic
    function _executePreHookInternal(bytes32 orderHash) internal {
        OrderContext storage ctx = orders[orderHash];
        if (ctx.status != OrderStatus.Active) revert InvalidOrderState();
        if (preHookExecutedForIteration[orderHash] != 0) revert PreHookAlreadyExecuted();

        // Cache params in memory for gas savings
        KapanOrderParams memory params = ctx.params;

        // Get sell/buy amounts from trigger BEFORE executing instructions
        // (instructions may change protocol state, affecting future calculations)
        IOrderTrigger trigger = IOrderTrigger(params.trigger);
        (uint256 sellAmount, uint256 minBuyAmount) = trigger.calculateExecution(params.triggerStaticData, params.user);

        // Cache amounts for signature verification (getTradeableOrder will use these)
        cachedSellAmount[orderHash] = sellAmount;
        cachedBuyAmount[orderHash] = minBuyAmount;

        // Mark pre-hook as executed
        preHookExecutedForIteration[orderHash] = ctx.iterationCount + 1;

        // Build and execute instructions
        ProtocolTypes.ProtocolInstruction[] memory instructions = _buildInstructions(
            params.preInstructions,
            sellAmount,
            params.sellToken
        );
        router.processProtocolInstructions(instructions);

        // Record balances for delta calculation
        preHookSellBalance[orderHash] = IERC20(params.sellToken).balanceOf(address(this));
        preHookBuyBalance[orderHash] = IERC20(params.buyToken).balanceOf(address(this));

        emit PreHookExecuted(orderHash, ctx.iterationCount);
    }

    /// @dev Internal post-hook execution logic
    function _executePostHookInternal(bytes32 orderHash) internal {
        OrderContext storage ctx = orders[orderHash];
        if (ctx.status != OrderStatus.Active) revert InvalidOrderState();
        if (preHookExecutedForIteration[orderHash] != ctx.iterationCount + 1) revert PreHookNotExecuted();

        // Cache params in memory for gas savings
        KapanOrderParams memory params = ctx.params;

        // Reset pre-hook flag
        preHookExecutedForIteration[orderHash] = 0;

        // Calculate deltas
        uint256 sellBefore = preHookSellBalance[orderHash];
        uint256 buyBefore = preHookBuyBalance[orderHash];
        uint256 sellAfter = IERC20(params.sellToken).balanceOf(address(this));
        uint256 buyAfter = IERC20(params.buyToken).balanceOf(address(this));

        delete preHookSellBalance[orderHash];
        delete preHookBuyBalance[orderHash];
        delete cachedSellAmount[orderHash];
        delete cachedBuyAmount[orderHash];

        uint256 actualSellAmount = sellBefore > sellAfter ? sellBefore - sellAfter : 0;
        uint256 actualBuyAmount = buyAfter > buyBefore ? buyAfter - buyBefore : 0;

        // Validate swap actually occurred
        if (actualBuyAmount == 0) revert NoTokensReceived();

        // Transfer buy tokens to router for post-instructions
        IERC20(params.buyToken).safeTransfer(address(router), actualBuyAmount);

        // Build and execute instructions with BOTH amounts available
        // UTXO[0] = actualSellAmount (for flash loan repayment via WithdrawCollateral)
        // UTXO[1] = actualBuyAmount (for debt repayment)
        ProtocolTypes.ProtocolInstruction[] memory instructions = _buildPostHookInstructions(
            params.postInstructions,
            actualSellAmount,
            params.sellToken,
            actualBuyAmount,
            params.buyToken
        );
        router.processProtocolInstructions(instructions);

        // Refund remaining sellToken to specified address (e.g., adapter for flash loan repayment)
        // This handles: leftover from flash loan + withdrawn collateral
        if (params.sellTokenRefundAddress != address(0)) {
            uint256 remainingSellToken = IERC20(params.sellToken).balanceOf(address(this));
            if (remainingSellToken > 0) {
                IERC20(params.sellToken).safeTransfer(params.sellTokenRefundAddress, remainingSellToken);
            }
        }

        // Update state
        ctx.iterationCount++;

        emit TriggerExecuted(orderHash, ctx.iterationCount, actualSellAmount, actualBuyAmount);
        emit PostHookExecuted(orderHash, ctx.iterationCount, actualBuyAmount);

        // Check completion: trigger says done OR max iterations reached
        IOrderTrigger trigger = IOrderTrigger(params.trigger);
        bool triggerComplete = trigger.isComplete(params.triggerStaticData, params.user, ctx.iterationCount);
        bool maxIterationsReached = params.maxIterations > 0 && ctx.iterationCount >= params.maxIterations;

        if (triggerComplete || maxIterationsReached) {
            ctx.status = OrderStatus.Completed;
            emit ConditionalOrderCompleted(orderHash, params.user, ctx.iterationCount);
        }
    }

    /// @dev Build instruction array with ToOutput prepended (for pre-hook)
    function _buildInstructions(
        bytes memory storedInstructionsData,
        uint256 amount,
        address token
    ) internal pure returns (ProtocolTypes.ProtocolInstruction[] memory instructions) {
        ProtocolTypes.ProtocolInstruction[] memory storedInstructions =
            abi.decode(storedInstructionsData, (ProtocolTypes.ProtocolInstruction[]));

        instructions = new ProtocolTypes.ProtocolInstruction[](storedInstructions.length + 1);

        instructions[0] = ProtocolTypes.ProtocolInstruction({
            protocolName: "router",
            data: _encodeToOutput(amount, token)
        });

        for (uint256 i = 0; i < storedInstructions.length; i++) {
            instructions[i + 1] = storedInstructions[i];
        }
    }

    /// @dev Build instruction array with TWO ToOutputs prepended (for post-hook)
    /// This provides both actualSellAmount and actualBuyAmount to post-instructions:
    /// - UTXO[0] = actualSellAmount (sellToken) - needed for WithdrawCollateral to repay flash loan
    /// - UTXO[1] = actualBuyAmount (buyToken) - the received tokens from swap
    function _buildPostHookInstructions(
        bytes memory storedInstructionsData,
        uint256 sellAmount,
        address sellToken,
        uint256 buyAmount,
        address buyToken
    ) internal pure returns (ProtocolTypes.ProtocolInstruction[] memory instructions) {
        ProtocolTypes.ProtocolInstruction[] memory storedInstructions =
            abi.decode(storedInstructionsData, (ProtocolTypes.ProtocolInstruction[]));

        instructions = new ProtocolTypes.ProtocolInstruction[](storedInstructions.length + 2);

        // UTXO[0] = actualSellAmount (for flash loan repayment calculations)
        instructions[0] = ProtocolTypes.ProtocolInstruction({
            protocolName: "router",
            data: _encodeToOutput(sellAmount, sellToken)
        });

        // UTXO[1] = actualBuyAmount (debt tokens received from swap)
        instructions[1] = ProtocolTypes.ProtocolInstruction({
            protocolName: "router",
            data: _encodeToOutput(buyAmount, buyToken)
        });

        for (uint256 i = 0; i < storedInstructions.length; i++) {
            instructions[i + 2] = storedInstructions[i];
        }
    }


    // ============ ERC-1271 Signature Verification ============

    function isValidSignature(
        bytes32 _hash,
        bytes calldata _signature
    ) external view override returns (bytes4) {
        (GPv2Order.Data memory order, IComposableCoW.PayloadStruct memory payload) =
            abi.decode(_signature, (GPv2Order.Data, IComposableCoW.PayloadStruct));

        bytes32 computedHash = GPv2Order.hash(order, settlement.domainSeparator());
        if (_hash != computedHash) {
            return bytes4(0); // ERC-1271 failure
        }

        try composableCoW.getTradeableOrderWithSignature(
            address(this),
            payload.params,
            payload.offchainInput,
            payload.proof
        ) returns (GPv2Order.Data memory expectedOrder, bytes memory) {
            if (_orderMatches(order, expectedOrder)) {
                return ERC1271_MAGIC_VALUE;
            }
            return bytes4(0); // Order mismatch
        } catch {
            return bytes4(0); // ComposableCoW call failed
        }
    }

    function _orderMatches(GPv2Order.Data memory a, GPv2Order.Data memory b) internal pure returns (bool) {
        // For dynamic orders, amounts may change slightly due to interest accrual.
        // Allow 1% (100 bps) tolerance on amounts.
        // Note: validTo is NOT checked (matches old KapanOrderManager behavior)
        return address(a.sellToken) == address(b.sellToken) &&
               address(a.buyToken) == address(b.buyToken) &&
               a.receiver == b.receiver &&
               _amountsWithinTolerance(a.sellAmount, b.sellAmount) &&
               _amountsWithinTolerance(a.buyAmount, b.buyAmount) &&
               a.appData == b.appData &&
               a.feeAmount == b.feeAmount &&
               a.kind == b.kind &&
               a.partiallyFillable == b.partiallyFillable &&
               a.sellTokenBalance == b.sellTokenBalance &&
               a.buyTokenBalance == b.buyTokenBalance;
    }

    /// @dev Check if two amounts are within 1% (100 bps) tolerance
    /// Note: Some tolerance is needed because:
    /// 1. Interest accrues between signature creation and verification
    /// 2. Slight rounding differences in trigger calculations
    /// The tolerance is kept tight (1%) to prevent solver exploitation.
    /// Pre-hook caches amounts before state changes, so larger tolerance shouldn't be needed.
    function _amountsWithinTolerance(uint256 a, uint256 b) internal pure returns (bool) {
        if (a == b) return true;
        uint256 larger = a > b ? a : b;
        uint256 diff = a > b ? a - b : b - a;
        // 100 bps = 1% = diff/larger < 1/100
        return diff * 100 <= larger;
    }

    // ============ View Functions ============

    function getOrder(bytes32 orderHash) external view returns (OrderContext memory) {
        return orders[orderHash];
    }

    function getUserOrders(address user) external view returns (bytes32[] memory) {
        return userOrders[user];
    }

    /// @notice Check if trigger condition is currently met
    function isTriggerMet(bytes32 orderHash) external view returns (bool shouldExecute, string memory reason) {
        OrderContext storage ctx = orders[orderHash];
        if (ctx.status != OrderStatus.Active) {
            return (false, "order_not_active");
        }

        IOrderTrigger trigger = IOrderTrigger(ctx.params.trigger);
        return trigger.shouldExecute(ctx.params.triggerStaticData, ctx.params.user);
    }

    /// @notice Get current execution amounts from trigger
    function getExecutionAmounts(bytes32 orderHash) external view returns (uint256 sellAmount, uint256 minBuyAmount) {
        OrderContext storage ctx = orders[orderHash];
        if (ctx.status != OrderStatus.Active) {
            return (0, 0);
        }

        IOrderTrigger trigger = IOrderTrigger(ctx.params.trigger);
        return trigger.calculateExecution(ctx.params.triggerStaticData, ctx.params.user);
    }

    // ============ Internal Functions ============

    function _calculateValidTo(uint256 createdAt, uint256 iterationCount) internal view returns (uint256 validTo) {
        uint256 chunkWindowStart = createdAt + (iterationCount * CHUNK_WINDOW);
        uint256 chunkWindowEnd = chunkWindowStart + CHUNK_WINDOW - 1;

        if (block.timestamp <= chunkWindowEnd) {
            validTo = chunkWindowEnd;
        } else {
            uint256 elapsedSinceCreate = block.timestamp - createdAt;
            uint256 currentWindowIndex = elapsedSinceCreate / CHUNK_WINDOW;
            validTo = createdAt + ((currentWindowIndex + 1) * CHUNK_WINDOW) - 1;
        }

        // Ensure safe cast to uint32 (GPv2Order requirement)
        if (validTo > type(uint32).max) revert ValidToOverflow();
    }

    function _encodeToOutput(uint256 amount, address token) internal pure returns (bytes memory) {
        return abi.encode(amount, token, address(0), uint8(3)); // RouterInstructionType.ToOutput = 3
    }

    function _validateInstructionUsers(bytes memory instructionsData, address expectedUser) internal pure {
        if (instructionsData.length == 0) return;

        ProtocolTypes.ProtocolInstruction[] memory instructions =
            abi.decode(instructionsData, (ProtocolTypes.ProtocolInstruction[]));

        bytes32 routerHash = keccak256(abi.encodePacked("router"));

        for (uint256 i = 0; i < instructions.length; i++) {
            bytes32 protocolHash = keccak256(abi.encodePacked(instructions[i].protocolName));

            if (protocolHash != routerHash) {
                // Lending instruction - validate user
                // Note: Unknown protocols will fail at router's _getGateway()
                ProtocolTypes.LendingInstruction memory lending =
                    abi.decode(instructions[i].data, (ProtocolTypes.LendingInstruction));
                if (lending.user != expectedUser) {
                    revert InstructionUserMismatch(expectedUser, lending.user);
                }
            }
        }
    }

    function _ensureVaultRelayerApproval(address token) internal {
        address vaultRelayer = settlement.vaultRelayer();
        uint256 currentAllowance = IERC20(token).allowance(address(this), vaultRelayer);
        if (currentAllowance < type(uint256).max / 2) {
            IERC20(token).forceApprove(vaultRelayer, type(uint256).max);
        }
    }

    // ============ Emergency Functions ============

    /// @notice Reset a stuck order where pre-hook executed but post-hook failed
    /// @dev Only use when an order is permanently stuck due to failed settlement
    /// @param orderHash The order hash to reset
    function resetStuckOrder(bytes32 orderHash) external onlyOwner {
        OrderContext storage ctx = orders[orderHash];
        if (ctx.status != OrderStatus.Active) revert InvalidOrderState();

        // Only reset if pre-hook was executed (order is stuck)
        if (preHookExecutedForIteration[orderHash] == 0) revert PreHookNotExecuted();

        // Clear the stuck state
        preHookExecutedForIteration[orderHash] = 0;
        delete preHookSellBalance[orderHash];
        delete preHookBuyBalance[orderHash];

        emit StuckOrderReset(orderHash, ctx.params.user);
    }

    /// @notice Recover tokens accidentally sent to this contract
    /// @param token Token address to recover
    /// @param to Recipient address
    /// @param amount Amount to recover
    function recoverTokens(address token, address to, uint256 amount) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
        emit TokensRecovered(token, to, amount);
    }
}
