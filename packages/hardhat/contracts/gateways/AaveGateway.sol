// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IGateway } from "../interfaces/IGateway.sol";
import { IPoolAddressesProvider } from "../interfaces/aave/IPoolAddressesProvider.sol";
import { IUiPoolDataProviderV3 } from "../interfaces/aave/IUiDataProvider.sol";
import { IPool } from "@aave/core-v3/contracts/interfaces/IPool.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract AaveGateway is IGateway {
    using SafeERC20 for IERC20;

    IPoolAddressesProvider public immutable poolAddressesProvider;
    IUiPoolDataProviderV3 public immutable uiPoolDataProvider;
    uint16 public immutable REFERRAL_CODE;

    constructor(address _poolAddressesProvider, address _uiPoolDataProvider, uint16 _referralCode) {
        poolAddressesProvider = IPoolAddressesProvider(_poolAddressesProvider);
        uiPoolDataProvider = IUiPoolDataProviderV3(_uiPoolDataProvider);
        REFERRAL_CODE = _referralCode;
    }

    // Placeholder for getLtv
    function getLtv(address token, address user) external view returns (uint256) {
        // TODO: Implement LTV logic
    }

    function deposit(address token, address user, uint256 amount) external override {
        address poolAddress = poolAddressesProvider.getPool();
        require(poolAddress != address(0), "Pool address not set");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).approve(poolAddress, amount);
        IPool(poolAddress).supply(token, amount, user, REFERRAL_CODE);
    }

    function withdraw(address token, address user, uint256 amount) external override {
        revert("not implemented");
    }

    function borrow(address token, address user, uint256 amount) external override {
        address poolAddress = poolAddressesProvider.getPool();
        require(poolAddress != address(0), "Pool address not set");

        IPool(poolAddress).borrow(token, amount, 2, REFERRAL_CODE, user);
        IERC20(token).safeTransfer(msg.sender, amount);
    }

    function repay(address token, address user, uint256 amount) external override {
        address poolAddress = poolAddressesProvider.getPool();
        require(poolAddress != address(0), "Pool address not set");
    
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).approve(poolAddress, amount);
        IPool(poolAddress).repay(token, amount, 2, user);
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
    }

    /// @notice Returns all token info for a given user.
    /// @dev This function caches the reserves and user reserves data to avoid multiple heavy calls.
    function getAllTokensInfo(address user) external view returns (TokenInfo[] memory) {
        // Fetch reserves data once.
        (IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves,) = uiPoolDataProvider.getReservesData(poolAddressesProvider);
        // Fetch user reserves data once.
        (IUiPoolDataProviderV3.UserReserveData[] memory userReserves, ) = 
            uiPoolDataProvider.getUserReservesData(poolAddressesProvider, user);

        TokenInfo[] memory tokens = new TokenInfo[](reserves.length);
        for (uint256 i = 0; i < reserves.length; i++) {
            uint256 balance = _getBalanceFromReserveData(reserves[i], user, userReserves);
            uint256 borrowBalance = _getBorrowBalanceFromReserveData(reserves[i], user, userReserves);
            tokens[i] = TokenInfo(
                reserves[i].underlyingAsset,
                reserves[i].liquidityRate,
                reserves[i].variableBorrowRate,
                reserves[i].name,
                reserves[i].symbol,
                reserves[i].priceInMarketReferenceCurrency,
                borrowBalance,
                balance
            );
        }
        return tokens;
    }

    function getBorrowRate(address token) external view override returns (uint256, bool) {
        (IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves, ) = 
            uiPoolDataProvider.getReservesData(poolAddressesProvider);
        for (uint256 i = 0; i < reserves.length; i++) {
            if (reserves[i].underlyingAsset == token) {
                return (reserves[i].variableBorrowRate, true);
            }
        }
        return (0, false);
    }

    function getSupplyRate(address token) external view override returns (uint256, bool) {
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
    function getBalance(address token, address user) public view override returns (uint256) {
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
    function getBorrowBalance(address token, address user) public view override returns (uint256) {
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
}
