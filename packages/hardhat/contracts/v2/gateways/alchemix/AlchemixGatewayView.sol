// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { IAaveOracle } from "@aave/core-v3/contracts/interfaces/IAaveOracle.sol";
import { IPoolAddressesProvider } from "../../../interfaces/aave/IPoolAddressesProvider.sol";
import { IAlchemistV3 } from "../../interfaces/alchemix/IAlchemistV3.sol";
import { AlchemixGatewayWrite } from "./AlchemixGatewayWrite.sol";

/**
 * @title  AlchemixGatewayView
 * @notice Read-side adapter for Alchemix V3 used by KapanViewRouter and downstream triggers
 *         (LimitPriceTrigger, LtvTrigger, AutoLeverageTrigger).
 *
 * Why a separate view contract
 * ----------------------------
 * Alchemix positions are NFT-shaped, not address-shaped. The shared trigger interfaces
 * (`getCurrentLtv`, `getPositionValue`, `getCollateralPrice`, …) take `(address user,
 * bytes context)` because every other supported lending protocol keys positions by user
 * address. For Alchemix we ignore `user` at the gateway-view boundary and key everything
 * by `(marketId, tokenId)` which the router decodes from `context` and forwards to us.
 *
 * Pricing model
 * -------------
 * - alAsset (debtToken) is treated as **face-value pegged to its underlying** (e.g. alUSD ↔ $1,
 *   alETH ↔ 1 WETH). This matches the alchemist's own minimumCollateralization invariant,
 *   which is enforced in face-value terms — the transmuter rebases alAsset to its underlying
 *   on a 1:1 basis. Trigger LTV math uses face-value, so we mirror that here.
 * - Collateral is held as MYT shares; its USD value is
 *   `convertYieldTokensToUnderlying(shares) * underlyingPriceUsd / 10^underlyingDecimals`.
 * - Underlying USD prices come from a configurable IAaveOracle (Aave's price oracle is the
 *   most reliable cross-chain source for the underlyings used by Alchemix markets — USDC, WETH,
 *   etc.). Switch the oracle by re-deploying; we keep it immutable for safety.
 *
 * Liquidation LTV
 * ---------------
 * `minimumCollateralization()` is alchemist's per-market collateralization floor expressed
 * as a 1e18 fixed-point (e.g. 1.111e18 → 90% face-value LTV cap). We invert it to bps.
 */
contract AlchemixGatewayView {
    // ============ Errors ============

    error MarketNotRegistered(uint256 marketId);
    error PriceUnavailable(address token);

    // ============ Immutable refs ============

    /// @notice The write gateway whose market registry we read from. Sharing this registry
    ///         ensures both contracts agree on the (alchemist, MYT, underlying, debtToken,
    ///         positionNFT) tuple per marketId, with no possibility of divergence from owners
    ///         registering markets in only one of the two.
    AlchemixGatewayWrite public immutable writeGateway;

    /// @notice Aave's PoolAddressesProvider — we read the live price oracle off it on each call,
    ///         matching the pattern used by AaveGatewayView. This makes oracle rotations on the
    ///         Aave side automatic without redeploying this view contract.
    IPoolAddressesProvider public immutable poolAddressesProvider;

    // ============ Constructor ============

    constructor(AlchemixGatewayWrite _writeGateway, IPoolAddressesProvider _poolAddressesProvider) {
        writeGateway = _writeGateway;
        poolAddressesProvider = _poolAddressesProvider;
    }

    // ============ Internal helpers ============

    function _market(uint256 marketId) internal view returns (
        address alchemist,
        address myt,
        address underlying,
        address debtToken,
        address positionNft
    ) {
        // Mapping getter returns the full struct including the trailing `bool active` flag.
        (alchemist, myt, underlying, debtToken, positionNft, ) = writeGateway.markets(marketId);
        if (alchemist == address(0)) revert MarketNotRegistered(marketId);
    }

    function _scaleTo8(uint256 value, uint8 fromDecimals) internal pure returns (uint256) {
        if (fromDecimals == 8) return value;
        if (fromDecimals > 8) return value / (10 ** (fromDecimals - 8));
        return value * (10 ** (8 - fromDecimals));
    }

    /// @dev Snap an underlying-token amount down to a stable grid that filters out per-block
    ///      MYT yield drift. Without this, every block the alchemist's
    ///      `convertYieldTokensToUnderlying(shares)` returns a fractionally-different value,
    ///      which propagates through trigger.calculateExecution and produces a fresh CoW order
    ///      every poll (different sellAmount -> different orderHash -> orderbook spam).
    ///
    ///      We keep 4 significant decimals worth of precision regardless of the token's native
    ///      decimals (so $0.0001 for 6-dec stables, 0.0001 ETH for 18-dec WETH), matching the
    ///      precision philosophy AutoLeverageTrigger / LtvTrigger already use one layer down.
    function _snapUnderlying(uint256 amount, uint8 underlyingDec) internal pure returns (uint256) {
        if (underlyingDec <= 4) return amount;
        uint256 grid = 10 ** (underlyingDec - 4);
        return (amount / grid) * grid;
    }

    /// @dev Snap an 8-decimal USD value to whole cents (1e6 in 8-dec USD). $0.01 is the
    ///      coarsest stability grid you can pick before triggers' downstream truncation
    ///      starts mattering for small positions; on large ones it still gives many minutes
    ///      of stability against MYT yield accrual.
    function _snapUsd8(uint256 value) internal pure returns (uint256) {
        return (value / 1e6) * 1e6;
    }

    function _underlyingPriceUsd8(address underlying) internal view returns (uint256) {
        // IAaveOracle returns prices in `BASE_CURRENCY_UNIT` decimals — Aave V3 uses USD (8 dec)
        // by default on every chain Kapan supports. If a chain ever wires a different base
        // currency, this layer needs an additional conversion — for now we trust 8-dec.
        IAaveOracle aaveOracle = IAaveOracle(poolAddressesProvider.getPriceOracle());
        uint256 price = aaveOracle.getAssetPrice(underlying);
        if (price == 0) revert PriceUnavailable(underlying);
        return price;
    }

    // ============ Public reads — keyed by (marketId, tokenId) ============

    /// @notice Current face-value LTV in bps for an Alchemix position.
    /// @dev    LTV = debt_face_value / collateral_underlying_value, both expressed in
    ///         the underlying token's decimals. We collapse via USD-8 to be consistent
    ///         with the rest of KapanViewRouter, but for stable underlyings the answer
    ///         is invariant to the price chosen.
    function getCurrentLtvBps(uint256 marketId, uint256 tokenId) public view returns (uint256) {
        (address alchemist, , address underlying, address debtToken, ) = _market(marketId);
        IAlchemistV3 a = IAlchemistV3(alchemist);
        (uint256 collateralShares, uint256 debt, ) = a.getCDP(tokenId);
        if (collateralShares == 0) return 0;

        uint8 underlyingDec = IERC20Metadata(underlying).decimals();
        uint8 debtDec = IERC20Metadata(debtToken).decimals();

        // Snap the (yielding) underlying value to a stable grid so per-block pps creep does not
        // change the trigger's view of LTV. See `_snapUnderlying` for rationale.
        uint256 collateralUnderlying = _snapUnderlying(a.convertYieldTokensToUnderlying(collateralShares), underlyingDec);
        if (collateralUnderlying == 0) return 0;

        // alAsset is face-value pegged to underlying. Cross both into the same "scaled to underlying-decimals"
        // basis to compare without an external oracle for the LTV ratio itself.
        uint256 debtInUnderlyingUnits = debtDec == underlyingDec
            ? debt
            : (debtDec > underlyingDec
                ? debt / (10 ** (debtDec - underlyingDec))
                : debt * (10 ** (underlyingDec - debtDec)));
        // Same stability snap on the debt side — earmarked debt drift would otherwise nudge LTV
        // every transmuter tick.
        debtInUnderlyingUnits = _snapUnderlying(debtInUnderlyingUnits, underlyingDec);

        return (debtInUnderlyingUnits * 10000) / collateralUnderlying;
    }

    /// @notice Liquidation LTV (the alchemist's minimumCollateralization floor) in bps.
    /// @dev    minimumCollateralization is 1e18 fixed-point: 1.111e18 → ~90% face-value LTV cap.
    function getLiquidationLtvBps(uint256 marketId) external view returns (uint256) {
        (address alchemist, , , , ) = _market(marketId);
        uint256 minColl = IAlchemistV3(alchemist).minimumCollateralization();
        if (minColl == 0) return 0;
        return (10000 * 1e18) / minColl;
    }

    /// @notice Position value in 8-decimal USD.
    /// @return collateralValueUsd Underlying value of MYT collateral, priced via oracle.
    /// @return debtValueUsd       Face-value debt priced as underlying (alAsset peg).
    function getPositionValue(uint256 marketId, uint256 tokenId)
        public
        view
        returns (uint256 collateralValueUsd, uint256 debtValueUsd)
    {
        (address alchemist, , address underlying, address debtToken, ) = _market(marketId);
        IAlchemistV3 a = IAlchemistV3(alchemist);
        (uint256 collateralShares, uint256 debt, ) = a.getCDP(tokenId);

        uint256 underlyingPrice = _underlyingPriceUsd8(underlying);
        uint8 underlyingDec = IERC20Metadata(underlying).decimals();
        uint8 debtDec = IERC20Metadata(debtToken).decimals();

        if (collateralShares > 0) {
            uint256 collateralUnderlying = a.convertYieldTokensToUnderlying(collateralShares);
            // Snap the underlying amount BEFORE the price multiply so MYT yield creep at the
            // wei level can't propagate into the USD-8 output.
            collateralUnderlying = _snapUnderlying(collateralUnderlying, underlyingDec);
            collateralValueUsd = (collateralUnderlying * underlyingPrice) / (10 ** underlyingDec);
            // And finally snap the USD value itself to whole cents — guards against tiny oracle
            // price flickers that would otherwise wiggle the value across the boundary.
            collateralValueUsd = _snapUsd8(collateralValueUsd);
        }
        if (debt > 0) {
            // Face-value peg: alAsset USD price == underlying USD price.
            debtValueUsd = (debt * underlyingPrice) / (10 ** debtDec);
            debtValueUsd = _snapUsd8(debtValueUsd);
        }
    }

    /// @notice 8-decimal USD price for an Alchemix-known token.
    /// @dev    Underlying & alAsset both price as the underlying (face-value peg). MYT prices
    ///         as `pps * underlyingPrice` via the alchemist's own conversion.
    function getAssetPrice(uint256 marketId, address token) external view returns (uint256) {
        (address alchemist, address myt, address underlying, address debtToken, ) = _market(marketId);
        if (token == underlying || token == debtToken) {
            return _underlyingPriceUsd8(underlying);
        }
        if (token == myt) {
            uint256 oneShare = 10 ** IERC20Metadata(myt).decimals();
            uint256 underlyingPerShare = IAlchemistV3(alchemist).convertYieldTokensToUnderlying(oneShare);
            uint256 underlyingPrice = _underlyingPriceUsd8(underlying);
            return (underlyingPerShare * underlyingPrice) / (10 ** IERC20Metadata(underlying).decimals());
        }
        revert PriceUnavailable(token);
    }
}
