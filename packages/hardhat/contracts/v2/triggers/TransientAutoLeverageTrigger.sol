// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IOrderTrigger } from "../interfaces/IOrderTrigger.sol";

/// @notice Morpho Blue MarketParams (mirror).
struct MarketParams {
    address loanToken;
    address collateralToken;
    address oracle;
    address irm;
    uint256 lltv;
}

interface IKapanViewRouter {
    function getCurrentLtv(bytes4 protocolId, address user, bytes calldata context) external view returns (uint256);
    function getPositionValue(bytes4 protocolId, address user, bytes calldata context) external view returns (uint256, uint256);
    function getCollateralPrice(bytes4 protocolId, address collateralToken, bytes calldata context) external view returns (uint256);
    function getDebtPrice(bytes4 protocolId, address debtToken, bytes calldata context) external view returns (uint256);
    function getMorphoOraclePrice(MarketParams calldata params) external view returns (uint256);
}

/// @notice Minimal slice of KapanConditionalOrderManager to read order params from `orderHash`.
interface IKapanConditionalOrderManager {
    enum OrderStatus { None, Active, Completed, Cancelled }

    struct KapanOrderParams {
        address user;
        address trigger;
        bytes triggerStaticData;
        bytes preInstructions;
        address sellToken;
        address buyToken;
        bytes postInstructions;
        bytes32 appDataHash;
        uint256 maxIterations;
        address sellTokenRefundAddress;
        bool isKindBuy;
    }

    struct OrderContext {
        KapanOrderParams params;
        OrderStatus status;
        uint256 iterationCount;
        uint256 createdAt;
    }

    function getOrder(bytes32 orderHash) external view returns (OrderContext memory);

    /// @notice (user, salt) → orderHash. We use this for the salt-based lookup variant of
    ///         `prepareCache` because the order's hash isn't known at the time the user signs
    ///         the appData (it depends on `block.timestamp` set inside `createOrder`).
    function userSaltToOrderHash(address user, bytes32 salt) external view returns (bytes32);
}

/// @title  TransientAutoLeverageTrigger
/// @notice Self-caching auto-leverage trigger. Same external semantics as `AutoLeverageTrigger`
///         (LTV-gated firing, dynamic per-iteration amounts based on live state) but stable
///         under state-mutating preInstructions thanks to a trigger-internal transient cache.
///
/// Why
/// ---
/// CoW's settle phases are fixed: pre-interactions run before sig validation, post-interactions
/// after. For protocols whose AL flow needs to mutate position state in the manager pre-hook
/// (e.g. Alchemix V3: deposit USDC + mint alAsset BEFORE CoW takes the sellToken), the on-chain
/// `calculateExecution` called inside `manager.isValidSignature` reads post-mutation state and
/// returns numbers that diverge from what the off-chain WatchTower signed → manager's
/// `_orderMatches` (1% tolerance) rejects → settlement reverts.
///
/// This trigger fixes it without touching the manager: it exposes a `prepareCache(orderHash)`
/// entry point invoked as a separate CoW pre-interaction by the hooks trampoline. That call
/// runs BEFORE the manager pre-hook (and therefore before any state mutation), reads the
/// order's params from the manager, runs the live computation, and stashes (sellAmount,
/// minBuyAmount) in transient storage keyed by `(staticData, owner, iter)`. The view-only
/// `calculateExecution` (called both by the manager's pre-hook and by the handler's sig-check
/// path) reads the cache when present and falls back to live computation otherwise.
///
/// Multi-iteration orders work transparently: each iteration's `prepareCache` re-reads fresh
/// chain state and writes a fresh cache entry. Transient storage auto-clears at tx end so
/// nothing leaks across transactions or across off-chain WatchTower polls.
///
/// Security
/// --------
/// - `prepareCache` is gated to the CoW HooksTrampoline OR the GPv2Settlement contract.
///   Settlement is allowed because the orderbook's balance simulation runs appData hooks
///   with `msg.sender == settlement` (delegatecall from Balances.sol). Both callers are
///   trusted CoW infrastructure; arbitrary EOAs/contracts still can't poison the cache.
/// - The cache key includes the full `staticData`, `owner`, and `iterationCount`, so distinct
///   orders / users / iterations get isolated transient slots — no cross-pollution possible
///   even when multiple orders settle in one batch.
/// - The view-only `calculateExecution` can `tload` the cache (allowed under STATICCALL) but
///   cannot write to it.
/// - Transient storage is per-transaction — cannot be replayed.
/// - The on-chain order's params are read from the manager via `getOrder(orderHash)`, which
///   is the same source the manager itself uses, so cache content can never disagree with
///   what `manager.calculateExecution` would compute against the same chain state.
///
/// Frontend integration
/// --------------------
/// The order's CoW appData needs to include THREE pre-interactions in this exact order:
///   [0] adapter.fundOrderWithBalance(user, salt, flashToken, router)   — flash funding
///   [1] trigger.prepareCacheBySalt(user, salt)                          — THIS contract
///   [2] manager.executePreHookBySalt(user, salt)                        — manager pre-hook
/// The trigger MUST come before the manager pre-hook so the cache is populated before
/// preInstructions mutate state.
contract TransientAutoLeverageTrigger is IOrderTrigger {
    // ============ Errors ============
    error InvalidParams();
    error NotTrampoline();

    // ============ Constants ============
    bytes4 public constant AAVE_V3 = bytes4(keccak256("aave-v3"));
    bytes4 public constant COMPOUND_V3 = bytes4(keccak256("compound-v3"));
    bytes4 public constant MORPHO_BLUE = bytes4(keccak256("morpho-blue"));
    bytes4 public constant EULER_V2 = bytes4(keccak256("euler-v2"));
    bytes4 public constant VENUS = bytes4(keccak256("venus"));

    // Transient slot prefixes — final slot = keccak256(prefix, cacheKey).
    bytes32 private constant CACHE_PRESENT_PREFIX = keccak256("kapan.transAL.present");
    bytes32 private constant CACHE_SELL_PREFIX = keccak256("kapan.transAL.sell");
    bytes32 private constant CACHE_BUY_PREFIX = keccak256("kapan.transAL.buy");

    // ============ Immutables ============
    IKapanViewRouter public immutable viewRouter;
    IKapanConditionalOrderManager public immutable orderManager;
    address public immutable hooksTrampoline;
    /// @notice GPv2Settlement contract. Permitted as a `prepareCacheBySalt` caller in addition
    ///         to the HooksTrampoline because the CoW orderbook's balance simulation
    ///         (Balances.sol, invoked via `simulateDelegatecall` from Settlement) executes
    ///         appData pre-interactions with `msg.sender == address(settlement)` — bypassing
    ///         the trampoline. Allowing Settlement here lets the simulator successfully
    ///         populate the transient cache so downstream hooks behave consistently.
    address public immutable settlement;

    // ============ Structs ============

    /// @notice Same shape as AutoLeverageTrigger.TriggerParams — drop-in compatible.
    struct TriggerParams {
        bytes4 protocolId;
        bytes protocolContext;
        uint256 triggerLtvBps;
        uint256 targetLtvBps;
        address collateralToken;
        address debtToken;
        uint8 collateralDecimals;
        uint8 debtDecimals;
        uint256 maxSlippageBps;
        uint8 numChunks;
    }

    // ============ Constructor ============

    constructor(
        address _viewRouter,
        address _orderManager,
        address _hooksTrampoline,
        address _settlement
    ) {
        if (
            _viewRouter == address(0) ||
            _orderManager == address(0) ||
            _hooksTrampoline == address(0) ||
            _settlement == address(0)
        ) {
            revert InvalidParams();
        }
        viewRouter = IKapanViewRouter(_viewRouter);
        orderManager = IKapanConditionalOrderManager(_orderManager);
        hooksTrampoline = _hooksTrampoline;
        settlement = _settlement;
    }

    // ============ Trampoline-driven cache writer ============

    /// @notice Snapshot the live `calculateExecution` output for the order owned by `user`
    ///         with `salt` into transient storage. Must be invoked as a CoW pre-interaction
    ///         BEFORE the manager pre-hook executes.
    /// @dev    Salt-based lookup (not orderHash) because at appData-signing time the orderHash
    ///         isn't known — it includes `block.timestamp` from inside `createOrder`. Salt is
    ///         user-chosen and known up front, so `prepareCacheBySalt(user, salt)` calldata is
    ///         signable. Restricted to the CoW hooks trampoline so arbitrary callers can't
    ///         poison the cache.
    function prepareCacheBySalt(address user, bytes32 salt) external {
        if (msg.sender != hooksTrampoline && msg.sender != settlement) revert NotTrampoline();

        bytes32 orderHash = orderManager.userSaltToOrderHash(user, salt);
        if (orderHash == bytes32(0)) return; // Solver supplied a salt with no order — no-op rather than revert.

        IKapanConditionalOrderManager.OrderContext memory ctx = orderManager.getOrder(orderHash);
        if (ctx.status != IKapanConditionalOrderManager.OrderStatus.Active) return;

        bytes memory staticData = ctx.params.triggerStaticData;
        (uint256 sellAmount, uint256 minBuyAmount) = _computeLiveMemory(staticData, ctx.params.user);

        bytes32 key = _cacheKey(staticData, ctx.params.user, ctx.iterationCount);
        bytes32 presentSlot = keccak256(abi.encodePacked(CACHE_PRESENT_PREFIX, key));
        bytes32 sellSlot = keccak256(abi.encodePacked(CACHE_SELL_PREFIX, key));
        bytes32 buySlot = keccak256(abi.encodePacked(CACHE_BUY_PREFIX, key));

        assembly {
            tstore(presentSlot, 1)
            tstore(sellSlot, sellAmount)
            tstore(buySlot, minBuyAmount)
        }
    }

    // ============ IOrderTrigger ============

    /// @inheritdoc IOrderTrigger
    /// @dev Reads live LTV — same semantics as AutoLeverageTrigger.
    function shouldExecute(
        bytes calldata staticData,
        address owner
    ) external view override returns (bool, string memory) {
        TriggerParams memory params = abi.decode(staticData, (TriggerParams));
        uint256 currentLtv = viewRouter.getCurrentLtv(params.protocolId, owner, params.protocolContext);

        if (currentLtv == 0) return (false, "No position");
        if (currentLtv < params.triggerLtvBps) return (true, "LTV below threshold - under-leveraged");
        return (false, "LTV above threshold");
    }

    /// @inheritdoc IOrderTrigger
    /// @dev Tries the transient cache first; falls back to live computation. Both paths
    ///      converge on the same answer when called within the same block — the cache only
    ///      meaningfully diverges from live when the pre-hook has mutated state, which is
    ///      exactly when we need it.
    function calculateExecution(
        bytes calldata staticData,
        address owner,
        uint256 iterationCount
    ) external view override returns (uint256 sellAmount, uint256 minBuyAmount) {
        bytes32 key = _cacheKey(staticData, owner, iterationCount);
        bytes32 presentSlot = keccak256(abi.encodePacked(CACHE_PRESENT_PREFIX, key));
        uint256 present;
        assembly { present := tload(presentSlot) }

        if (present != 0) {
            bytes32 sellSlot = keccak256(abi.encodePacked(CACHE_SELL_PREFIX, key));
            bytes32 buySlot = keccak256(abi.encodePacked(CACHE_BUY_PREFIX, key));
            assembly {
                sellAmount := tload(sellSlot)
                minBuyAmount := tload(buySlot)
            }
            return (sellAmount, minBuyAmount);
        }

        return _computeLive(staticData, owner);
    }

    /// @inheritdoc IOrderTrigger
    function isComplete(
        bytes calldata,
        address,
        uint256
    ) external pure override returns (bool) {
        return false;
    }

    /// @inheritdoc IOrderTrigger
    function triggerName() external pure override returns (string memory) {
        return "TransientAutoLeverage";
    }

    // ============ View Helpers ============

    function getCurrentLtv(bytes4 protocolId, address owner, bytes calldata context) external view returns (uint256) {
        return viewRouter.getCurrentLtv(protocolId, owner, context);
    }

    function encodeTriggerParams(TriggerParams memory params) external pure returns (bytes memory) {
        return abi.encode(params);
    }

    // ============ Internal ============

    function _cacheKey(bytes memory staticData, address owner, uint256 iterationCount)
        internal pure returns (bytes32)
    {
        return keccak256(abi.encode(staticData, owner, iterationCount));
    }

    /// @dev Live computation off `bytes calldata` (used by the read path).
    function _computeLive(bytes calldata staticData, address owner)
        internal view returns (uint256 sellAmount, uint256 minBuyAmount)
    {
        TriggerParams memory params = abi.decode(staticData, (TriggerParams));
        return _computeFromParams(params, owner);
    }

    /// @dev Live computation off `bytes memory` (used by the cache writer, which gets the
    ///      blob from the manager via `getOrder`).
    function _computeLiveMemory(bytes memory staticData, address owner)
        internal view returns (uint256 sellAmount, uint256 minBuyAmount)
    {
        TriggerParams memory params = abi.decode(staticData, (TriggerParams));
        return _computeFromParams(params, owner);
    }

    /// @dev Identical math to AutoLeverageTrigger.calculateExecution.
    function _computeFromParams(TriggerParams memory params, address owner)
        internal view returns (uint256 sellAmount, uint256 minBuyAmount)
    {
        (uint256 collateralValueUsd, uint256 debtValueUsd) = viewRouter.getPositionValue(
            params.protocolId,
            owner,
            params.protocolContext
        );

        if (collateralValueUsd == 0) return (0, 0);

        uint256 currentLtv = (debtValueUsd * 10000) / collateralValueUsd;
        if (currentLtv >= params.targetLtvBps) return (0, 0);

        uint256 targetDebtUsd = (params.targetLtvBps * collateralValueUsd) / 10000;
        if (targetDebtUsd <= debtValueUsd) return (0, 0);

        uint256 numerator = targetDebtUsd - debtValueUsd;
        uint256 denominator = 10000 - params.targetLtvBps;
        if (denominator == 0) return (0, 0);

        uint256 deltaDebtUsd = (numerator * 10000) / denominator;

        uint256 debtPrice = viewRouter.getDebtPrice(params.protocolId, params.debtToken, params.protocolContext);
        sellAmount = (deltaDebtUsd * (10 ** params.debtDecimals)) / debtPrice;

        uint8 chunks = params.numChunks > 0 ? params.numChunks : 1;
        if (chunks > 1) sellAmount = sellAmount / chunks;

        if (sellAmount == 0) return (0, 0);
        sellAmount = _truncatePrecision(sellAmount, params.debtDecimals);
        if (sellAmount == 0) return (0, 0);

        uint256 expectedCollateral;
        if (params.protocolId == MORPHO_BLUE) {
            MarketParams memory marketParams = abi.decode(params.protocolContext, (MarketParams));
            uint256 morphoOraclePrice = viewRouter.getMorphoOraclePrice(marketParams);
            if (morphoOraclePrice > 0) {
                expectedCollateral = (sellAmount * 1e36) / morphoOraclePrice;
            }
        } else {
            uint256 collateralPrice = viewRouter.getCollateralPrice(
                params.protocolId,
                params.collateralToken,
                params.protocolContext
            );
            if (collateralPrice > 0) {
                expectedCollateral = (sellAmount * debtPrice) / collateralPrice;
                expectedCollateral = (expectedCollateral * (10 ** params.collateralDecimals)) / (10 ** params.debtDecimals);
            }
        }

        expectedCollateral = _truncatePrecision(expectedCollateral, params.collateralDecimals);
        minBuyAmount = (expectedCollateral * (10000 - params.maxSlippageBps)) / 10000;
    }

    function _truncatePrecision(uint256 amount, uint8 decimals) internal pure returns (uint256) {
        if (decimals <= 4) return amount;
        uint256 keep;
        if (decimals > 12) keep = 5;
        else if (decimals > 6) keep = 6;
        else keep = 4;
        uint256 precision = 10 ** (decimals - keep);
        return (amount / precision) * precision;
    }
}
