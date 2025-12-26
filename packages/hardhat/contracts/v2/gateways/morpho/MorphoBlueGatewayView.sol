// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IMorphoBlue, MarketParams, Market, Position, MorphoLib } from "../../interfaces/morpho/IMorphoBlue.sol";

/**
 * @title MorphoBlueGatewayView
 * @notice View-only gateway for querying Morpho Blue positions
 * @dev Provides utility functions for reading user balances and market state
 */
contract MorphoBlueGatewayView {
    using MorphoLib for MarketParams;

    /// @notice The Morpho Blue singleton contract
    IMorphoBlue public immutable morpho;

    constructor(address morpho_) {
        require(morpho_ != address(0), "MorphoBlue: zero address");
        morpho = IMorphoBlue(morpho_);
    }

    /// @notice Get user's collateral balance in a market
    /// @param params The market parameters
    /// @param user The user address
    /// @return The collateral balance in underlying token units
    function getCollateralBalance(MarketParams calldata params, address user) external view returns (uint256) {
        bytes32 marketId = params.id();
        Position memory pos = morpho.position(marketId, user);
        return pos.collateral;
    }

    /// @notice Get user's borrow balance in a market (converts shares to assets)
    /// @param params The market parameters
    /// @param user The user address
    /// @return The borrow balance in underlying token units
    function getBorrowBalance(MarketParams calldata params, address user) external view returns (uint256) {
        bytes32 marketId = params.id();
        Position memory pos = morpho.position(marketId, user);

        if (pos.borrowShares == 0) return 0;

        Market memory mkt = morpho.market(marketId);
        if (mkt.totalBorrowShares == 0) return 0;

        return (uint256(pos.borrowShares) * uint256(mkt.totalBorrowAssets)) / uint256(mkt.totalBorrowShares);
    }

    /// @notice Get user's supply balance in a market (lender side, converts shares to assets)
    /// @param params The market parameters
    /// @param user The user address
    /// @return The supply balance in underlying token units
    function getSupplyBalance(MarketParams calldata params, address user) external view returns (uint256) {
        bytes32 marketId = params.id();
        Position memory pos = morpho.position(marketId, user);

        if (pos.supplyShares == 0) return 0;

        Market memory mkt = morpho.market(marketId);
        if (mkt.totalSupplyShares == 0) return 0;

        return (pos.supplyShares * uint256(mkt.totalSupplyAssets)) / uint256(mkt.totalSupplyShares);
    }

    /// @notice Get market state
    /// @param params The market parameters
    /// @return totalSupplyAssets Total assets supplied to the market
    /// @return totalBorrowAssets Total assets borrowed from the market
    /// @return utilizationRate The utilization rate (totalBorrow / totalSupply) in 18 decimals
    function getMarketState(
        MarketParams calldata params
    ) external view returns (uint256 totalSupplyAssets, uint256 totalBorrowAssets, uint256 utilizationRate) {
        bytes32 marketId = params.id();
        Market memory mkt = morpho.market(marketId);

        totalSupplyAssets = mkt.totalSupplyAssets;
        totalBorrowAssets = mkt.totalBorrowAssets;

        if (totalSupplyAssets > 0) {
            utilizationRate = (totalBorrowAssets * 1e18) / totalSupplyAssets;
        }
    }

    /// @notice Get user's full position in a market
    /// @param params The market parameters
    /// @param user The user address
    /// @return collateral The collateral balance
    /// @return borrowBalance The borrow balance (in assets)
    /// @return supplyBalance The supply balance (in assets, lender side)
    /// @return ltv The current loan-to-value ratio (borrow / collateral value) - requires oracle
    function getPosition(
        MarketParams calldata params,
        address user
    ) external view returns (uint256 collateral, uint256 borrowBalance, uint256 supplyBalance, uint256 ltv) {
        bytes32 marketId = params.id();
        Position memory pos = morpho.position(marketId, user);
        Market memory mkt = morpho.market(marketId);

        collateral = pos.collateral;

        if (pos.borrowShares > 0 && mkt.totalBorrowShares > 0) {
            borrowBalance = (uint256(pos.borrowShares) * uint256(mkt.totalBorrowAssets)) / uint256(mkt.totalBorrowShares);
        }

        if (pos.supplyShares > 0 && mkt.totalSupplyShares > 0) {
            supplyBalance = (pos.supplyShares * uint256(mkt.totalSupplyAssets)) / uint256(mkt.totalSupplyShares);
        }

        // LTV calculation requires oracle call - left as 0 for simplicity
        // In production, you'd call the oracle to get collateral/loan price ratio
        ltv = 0;
    }

    /// @notice Check if a user is authorized to act on behalf of another
    /// @param authorizer The user who grants authorization
    /// @param authorized The address being authorized
    /// @return Whether the address is authorized
    function isAuthorized(address authorizer, address authorized) external view returns (bool) {
        return morpho.isAuthorized(authorizer, authorized);
    }

    /// @notice Compute market ID from params
    /// @param params The market parameters
    /// @return The market ID (bytes32)
    function computeMarketId(MarketParams calldata params) external pure returns (bytes32) {
        return params.id();
    }
}

