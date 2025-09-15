// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/IGatewayView.sol";
import "../../interfaces/aave/IPoolAddressProvider.sol";
import "../../interfaces/aave/IUiDataProvider.sol";
import "@aave/core-v3/contracts/interfaces/IAToken.sol";
import {IERC20} from "@aave/core-v3/contracts/dependencies/openzeppelin/contracts/IERC20.sol";

contract AaveGatewayView is IGatewayView {
    IPoolAddressesProvider public immutable poolAddressesProvider;
    IUiPoolDataProviderV3 public immutable uiPoolDataProvider;

    constructor(address _poolAddressesProvider, address _uiPoolDataProvider) {
        poolAddressesProvider = IPoolAddressesProvider(_poolAddressesProvider);
        uiPoolDataProvider = IUiPoolDataProviderV3(_uiPoolDataProvider);
    }

    function getBalance(address token, address user) external view override returns (uint256) {
        (address aToken,, bool found) = _getReserveAddresses(token);
        if (found && aToken != address(0)) {
            try IERC20(aToken).balanceOf(user) returns (uint256 bal) { return bal; } catch {}
        }
        (IUiPoolDataProviderV3.UserReserveData[] memory userReserves,) =
            uiPoolDataProvider.getUserReservesData(poolAddressesProvider, user);
        for (uint256 i = 0; i < userReserves.length; i++) {
            if (userReserves[i].underlyingAsset == token) {
                return userReserves[i].scaledATokenBalance;
            }
        }
        return 0;
    }

    function getBorrowBalance(address token, address user) public view override returns (uint256) {
        (, address variableDebtToken, bool found) = _getReserveAddresses(token);
        if (found && variableDebtToken != address(0)) {
            try IERC20(variableDebtToken).balanceOf(user) returns (uint256 bal) { return bal; } catch {}
        }
        (IUiPoolDataProviderV3.UserReserveData[] memory userReserves,) =
            uiPoolDataProvider.getUserReservesData(poolAddressesProvider, user);
        for (uint256 i = 0; i < userReserves.length; i++) {
            if (userReserves[i].underlyingAsset == token) {
                return userReserves[i].scaledVariableDebt;
            }
        }
        return 0;
    }

    function getBorrowRate(address token) external view override returns (uint256, bool) {
        (IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves,) =
            uiPoolDataProvider.getReservesData(poolAddressesProvider);
        for (uint256 i = 0; i < reserves.length; i++) {
            if (reserves[i].underlyingAsset == token) {
                return (reserves[i].variableBorrowRate, true);
            }
        }
        return (0, false);
    }

    function getSupplyRate(address token) external view override returns (uint256, bool) {
        (IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves,) =
            uiPoolDataProvider.getReservesData(poolAddressesProvider);
        for (uint256 i = 0; i < reserves.length; i++) {
            if (reserves[i].underlyingAsset == token) {
                return (reserves[i].liquidityRate, true);
            }
        }
        return (0, false);
    }

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
        } catch {}
        return (address(0), address(0), false);
    }
}

