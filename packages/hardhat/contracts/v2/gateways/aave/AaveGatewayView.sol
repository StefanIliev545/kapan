// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IPoolAddressesProvider} from "../../../interfaces/aave/IPoolAddressesProvider.sol";
import {IUiPoolDataProviderV3} from "../../../interfaces/aave/IUiDataProvider.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {IPoolDataProvider} from "@aave/core-v3/contracts/interfaces/IPoolDataProvider.sol";
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

    /// @notice Returns all token info for a given user.
    /// @dev This function caches the reserves and user reserves data to avoid multiple heavy calls.
    struct EModeInfo {
        uint8 id;
        uint16 ltv;
        uint16 liquidationThreshold;
        uint16 liquidationBonus;
        string label;
        uint128 collateralBitmap;
        uint128 borrowableBitmap;
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
    /// @dev First attempts to call balanceOf on the associated aToken; if that fails, falls back to user reserves data.
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
    /// @dev First attempts to call balanceOf on the associated variable debt token; if that fails, falls back to user reserves data.
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
    /// @dev The market parameter is unused and kept for interface consistency across gateways.
    function getMaxLtv(address /* market */, address user) external view returns (uint256) {
        IPool pool = IPool(poolAddressesProvider.getPool());
        (, , , uint256 currentLiquidationThreshold, ,) = pool.getUserAccountData(user);
        return currentLiquidationThreshold;
    }

    /// @notice Returns the protocol-level maximum LTV configuration for the user in basis points.
    /// @dev The market parameter is unused and kept for interface consistency across gateways.
    function getLtv(address /* market */, address user) external view returns (uint256) {
        IPool pool = IPool(poolAddressesProvider.getPool());
        (, , , , uint256 ltv,) = pool.getUserAccountData(user);
        return ltv;
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
}
