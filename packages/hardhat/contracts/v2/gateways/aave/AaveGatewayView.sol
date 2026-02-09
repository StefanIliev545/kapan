// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IPoolAddressesProvider} from "../../../interfaces/aave/IPoolAddressesProvider.sol";
import {IUiPoolDataProviderV3} from "../../../interfaces/aave/IUiDataProvider.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {IPoolDataProvider} from "@aave/core-v3/contracts/interfaces/IPoolDataProvider.sol";
import {IAaveOracle} from "@aave/core-v3/contracts/interfaces/IAaveOracle.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title AaveGatewayView
 * @notice View-only gateway for Aave v3 protocol
 * @dev Contains all read/view functions from v1, separate from write operations
 */
contract AaveGatewayView {
    IPoolAddressesProvider public immutable poolAddressesProvider;
    IUiPoolDataProviderV3 public immutable uiPoolDataProvider;

    constructor(address _poolAddressesProvider, address _uiPoolDataProvider) {
        poolAddressesProvider = IPoolAddressesProvider(_poolAddressesProvider);
        uiPoolDataProvider = IUiPoolDataProviderV3(_uiPoolDataProvider);
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
        (, categoryId) = uiPoolDataProvider.getUserReservesData(poolAddressesProvider, user);
    }

    /// @notice Returns all available E-Mode categories
    /// @return emodes Array of E-Mode categories with their configurations
    function getEModes() external view returns (EModeInfo[] memory emodes) {
        IUiPoolDataProviderV3.Emode[] memory rawEmodes = uiPoolDataProvider.getEModes(poolAddressesProvider);
        emodes = new EModeInfo[](rawEmodes.length);
        for (uint256 i = 0; i < rawEmodes.length; i++) {
            emodes[i] = EModeInfo({
                id: rawEmodes[i].id,
                ltv: rawEmodes[i].eMode.ltv,
                liquidationThreshold: rawEmodes[i].eMode.liquidationThreshold,
                liquidationBonus: rawEmodes[i].eMode.liquidationBonus,
                label: rawEmodes[i].eMode.label,
                collateralBitmap: rawEmodes[i].eMode.collateralBitmap,
                borrowableBitmap: rawEmodes[i].eMode.borrowableBitmap
            });
        }
    }

    function getAllTokensInfo(address user) external view returns (TokenInfo[] memory) {
        // Fetch reserves data once.
        (IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves,) = uiPoolDataProvider.getReservesData(poolAddressesProvider);
        // Fetch user reserves data once (including E-Mode category)
        (IUiPoolDataProviderV3.UserReserveData[] memory userReserves, /* uint8 userEModeCategory */) = 
            uiPoolDataProvider.getUserReservesData(poolAddressesProvider, user);

        TokenInfo[] memory tokens = new TokenInfo[](reserves.length);
        for (uint256 i = 0; i < reserves.length; i++) {
            uint256 balance = _getBalanceFromReserveData(reserves[i], user, userReserves);
            uint256 borrowBalance = _getBorrowBalanceFromReserveData(reserves[i], user, userReserves);
            uint8 dec = 18;
            // Read decimals from the underlying token; default to 18 on failure
            try ERC20(reserves[i].underlyingAsset).decimals() returns (uint8 d) {
                dec = d;
            } catch {
            }
            tokens[i] = TokenInfo({
                token: reserves[i].underlyingAsset,
                supplyRate: reserves[i].liquidityRate,
                borrowRate: reserves[i].variableBorrowRate,
                name: reserves[i].name,
                symbol: reserves[i].symbol,
                price: reserves[i].priceInMarketReferenceCurrency,
                borrowBalance: borrowBalance,
                balance: balance,
                aToken: reserves[i].aTokenAddress,
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
        // Fetch reserves data once.
        (IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves,) = uiPoolDataProvider.getReservesData(poolAddressesProvider);
        // Fetch user reserves data once (including E-Mode category)
        (IUiPoolDataProviderV3.UserReserveData[] memory userReserves, uint8 eModeCat) = 
            uiPoolDataProvider.getUserReservesData(poolAddressesProvider, user);
        userEModeCategory = eModeCat;

        tokens = new TokenInfo[](reserves.length);
        for (uint256 i = 0; i < reserves.length; i++) {
            uint256 balance = _getBalanceFromReserveData(reserves[i], user, userReserves);
            uint256 borrowBalance = _getBorrowBalanceFromReserveData(reserves[i], user, userReserves);
            uint8 dec = 18;
            try ERC20(reserves[i].underlyingAsset).decimals() returns (uint8 d) {
                dec = d;
            } catch {
            }
            tokens[i] = TokenInfo({
                token: reserves[i].underlyingAsset,
                supplyRate: reserves[i].liquidityRate,
                borrowRate: reserves[i].variableBorrowRate,
                name: reserves[i].name,
                symbol: reserves[i].symbol,
                price: reserves[i].priceInMarketReferenceCurrency,
                borrowBalance: borrowBalance,
                balance: balance,
                aToken: reserves[i].aTokenAddress,
                decimals: dec
            });
        }
    }

    /// @notice Get reserve configuration data for multiple tokens (for frontend LTV calculations)
    /// @dev Returns price, LTV, liquidation threshold, and other config for each token
    /// @param tokens Array of token addresses to get config for
    /// @return configs Array of reserve configuration data
    function getReserveConfigs(address[] calldata tokens) external view returns (ReserveConfigData[] memory configs) {
        IPoolDataProvider dataProvider = IPoolDataProvider(IPoolAddressesProvider(poolAddressesProvider).getPoolDataProvider());
        (IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves,) = uiPoolDataProvider.getReservesData(poolAddressesProvider);

        configs = new ReserveConfigData[](tokens.length);

        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            
            // Find price from reserves data
            uint256 price = 0;
            for (uint256 j = 0; j < reserves.length; j++) {
                if (reserves[j].underlyingAsset == token) {
                    price = reserves[j].priceInMarketReferenceCurrency;
                    break;
                }
            }

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
                uint256 /* _decimals */,
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
        (IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves, ) = 
            uiPoolDataProvider.getReservesData(poolAddressesProvider);
        for (uint256 i = 0; i < reserves.length; i++) {
            if (reserves[i].underlyingAsset == token) {
                return (reserves[i].variableBorrowRate, true);
            }
        }
        return (0, false);
    }

    function getSupplyRate(address token) external view returns (uint256, bool) {
        (IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves, ) = 
            uiPoolDataProvider.getReservesData(poolAddressesProvider);
        for (uint256 i = 0; i < reserves.length; i++) {
            if (reserves[i].underlyingAsset == token) {
                return (reserves[i].liquidityRate, true);
            }
        }
        return (0, false);
    }

    /// @notice Gets the balance for a given token and user.
    function getBalance(address token, address user) public view returns (uint256) {
        (address aToken, , bool found) = _getReserveAddresses(token);
        if (found && aToken != address(0)) {
            try IERC20(aToken).balanceOf(user) returns (uint256 bal) {
                return bal;
            } catch {
            }
        }
        // Fallback: use user reserves data
        (IUiPoolDataProviderV3.UserReserveData[] memory userReserves, ) = 
            uiPoolDataProvider.getUserReservesData(poolAddressesProvider, user);
        for (uint256 i = 0; i < userReserves.length; i++) {
            if (userReserves[i].underlyingAsset == token) {
                return userReserves[i].scaledATokenBalance;
            }
        }
        return 0;
    }

    /// @notice Gets the borrow balance for a given token and user.
    function getBorrowBalance(address token, address user) public view returns (uint256) {
        (, address variableDebtToken, bool found) = _getReserveAddresses(token);
        if (found && variableDebtToken != address(0)) {
            try IERC20(variableDebtToken).balanceOf(user) returns (uint256 bal) {
                return bal;
            } catch {
            }
        }
        // Fallback: use user reserves data
        (IUiPoolDataProviderV3.UserReserveData[] memory userReserves, ) = 
            uiPoolDataProvider.getUserReservesData(poolAddressesProvider, user);
        for (uint256 i = 0; i < userReserves.length; i++) {
            if (userReserves[i].underlyingAsset == token) {
                return userReserves[i].scaledVariableDebt;
            }
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

    /// @notice Returns the protocol-level maximum LTV configuration for the user in basis points.
    function getLtv(address /* market */, address user) external view returns (uint256) {
        IPool pool = IPool(poolAddressesProvider.getPool());
        (, , , , uint256 ltv,) = pool.getUserAccountData(user);
        return ltv;
    }

    /// @notice Returns the current LTV (debt/collateral) in basis points
    /// @dev This is the actual current LTV = totalDebt / totalCollateral * 10000
    /// @param user The user address
    /// @return Current LTV in basis points (e.g., 6500 = 65%)
    function getCurrentLtvBps(address /* market */, address user) external view returns (uint256) {
        IPool pool = IPool(poolAddressesProvider.getPool());
        (uint256 totalCollateralBase, uint256 totalDebtBase,,,,) = pool.getUserAccountData(user);
        if (totalCollateralBase == 0) return 0;
        return (totalDebtBase * 10000) / totalCollateralBase;
    }

    /// @notice Returns the liquidation LTV threshold in basis points
    /// @dev Position is liquidatable when currentLTV >= liquidationLtvBps
    /// @param user The user address
    /// @return Liquidation threshold in basis points
    function getLiquidationLtvBps(address /* market */, address user) external view returns (uint256) {
        IPool pool = IPool(poolAddressesProvider.getPool());
        (, , , uint256 liquidationThreshold,,) = pool.getUserAccountData(user);
        return liquidationThreshold;
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

    /// @notice Returns the list of tokens that the user has borrowed.
    function borrowedTokens(address user) external view returns (address[] memory) {
        (IUiPoolDataProviderV3.UserReserveData[] memory userReserves, ) = 
            uiPoolDataProvider.getUserReservesData(poolAddressesProvider, user);
        uint256 count = 0;
        for (uint256 i = 0; i < userReserves.length; i++) {
            if (userReserves[i].scaledVariableDebt > 0) {
                count++;
            }
        }
        address[] memory tokens = new address[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < userReserves.length; i++) {
            if (userReserves[i].scaledVariableDebt > 0) {
                tokens[index++] = userReserves[i].underlyingAsset;
            }
        }
        return tokens;
    }

    /// @dev Internal helper to get both the aToken and variable debt token for a given underlying asset.
    function _getReserveAddresses(address token) internal view returns (address aToken, address variableDebtToken, bool found) {
        try uiPoolDataProvider.getReservesData(poolAddressesProvider) returns (
            IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves,
            IUiPoolDataProviderV3.BaseCurrencyInfo memory
        ) {
            for (uint256 i = 0; i < reserves.length; i++) {
                if (reserves[i].underlyingAsset == token) {
                    return (reserves[i].aTokenAddress, reserves[i].variableDebtTokenAddress, true);
                }
            }
        } catch {
        }
        return (address(0), address(0), false);
    }

    /// @dev Internal helper to fetch balance from reserve data, with fallback to user reserves.
    function _getBalanceFromReserveData(
        IUiPoolDataProviderV3.AggregatedReserveData memory reserve,
        address user,
        IUiPoolDataProviderV3.UserReserveData[] memory userReserves
    ) internal view returns (uint256) {
        if (reserve.aTokenAddress != address(0)) {
            try IERC20(reserve.aTokenAddress).balanceOf(user) returns (uint256 bal) {
                return bal;
            } catch {
                // Fallback below
            }
        }
        for (uint256 i = 0; i < userReserves.length; i++) {
            if (userReserves[i].underlyingAsset == reserve.underlyingAsset) {
                return userReserves[i].scaledATokenBalance;
            }
        }
        return 0;
    }

    /// @dev Internal helper to fetch borrow balance from reserve data, with fallback to user reserves.
    function _getBorrowBalanceFromReserveData(
        IUiPoolDataProviderV3.AggregatedReserveData memory reserve,
        address user,
        IUiPoolDataProviderV3.UserReserveData[] memory userReserves
    ) internal view returns (uint256) {
        if (reserve.variableDebtTokenAddress != address(0)) {
            try IERC20(reserve.variableDebtTokenAddress).balanceOf(user) returns (uint256 bal) {
                return bal;
            } catch {
                // Fallback below
            }
        }
        for (uint256 i = 0; i < userReserves.length; i++) {
            if (userReserves[i].underlyingAsset == reserve.underlyingAsset) {
                return userReserves[i].scaledVariableDebt;
            }
        }
        return 0;
    }
    
    function getPossibleCollaterals(address token, address user) external view returns (
        address[] memory collateralAddresses,
        uint256[] memory balances,
        string[] memory symbols,
        uint8[] memory decimals
    ) {
        // If user is zero address, get all possible tokens but with zero balances
        if (user == address(0)) {
            (IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves,) = uiPoolDataProvider.getReservesData(poolAddressesProvider);
            
            // Initialize arrays with all reserves
            uint256 tokenCountX = reserves.length;
            collateralAddresses = new address[](tokenCountX);
            balances = new uint256[](tokenCountX); // All zeros by default
            symbols = new string[](tokenCountX);
            decimals = new uint8[](tokenCountX);
            
            // Fill arrays with token data (zero balances)
            for (uint256 i = 0; i < tokenCountX; i++) {
                collateralAddresses[i] = reserves[i].underlyingAsset;
                symbols[i] = reserves[i].symbol;
                // Get decimals directly from token
                try ERC20(reserves[i].underlyingAsset).decimals() returns (uint8 dec) {
                    decimals[i] = dec;
                } catch {
                    decimals[i] = 18; // Default to 18 if call fails
                }
            }
            
            return (collateralAddresses, balances, symbols, decimals);
        }
        
        // For connected wallets, get all tokens with actual balances
        TokenInfo[] memory allTokens = this.getAllTokensInfo(user);

        // Count tokens with non-zero balance
        uint256 tokenCount = 0;
        for (uint256 i = 0; i < allTokens.length; i++) {
            if (allTokens[i].balance > 0) {
                tokenCount++;
            }
        }

        // Initialize arrays with the correct size
        collateralAddresses = new address[](tokenCount);
        balances = new uint256[](tokenCount);
        symbols = new string[](tokenCount);
        decimals = new uint8[](tokenCount);

        // Fill arrays with tokens that have balance
        uint256 index = 0;
        for (uint256 i = 0; i < allTokens.length; i++) {
            if (allTokens[i].balance > 0) {
                collateralAddresses[index] = allTokens[i].token;
                balances[index] = allTokens[i].balance;
                symbols[index] = allTokens[i].symbol;
                try ERC20(allTokens[i].token).decimals() returns (uint8 dec) {
                    decimals[index] = dec;
                } catch {
                    decimals[index] = 18; // Default to 18 if call fails
                }
                index++;
            }
        }
        return (collateralAddresses, balances, symbols, decimals);
    }

    function getAToken(address underlyingToken) public view returns (address) {
        IPoolDataProvider dataProvider = IPoolDataProvider(IPoolAddressesProvider(poolAddressesProvider).getPoolDataProvider());
        (address aTokenAddress, , ) = dataProvider.getReserveTokensAddresses(underlyingToken);
        return aTokenAddress;
    }

    function getUnderlyingToken(address aToken) external view returns (address) {
        IPoolDataProvider dataProvider = IPoolDataProvider(IPoolAddressesProvider(poolAddressesProvider).getPoolDataProvider());
        (address underlyingToken, , ) = dataProvider.getReserveTokensAddresses(aToken);
        return underlyingToken;
    }

    function isCollateralSupported(address market, address collateral) external view returns (bool isSupported) {
        // In Aave, we need to check if the token is a supported reserve and if it can be used as collateral
        (IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves,) = uiPoolDataProvider.getReservesData(poolAddressesProvider);
        
        for (uint256 i = 0; i < reserves.length; i++) {
            if (reserves[i].underlyingAsset == collateral) {
                // Check if the token can be used as collateral in Aave
                return reserves[i].usageAsCollateralEnabled;
            }
        }
        
        return false;
    }
    
    function getSupportedCollaterals(address market) external view returns (address[] memory collateralAddresses) {
        // Get all Aave reserves
        (IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves,) = uiPoolDataProvider.getReservesData(poolAddressesProvider);
        
        // Count eligible collaterals
        uint256 collateralCount = 0;
        for (uint256 i = 0; i < reserves.length; i++) {
            if (reserves[i].usageAsCollateralEnabled) {
                collateralCount++;
            }
        }
        
        // Create and populate array with eligible collaterals
        collateralAddresses = new address[](collateralCount);
        uint256 index = 0;
        for (uint256 i = 0; i < reserves.length; i++) {
            if (reserves[i].usageAsCollateralEnabled) {
                collateralAddresses[index] = reserves[i].underlyingAsset;
                index++;
            }
        }
        
        return collateralAddresses;
    }

    // ============ Price Queries (for ADL) ============

    /// @notice Get the price of an asset in USD (8 decimals)
    /// @param token The asset address
    /// @return price Price in 8 decimals (e.g., 300000000000 for $3000)
    function getAssetPrice(address token) external view returns (uint256 price) {
        IAaveOracle oracle = IAaveOracle(poolAddressesProvider.getPriceOracle());
        try oracle.getAssetPrice(token) returns (uint256 p) {
            return p;
        } catch {
            return 0;
        }
    }

    /// @notice Get prices for multiple assets
    /// @param tokens Array of asset addresses
    /// @return prices Array of prices in 8 decimals
    function getAssetPrices(address[] calldata tokens) external view returns (uint256[] memory prices) {
        IAaveOracle oracle = IAaveOracle(poolAddressesProvider.getPriceOracle());
        prices = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            try oracle.getAssetPrice(tokens[i]) returns (uint256 p) {
                prices[i] = p;
            } catch {
                prices[i] = 0;
            }
        }
    }
}
