// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IPoolAddressesProvider} from "../../../interfaces/aave/IPoolAddressesProvider.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {IPoolDataProvider} from "@aave/core-v3/contracts/interfaces/IPoolDataProvider.sol";
import {IAaveOracle} from "@aave/core-v3/contracts/interfaces/IAaveOracle.sol";
import {DataTypes} from "@aave/core-v3/contracts/protocol/libraries/types/DataTypes.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title AaveGatewayViewBase
 * @notice View-only gateway for Aave v3 protocol on Base. Avoids UiPoolDataProvider struct differences
 *         by reading directly from Pool, DataProvider and Oracle. Constructor signature matches the
 *         generic view so deploy scripts can deploy this under the same name.
 */
contract AaveGatewayViewBase {

    IPoolAddressesProvider public immutable poolAddressesProvider;

    constructor(address _poolAddressesProvider, address /* _uiPoolDataProvider */) {
        poolAddressesProvider = IPoolAddressesProvider(_poolAddressesProvider);
    }

    struct TokenInfo {
        address token;
        uint256 supplyRate;
        uint256 borrowRate;
        string name;
        string symbol;
        uint256 price;
        uint256 borrowBalance;
        uint256 balance;
        address aToken;
        uint8 decimals;
    }

    struct EModeInfo {
        uint8 id;
        uint16 ltv;
        uint16 liquidationThreshold;
        uint16 liquidationBonus;
        string label;
        uint128 collateralBitmap;
        uint128 borrowableBitmap;
    }

    /// @notice Reserve configuration for LTV calculations
    struct ReserveConfigData {
        address token;
        uint256 price;              // Price in base currency (8 decimals)
        uint256 ltv;                // Loan-to-value in basis points (0-10000)
        uint256 liquidationThreshold; // Liquidation threshold in basis points
        uint256 liquidationBonus;   // Liquidation bonus in basis points
        uint8 decimals;
        bool usageAsCollateralEnabled;
        bool borrowingEnabled;
    }

    /// @notice Returns the user's current E-Mode category ID
    /// @param user The address of the user
    /// @return categoryId The E-Mode category ID (0 = no E-Mode)
    function getUserEMode(address user) external view returns (uint8 categoryId) {
        IPool pool = IPool(poolAddressesProvider.getPool());
        categoryId = uint8(pool.getUserEMode(user));
    }

    /// @notice Returns all available E-Mode categories
    /// @dev Note: Base doesn't support the UiPoolDataProvider's getEModes, so we return empty for now
    /// @return emodes Array of E-Mode categories with their configurations
    function getEModes() external view returns (EModeInfo[] memory emodes) {
        emodes = new EModeInfo[](0);
    }

    /// @notice Returns all token info for a given user.
    function getAllTokensInfo(address user) external view returns (TokenInfo[] memory) {
        IPool pool = IPool(poolAddressesProvider.getPool());
        IAaveOracle oracle = IAaveOracle(poolAddressesProvider.getPriceOracle());
        IPoolDataProvider dataProvider = IPoolDataProvider(poolAddressesProvider.getPoolDataProvider());

        address[] memory reserves = pool.getReservesList();
        TokenInfo[] memory tokens = new TokenInfo[](reserves.length);

        for (uint256 i = 0; i < reserves.length; i++) {
            DataTypes.ReserveData memory baseData = pool.getReserveData(reserves[i]);
            (address aToken, , address variableDebtToken) = dataProvider.getReserveTokensAddresses(reserves[i]);

            uint256 balance = 0;
            uint256 borrowBalance = 0;
            if (aToken != address(0)) {
                try IERC20(aToken).balanceOf(user) returns (uint256 bal) { balance = bal; } catch {}
            }
            if (variableDebtToken != address(0)) {
                try IERC20(variableDebtToken).balanceOf(user) returns (uint256 bal) { borrowBalance = bal; } catch {}
            }

            string memory name = "";
            string memory symbol = "";
            try IERC20Metadata(reserves[i]).name() returns (string memory n) { name = n; } catch {}
            try IERC20Metadata(reserves[i]).symbol() returns (string memory s) { symbol = s; } catch {}
            uint8 dec = 18;
            try ERC20(reserves[i]).decimals() returns (uint8 d) { dec = d; } catch {}

            // Wrap price fetch in try-catch to handle broken price feeds (e.g., ZeroLend pzETH)
            uint256 price = 0;
            try oracle.getAssetPrice(reserves[i]) returns (uint256 p) { price = p; } catch {}

            tokens[i] = TokenInfo({
                token: reserves[i],
                supplyRate: baseData.currentLiquidityRate,
                borrowRate: baseData.currentVariableBorrowRate,
                name: name,
                symbol: symbol,
                price: price,
                borrowBalance: borrowBalance,
                balance: balance,
                aToken: aToken,
                decimals: dec
            });
        }
        return tokens;
    }

    /// @notice Returns all token info for a user along with their E-Mode category
    /// @param user The address of the user
    /// @return tokens Array of TokenInfo structs
    /// @return userEModeCategory The user's current E-Mode category ID (0 = no E-Mode)
    function getAllTokensInfoWithEMode(address user) external view returns (TokenInfo[] memory tokens, uint8 userEModeCategory) {
        tokens = this.getAllTokensInfo(user);
        userEModeCategory = this.getUserEMode(user);
    }

    /// @notice Get reserve configuration data for multiple tokens (for frontend LTV calculations)
    /// @dev Returns price, LTV, liquidation threshold, and other config for each token
    /// @param tokens Array of token addresses to get config for
    /// @return configs Array of reserve configuration data
    function getReserveConfigs(address[] calldata tokens) external view returns (ReserveConfigData[] memory configs) {
        IAaveOracle oracle = IAaveOracle(poolAddressesProvider.getPriceOracle());
        IPoolDataProvider dataProvider = IPoolDataProvider(poolAddressesProvider.getPoolDataProvider());

        configs = new ReserveConfigData[](tokens.length);

        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            
            // Get price
            uint256 price = 0;
            try oracle.getAssetPrice(token) returns (uint256 p) { price = p; } catch {}

            // Get decimals
            uint8 decimals = 18;
            try ERC20(token).decimals() returns (uint8 d) { decimals = d; } catch {}

            // Get reserve configuration
            uint256 ltv = 0;
            uint256 liquidationThreshold = 0;
            uint256 liquidationBonus = 0;
            bool usageAsCollateralEnabled = false;
            bool borrowingEnabled = false;

            try dataProvider.getReserveConfigurationData(token) returns (
                uint256 _decimals,
                uint256 _ltv,
                uint256 _liquidationThreshold,
                uint256 _liquidationBonus,
                uint256 /* reserveFactor */,
                bool _usageAsCollateralEnabled,
                bool _borrowingEnabled,
                bool /* stableBorrowRateEnabled */,
                bool /* isActive */,
                bool /* isFrozen */
            ) {
                ltv = _ltv;
                liquidationThreshold = _liquidationThreshold;
                liquidationBonus = _liquidationBonus;
                usageAsCollateralEnabled = _usageAsCollateralEnabled;
                borrowingEnabled = _borrowingEnabled;
            } catch {}

            configs[i] = ReserveConfigData({
                token: token,
                price: price,
                ltv: ltv,
                liquidationThreshold: liquidationThreshold,
                liquidationBonus: liquidationBonus,
                decimals: decimals,
                usageAsCollateralEnabled: usageAsCollateralEnabled,
                borrowingEnabled: borrowingEnabled
            });
        }
    }

    /// @notice Get reserve config for a single token
    /// @param token The token address
    /// @return config The reserve configuration data
    function getReserveConfig(address token) external view returns (ReserveConfigData memory config) {
        address[] memory tokens = new address[](1);
        tokens[0] = token;
        ReserveConfigData[] memory configs = this.getReserveConfigs(tokens);
        return configs[0];
    }

    function getBorrowRate(address token) external view returns (uint256, bool) {
        IPool pool = IPool(poolAddressesProvider.getPool());
        if (!_isReserve(pool, token)) return (0, false);
        DataTypes.ReserveData memory baseData = pool.getReserveData(token);
        return (baseData.currentVariableBorrowRate, true);
    }

    function getSupplyRate(address token) external view returns (uint256, bool) {
        IPool pool = IPool(poolAddressesProvider.getPool());
        if (!_isReserve(pool, token)) return (0, false);
        DataTypes.ReserveData memory baseData = pool.getReserveData(token);
        return (baseData.currentLiquidityRate, true);
    }

    function _isReserve(IPool pool, address token) internal view returns (bool) {
        address[] memory reserves = pool.getReservesList();
        for (uint256 i = 0; i < reserves.length; i++) {
            if (reserves[i] == token) return true;
        }
        return false;
    }

    function getBalance(address token, address user) public view returns (uint256) {
        (address aToken, , ) = _getReserveAddresses(token);
        if (aToken != address(0)) {
            try IERC20(aToken).balanceOf(user) returns (uint256 bal) { return bal; } catch {}
        }
        return 0;
    }

    function getBorrowBalance(address token, address user) public view returns (uint256) {
        (, address variableDebtToken, ) = _getReserveAddresses(token);
        if (variableDebtToken != address(0)) {
            try IERC20(variableDebtToken).balanceOf(user) returns (uint256 bal) { return bal; } catch {}
        }
        return 0;
    }

    function getBorrowBalanceCurrent(address token, address user) external returns (uint256) {
        return getBorrowBalance(token, user);
    }

    /// @notice Returns the liquidation threshold (LLTV) for a given user in basis points.
    function getMaxLtv(address /* market */, address user) external view returns (uint256) {
        IPool pool = IPool(poolAddressesProvider.getPool());
        (, , , uint256 currentLiquidationThreshold, ,) = pool.getUserAccountData(user);
        return currentLiquidationThreshold;
    }

    /// @notice Returns the configured maximum LTV for the user in basis points.
    function getLtv(address /* market */, address user) external view returns (uint256) {
        IPool pool = IPool(poolAddressesProvider.getPool());
        (, , , , uint256 ltv,) = pool.getUserAccountData(user);
        return ltv;
    }

    /// @notice Returns full user account data from Aave
    /// @param user The user address
    /// @return totalCollateralBase Total collateral in base currency
    /// @return totalDebtBase Total debt in base currency
    /// @return availableBorrowsBase Available borrows in base currency
    /// @return currentLiquidationThreshold Current liquidation threshold (bps)
    /// @return ltv Current LTV (bps)
    /// @return healthFactor Health factor (1e18 scale)
    function getUserAccountData(address user) external view returns (
        uint256 totalCollateralBase,
        uint256 totalDebtBase,
        uint256 availableBorrowsBase,
        uint256 currentLiquidationThreshold,
        uint256 ltv,
        uint256 healthFactor
    ) {
        IPool pool = IPool(poolAddressesProvider.getPool());
        return pool.getUserAccountData(user);
    }

    function borrowedTokens(address user) external view returns (address[] memory) {
        IPool pool = IPool(poolAddressesProvider.getPool());
        IPoolDataProvider dataProvider = IPoolDataProvider(poolAddressesProvider.getPoolDataProvider());
        address[] memory reserves = pool.getReservesList();

        uint256 count = 0;
        for (uint256 i = 0; i < reserves.length; i++) {
            (, , address variableDebtToken) = dataProvider.getReserveTokensAddresses(reserves[i]);
            if (variableDebtToken != address(0)) {
                try IERC20(variableDebtToken).balanceOf(user) returns (uint256 bal) {
                    if (bal > 0) count++;
                } catch {}
            }
        }

        address[] memory tokens = new address[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < reserves.length; i++) {
            (, , address variableDebtToken) = dataProvider.getReserveTokensAddresses(reserves[i]);
            if (variableDebtToken != address(0)) {
                try IERC20(variableDebtToken).balanceOf(user) returns (uint256 bal) {
                    if (bal > 0) tokens[idx++] = reserves[i];
                } catch {}
            }
        }
        return tokens;
    }

    function _getReserveAddresses(address token) internal view returns (address aToken, address variableDebtToken, bool found) {
        IPoolDataProvider dataProvider = IPoolDataProvider(poolAddressesProvider.getPoolDataProvider());
        try dataProvider.getReserveTokensAddresses(token) returns (address aT, address /*stableDebtToken*/, address vD) {
            return (aT, vD, true);
        } catch {}
        return (address(0), address(0), false);
    }

    function getPossibleCollaterals(
        address /* market */, 
        address user
    ) external view returns (
        address[] memory collateralAddresses,
        uint256[] memory balances,
        string[] memory symbols,
        uint8[] memory decimals
    ) {
        IPool pool = IPool(poolAddressesProvider.getPool());
        address[] memory reserves = pool.getReservesList();

        if (user == address(0)) {
            uint256 tokenCountX = reserves.length;
            collateralAddresses = new address[](tokenCountX);
            balances = new uint256[](tokenCountX);
            symbols = new string[](tokenCountX);
            decimals = new uint8[](tokenCountX);

            for (uint256 i = 0; i < tokenCountX; i++) {
                collateralAddresses[i] = reserves[i];
                try IERC20Metadata(reserves[i]).symbol() returns (string memory s) { symbols[i] = s; } catch { symbols[i] = ""; }
                try ERC20(reserves[i]).decimals() returns (uint8 dec) { decimals[i] = dec; } catch { decimals[i] = 18; }
            }
            return (collateralAddresses, balances, symbols, decimals);
        }

        // Connected wallet: include only non-zero balances
        IPoolDataProvider dataProvider = IPoolDataProvider(poolAddressesProvider.getPoolDataProvider());
        uint256 tokenCount = 0;
        for (uint256 i = 0; i < reserves.length; i++) {
            (address aToken, , ) = dataProvider.getReserveTokensAddresses(reserves[i]);
            if (aToken != address(0)) {
                try IERC20(aToken).balanceOf(user) returns (uint256 bal) {
                    if (bal > 0) tokenCount++;
                } catch {}
            }
        }

        collateralAddresses = new address[](tokenCount);
        balances = new uint256[](tokenCount);
        symbols = new string[](tokenCount);
        decimals = new uint8[](tokenCount);

        uint256 index = 0;
        for (uint256 i = 0; i < reserves.length; i++) {
            (address aToken, , ) = dataProvider.getReserveTokensAddresses(reserves[i]);
            if (aToken != address(0)) {
                uint256 bal = 0;
                try IERC20(aToken).balanceOf(user) returns (uint256 b) { bal = b; } catch {}
                if (bal > 0) {
                    collateralAddresses[index] = reserves[i];
                    balances[index] = bal;
                    try IERC20Metadata(reserves[i]).symbol() returns (string memory s) { symbols[index] = s; } catch { symbols[index] = ""; }
                    try ERC20(reserves[i]).decimals() returns (uint8 dec) { decimals[index] = dec; } catch { decimals[index] = 18; }
                    index++;
                }
            }
        }
        return (collateralAddresses, balances, symbols, decimals);
    }

    function getAToken(address underlyingToken) public view returns (address) {
        IPoolDataProvider dataProvider = IPoolDataProvider(poolAddressesProvider.getPoolDataProvider());
        (address aTokenAddress, , ) = dataProvider.getReserveTokensAddresses(underlyingToken);
        return aTokenAddress;
    }

    function getUnderlyingToken(address aToken) external view returns (address) {
        IPoolDataProvider dataProvider = IPoolDataProvider(poolAddressesProvider.getPoolDataProvider());
        (address underlyingToken, , ) = dataProvider.getReserveTokensAddresses(aToken);
        return underlyingToken;
    }

    function isCollateralSupported(address /* market */, address collateral) external view returns (bool isSupported) {
        IPoolDataProvider dataProvider = IPoolDataProvider(poolAddressesProvider.getPoolDataProvider());
        (
            ,
            uint256 ltv,
            ,
            ,
            ,
            bool usageAsCollateralEnabled,
            ,
            ,
            ,
            
        ) = dataProvider.getReserveConfigurationData(collateral);
        return usageAsCollateralEnabled || ltv != 0;
    }

    function getSupportedCollaterals(address /* market */) external view returns (address[] memory collateralAddresses) {
        IPool pool = IPool(poolAddressesProvider.getPool());
        IPoolDataProvider dataProvider = IPoolDataProvider(poolAddressesProvider.getPoolDataProvider());
        address[] memory reserves = pool.getReservesList();

        uint256 collateralCount = 0;
        for (uint256 i = 0; i < reserves.length; i++) {
            (, uint256 ltv, , , , bool usageAsCollateralEnabled, , , , ) = dataProvider.getReserveConfigurationData(reserves[i]);
            if (usageAsCollateralEnabled || ltv != 0) collateralCount++;
        }

        collateralAddresses = new address[](collateralCount);
        uint256 index = 0;
        for (uint256 i = 0; i < reserves.length; i++) {
            (, uint256 ltv, , , , bool usageAsCollateralEnabled, , , , ) = dataProvider.getReserveConfigurationData(reserves[i]);
            if (usageAsCollateralEnabled || ltv != 0) {
                collateralAddresses[index] = reserves[i];
                index++;
            }
        }
        return collateralAddresses;
    }
}
