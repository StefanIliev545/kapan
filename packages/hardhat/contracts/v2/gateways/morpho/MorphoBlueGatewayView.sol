// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IMorphoBlue, MarketParams, Market, Position, MorphoLib } from "../../interfaces/morpho/IMorphoBlue.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Interface for Morpho Blue oracles
/// @dev Returns price as collateralToken/loanToken with 36 decimals of precision
interface IMorphoOracle {
    function price() external view returns (uint256);
}

/// @notice Interface for Morpho Blue Interest Rate Models
interface IMorphoIrm {
    /// @notice Returns the borrow rate per second (scaled to 1e18)
    function borrowRateView(MarketParams memory marketParams, Market memory market) external view returns (uint256);
}

/**
 * @title MorphoBlueGatewayView
 * @notice View-only gateway for querying Morpho Blue positions and market data
 * @dev Provides utility functions for reading user balances, market state, and risk parameters
 *      Designed for frontend parity with Aave/Compound view gateways
 */
contract MorphoBlueGatewayView is Ownable {
    using MorphoLib for MarketParams;

    /// @notice The Morpho Blue singleton contract
    IMorphoBlue public immutable morpho;

    /// @notice Registry of known markets for enumeration
    bytes32[] private _registeredMarketIds;
    mapping(bytes32 => MarketParams) private _marketParams;
    mapping(bytes32 => bool) private _isRegistered;

    /// @notice Struct for returning comprehensive market info (similar to Aave's TokenInfo)
    struct MarketInfo {
        bytes32 marketId;
        address loanToken;
        address collateralToken;
        string loanSymbol;
        string collateralSymbol;
        uint8 loanDecimals;
        uint8 collateralDecimals;
        uint256 lltv;                  // Max LTV in 18 decimals (e.g., 0.86e18 = 86%)
        uint256 totalSupplyAssets;     // Total supplied to market
        uint256 totalBorrowAssets;     // Total borrowed from market
        uint256 utilizationRate;       // Utilization in 18 decimals
        uint256 borrowRate;            // Borrow APR in 18 decimals (per second * seconds per year)
        uint256 supplyRate;            // Supply APR in 18 decimals
        uint256 oraclePrice;           // Oracle price (collateral/loan, 36 decimals)
    }

    /// @notice Struct for user position in a market
    struct UserPosition {
        bytes32 marketId;
        address loanToken;
        address collateralToken;
        uint256 collateralBalance;     // Collateral in underlying units
        uint256 borrowBalance;         // Borrow debt in underlying units
        uint256 supplyBalance;         // Supply balance (lender side) in underlying units
        uint256 collateralValueUsd;    // Collateral value (scaled to loan token decimals for comparison)
        uint256 borrowValueUsd;        // Borrow value (in loan token units)
        uint256 currentLtv;            // Current LTV in 18 decimals
        uint256 maxLtv;                // Max LTV (LLTV) in 18 decimals
        uint256 healthFactor;          // Health factor in 18 decimals (1e18 = 1.0)
        bool isHealthy;                // Whether position is above liquidation threshold
    }

    /// @notice Reserve config data (similar to Aave's ReserveConfigData)
    struct MarketConfigData {
        bytes32 marketId;
        address loanToken;
        address collateralToken;
        uint256 lltv;                  // Max LTV in 18 decimals
        uint256 oraclePrice;           // Oracle price
        uint8 loanDecimals;
        uint8 collateralDecimals;
        bool isActive;                 // Whether market has any supply
    }

    event MarketRegistered(bytes32 indexed marketId, address loanToken, address collateralToken);
    event MarketRemoved(bytes32 indexed marketId);

    constructor(address morpho_, address owner_) Ownable(owner_) {
        require(morpho_ != address(0), "MorphoBlue: zero address");
        morpho = IMorphoBlue(morpho_);
    }

    // ============ Market Registry ============

    /// @notice Register a market for enumeration
    function registerMarket(MarketParams calldata params) external onlyOwner {
        bytes32 marketId = params.id();
        require(!_isRegistered[marketId], "MorphoBlue: already registered");
        
        _registeredMarketIds.push(marketId);
        _marketParams[marketId] = params;
        _isRegistered[marketId] = true;
        
        emit MarketRegistered(marketId, params.loanToken, params.collateralToken);
    }

    /// @notice Register multiple markets at once
    function registerMarkets(MarketParams[] calldata paramsList) external onlyOwner {
        for (uint256 i = 0; i < paramsList.length; i++) {
            bytes32 marketId = paramsList[i].id();
            if (!_isRegistered[marketId]) {
                _registeredMarketIds.push(marketId);
                _marketParams[marketId] = paramsList[i];
                _isRegistered[marketId] = true;
                emit MarketRegistered(marketId, paramsList[i].loanToken, paramsList[i].collateralToken);
            }
        }
    }

    /// @notice Get all registered market IDs
    function getRegisteredMarketIds() external view returns (bytes32[] memory) {
        return _registeredMarketIds;
    }

    /// @notice Get market params by ID
    function getMarketParams(bytes32 marketId) external view returns (MarketParams memory) {
        require(_isRegistered[marketId], "MorphoBlue: not registered");
        return _marketParams[marketId];
    }

    /// @notice Check if a market is registered
    function isMarketRegistered(bytes32 marketId) external view returns (bool) {
        return _isRegistered[marketId];
    }

    // ============ Single Market Queries ============

    /// @notice Get user's collateral balance in a market
    function getCollateralBalance(MarketParams calldata params, address user) external view returns (uint256) {
        bytes32 marketId = params.id();
        Position memory pos = morpho.position(marketId, user);
        return pos.collateral;
    }

    /// @notice Get user's borrow balance in a market (converts shares to assets)
    function getBorrowBalance(MarketParams calldata params, address user) external view returns (uint256) {
        bytes32 marketId = params.id();
        Position memory pos = morpho.position(marketId, user);

        if (pos.borrowShares == 0) return 0;

        Market memory mkt = morpho.market(marketId);
        if (mkt.totalBorrowShares == 0) return 0;

        return (uint256(pos.borrowShares) * uint256(mkt.totalBorrowAssets)) / uint256(mkt.totalBorrowShares);
    }

    /// @notice Get user's supply balance in a market (lender side, converts shares to assets)
    function getSupplyBalance(MarketParams calldata params, address user) external view returns (uint256) {
        bytes32 marketId = params.id();
        Position memory pos = morpho.position(marketId, user);

        if (pos.supplyShares == 0) return 0;

        Market memory mkt = morpho.market(marketId);
        if (mkt.totalSupplyShares == 0) return 0;

        return (pos.supplyShares * uint256(mkt.totalSupplyAssets)) / uint256(mkt.totalSupplyShares);
    }

    /// @notice Get market state
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

    /// @notice Get oracle price for a market
    /// @dev Returns price as collateral/loan with 36 decimals
    function getOraclePrice(MarketParams calldata params) external view returns (uint256) {
        if (params.oracle == address(0)) return 0;
        try IMorphoOracle(params.oracle).price() returns (uint256 p) {
            return p;
        } catch {
            return 0;
        }
    }

    /// @notice Get borrow rate for a market (per second, scaled to 1e18)
    function getBorrowRate(MarketParams calldata params) external view returns (uint256) {
        if (params.irm == address(0)) return 0;
        
        bytes32 marketId = params.id();
        Market memory mkt = morpho.market(marketId);
        
        try IMorphoIrm(params.irm).borrowRateView(params, mkt) returns (uint256 rate) {
            return rate;
        } catch {
            return 0;
        }
    }

    /// @notice Get borrow APR for a market (annualized, scaled to 1e18)
    function getBorrowApr(MarketParams calldata params) external view returns (uint256) {
        uint256 ratePerSecond = this.getBorrowRate(params);
        // APR = rate per second * seconds per year
        return ratePerSecond * 365 days;
    }

    /// @notice Get supply APR for a market (annualized, scaled to 1e18)
    /// @dev Supply APR = Borrow APR * Utilization * (1 - fee)
    function getSupplyApr(MarketParams calldata params) external view returns (uint256) {
        bytes32 marketId = params.id();
        Market memory mkt = morpho.market(marketId);
        
        if (mkt.totalSupplyAssets == 0) return 0;
        
        uint256 borrowApr = this.getBorrowApr(params);
        uint256 utilization = (uint256(mkt.totalBorrowAssets) * 1e18) / uint256(mkt.totalSupplyAssets);
        uint256 feeRate = mkt.fee; // Fee is in 18 decimals
        
        // Supply APR = Borrow APR * Utilization * (1 - fee)
        return (borrowApr * utilization * (1e18 - feeRate)) / 1e18 / 1e18;
    }

    // ============ User Position Queries ============

    /// @notice Get user's full position in a market with risk metrics
    function getPosition(
        MarketParams calldata params,
        address user
    ) external view returns (UserPosition memory pos) {
        bytes32 marketId = params.id();
        Position memory rawPos = morpho.position(marketId, user);
        Market memory mkt = morpho.market(marketId);

        pos.marketId = marketId;
        pos.loanToken = params.loanToken;
        pos.collateralToken = params.collateralToken;
        pos.collateralBalance = rawPos.collateral;
        pos.maxLtv = params.lltv;

        // Convert shares to assets
        if (rawPos.borrowShares > 0 && mkt.totalBorrowShares > 0) {
            pos.borrowBalance = (uint256(rawPos.borrowShares) * uint256(mkt.totalBorrowAssets)) / uint256(mkt.totalBorrowShares);
        }

        if (rawPos.supplyShares > 0 && mkt.totalSupplyShares > 0) {
            pos.supplyBalance = (rawPos.supplyShares * uint256(mkt.totalSupplyAssets)) / uint256(mkt.totalSupplyShares);
        }

        // Calculate LTV and health factor using oracle
        if (params.oracle != address(0) && pos.collateralBalance > 0) {
            try IMorphoOracle(params.oracle).price() returns (uint256 oraclePrice) {
                // Morpho oracle price is already scaled by 10^(36 + loanDecimals - collateralDecimals)
                // So we only need to divide by 1e36 to get collateral value in loan token units
                uint256 collateralValue = (pos.collateralBalance * oraclePrice) / 1e36;

                pos.collateralValueUsd = collateralValue;
                pos.borrowValueUsd = pos.borrowBalance;

                if (collateralValue > 0) {
                    // Current LTV = borrow / collateralValue
                    pos.currentLtv = (pos.borrowBalance * 1e18) / collateralValue;
                    
                    // Health Factor = (collateralValue * LLTV) / borrow
                    if (pos.borrowBalance > 0) {
                        pos.healthFactor = (collateralValue * params.lltv) / pos.borrowBalance;
                        pos.isHealthy = pos.healthFactor >= 1e18;
                    } else {
                        pos.healthFactor = type(uint256).max;
                        pos.isHealthy = true;
                    }
                }
            } catch {
                // Oracle failed, leave values as 0
            }
        } else if (pos.borrowBalance == 0) {
            pos.healthFactor = type(uint256).max;
            pos.isHealthy = true;
        }
    }

    /// @notice Get positions for a user across all registered markets
    function getAllPositions(address user) external view returns (UserPosition[] memory positions) {
        uint256 count = 0;
        
        // First pass: count non-empty positions
        for (uint256 i = 0; i < _registeredMarketIds.length; i++) {
            bytes32 marketId = _registeredMarketIds[i];
            Position memory pos = morpho.position(marketId, user);
            if (pos.collateral > 0 || pos.borrowShares > 0 || pos.supplyShares > 0) {
                count++;
            }
        }

        positions = new UserPosition[](count);
        uint256 idx = 0;

        // Second pass: populate positions
        for (uint256 i = 0; i < _registeredMarketIds.length; i++) {
            bytes32 marketId = _registeredMarketIds[i];
            Position memory rawPos = morpho.position(marketId, user);
            
            if (rawPos.collateral > 0 || rawPos.borrowShares > 0 || rawPos.supplyShares > 0) {
                MarketParams memory params = _marketParams[marketId];
                positions[idx] = this.getPosition(params, user);
                idx++;
            }
        }
    }

    /// @notice Get positions for specific markets
    function getPositionsForMarkets(
        MarketParams[] calldata paramsList,
        address user
    ) external view returns (UserPosition[] memory positions) {
        positions = new UserPosition[](paramsList.length);
        for (uint256 i = 0; i < paramsList.length; i++) {
            positions[i] = this.getPosition(paramsList[i], user);
        }
    }

    // ============ Market Info Queries ============

    /// @notice Get comprehensive info for a single market
    function getMarketInfo(MarketParams calldata params) external view returns (MarketInfo memory info) {
        bytes32 marketId = params.id();
        Market memory mkt = morpho.market(marketId);

        info.marketId = marketId;
        info.loanToken = params.loanToken;
        info.collateralToken = params.collateralToken;
        info.loanDecimals = _getDecimals(params.loanToken);
        info.collateralDecimals = _getDecimals(params.collateralToken);
        info.loanSymbol = _getSymbol(params.loanToken);
        info.collateralSymbol = _getSymbol(params.collateralToken);
        info.lltv = params.lltv;
        info.totalSupplyAssets = mkt.totalSupplyAssets;
        info.totalBorrowAssets = mkt.totalBorrowAssets;

        if (mkt.totalSupplyAssets > 0) {
            info.utilizationRate = (uint256(mkt.totalBorrowAssets) * 1e18) / uint256(mkt.totalSupplyAssets);
        }

        // Get oracle price
        if (params.oracle != address(0)) {
            try IMorphoOracle(params.oracle).price() returns (uint256 p) {
                info.oraclePrice = p;
            } catch {}
        }

        // Get rates
        info.borrowRate = this.getBorrowApr(params);
        info.supplyRate = this.getSupplyApr(params);
    }

    /// @notice Get info for all registered markets
    function getAllMarketsInfo() external view returns (MarketInfo[] memory infos) {
        infos = new MarketInfo[](_registeredMarketIds.length);
        for (uint256 i = 0; i < _registeredMarketIds.length; i++) {
            MarketParams memory params = _marketParams[_registeredMarketIds[i]];
            infos[i] = this.getMarketInfo(params);
        }
    }

    /// @notice Get market config data (similar to Aave's getReserveConfigs)
    function getMarketConfigs(MarketParams[] calldata paramsList) external view returns (MarketConfigData[] memory configs) {
        configs = new MarketConfigData[](paramsList.length);
        
        for (uint256 i = 0; i < paramsList.length; i++) {
            MarketParams calldata params = paramsList[i];
            bytes32 marketId = params.id();
            Market memory mkt = morpho.market(marketId);

            configs[i].marketId = marketId;
            configs[i].loanToken = params.loanToken;
            configs[i].collateralToken = params.collateralToken;
            configs[i].lltv = params.lltv;
            configs[i].loanDecimals = _getDecimals(params.loanToken);
            configs[i].collateralDecimals = _getDecimals(params.collateralToken);
            configs[i].isActive = mkt.totalSupplyAssets > 0;

            if (params.oracle != address(0)) {
                try IMorphoOracle(params.oracle).price() returns (uint256 p) {
                    configs[i].oraclePrice = p;
                } catch {}
            }
        }
    }

    // ============ LTV Queries (for ADL) ============

    /// @notice Returns the current LTV (debt/collateral) in basis points
    /// @dev Uses the market's oracle to price collateral in loan token terms
    /// @param params The market parameters
    /// @param user The user address
    /// @return Current LTV in basis points (e.g., 6500 = 65%), or 0 if no collateral
    function getCurrentLtvBps(MarketParams calldata params, address user) external view returns (uint256) {
        bytes32 marketId = params.id();
        Position memory rawPos = morpho.position(marketId, user);
        Market memory mkt = morpho.market(marketId);

        if (rawPos.collateral == 0) return 0;

        // Convert borrow shares to assets
        uint256 borrowBalance = 0;
        if (rawPos.borrowShares > 0 && mkt.totalBorrowShares > 0) {
            borrowBalance = (uint256(rawPos.borrowShares) * uint256(mkt.totalBorrowAssets)) / uint256(mkt.totalBorrowShares);
        }
        if (borrowBalance == 0) return 0;

        // Get collateral value in loan token terms using oracle
        if (params.oracle == address(0)) return 0;

        try IMorphoOracle(params.oracle).price() returns (uint256 oraclePrice) {
            // Morpho oracle price is already scaled by 10^(36 + loanDecimals - collateralDecimals)
            // So we only need to divide by 1e36 to get collateral value in loan token units
            uint256 collateralValue = (rawPos.collateral * oraclePrice) / 1e36;

            if (collateralValue == 0) return 0;

            // LTV in basis points = (borrow / collateralValue) * 10000
            return (borrowBalance * 10000) / collateralValue;
        } catch {
            return 0;
        }
    }

    /// @notice Returns the liquidation LTV threshold in basis points
    /// @dev This is the LLTV from market params, converted from WAD to bps
    /// @param params The market parameters
    /// @return Liquidation threshold in basis points
    function getLiquidationLtvBps(MarketParams calldata params) external pure returns (uint256) {
        // params.lltv is in WAD (1e18), convert to basis points
        return params.lltv / 1e14;
    }

    /// @notice Get position value (collateral and debt) for ADL calculations
    /// @dev Returns values normalized to 8 decimals USD (consistent with other protocols)
    ///      Morpho has no native USD oracle, so we treat the loan token as the unit of account
    ///      and scale to 8 decimals to match the LtvTrigger interface expectations.
    /// @param params The market parameters
    /// @param user The user address
    /// @return collateralValueUsd Collateral value in 8 decimals (loan token as unit of account)
    /// @return debtValueUsd Debt value in 8 decimals (loan token as unit of account)
    function getPositionValue(
        MarketParams calldata params,
        address user
    ) external view returns (uint256 collateralValueUsd, uint256 debtValueUsd) {
        bytes32 marketId = params.id();
        Position memory rawPos = morpho.position(marketId, user);
        Market memory mkt = morpho.market(marketId);

        // Get loan token decimals for scaling to 8 decimals
        uint8 loanDecimals = _getDecimals(params.loanToken);

        // Convert borrow shares to assets (debt in loan token units)
        uint256 debtInLoanUnits = 0;
        if (rawPos.borrowShares > 0 && mkt.totalBorrowShares > 0) {
            debtInLoanUnits = (uint256(rawPos.borrowShares) * uint256(mkt.totalBorrowAssets)) / uint256(mkt.totalBorrowShares);
        }

        // Calculate collateral value in loan token terms using oracle
        uint256 collateralInLoanUnits = 0;
        if (rawPos.collateral > 0 && params.oracle != address(0)) {
            try IMorphoOracle(params.oracle).price() returns (uint256 oraclePrice) {
                // Morpho oracle price is already scaled by 10^(36 + loanDecimals - collateralDecimals)
                // So we only need to divide by 1e36 to get collateral value in loan token units
                collateralInLoanUnits = (rawPos.collateral * oraclePrice) / 1e36;
            } catch {
                // Oracle failed, leave collateralInLoanUnits as 0
            }
        }

        // Scale from loan token decimals to 8 decimals
        // This ensures consistency with LtvTrigger which expects 8 decimal values
        if (loanDecimals >= 8) {
            uint256 divisor = 10 ** (loanDecimals - 8);
            collateralValueUsd = collateralInLoanUnits / divisor;
            debtValueUsd = debtInLoanUnits / divisor;
        } else {
            uint256 multiplier = 10 ** (8 - loanDecimals);
            collateralValueUsd = collateralInLoanUnits * multiplier;
            debtValueUsd = debtInLoanUnits * multiplier;
        }
    }

    // ============ Authorization ============

    /// @notice Check if a user is authorized to act on behalf of another
    function isAuthorized(address authorizer, address authorized) external view returns (bool) {
        return morpho.isAuthorized(authorizer, authorized);
    }

    // ============ Utility ============

    /// @notice Compute market ID from params
    function computeMarketId(MarketParams calldata params) external pure returns (bytes32) {
        return params.id();
    }

    /// @notice Get number of registered markets
    function registeredMarketCount() external view returns (uint256) {
        return _registeredMarketIds.length;
    }

    // ============ Internal Helpers ============

    function _getDecimals(address token) internal view returns (uint8) {
        try IERC20Metadata(token).decimals() returns (uint8 d) {
            return d;
        } catch {
            return 18;
        }
    }

    function _getSymbol(address token) internal view returns (string memory) {
        try IERC20Metadata(token).symbol() returns (string memory s) {
            return s;
        } catch {
            return "";
        }
    }
}
