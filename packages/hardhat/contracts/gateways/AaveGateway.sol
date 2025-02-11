// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IGateway } from "../interfaces/IGateway.sol";
import { IPoolAddressesProvider } from "../interfaces/aave/IPoolAddressesProvider.sol";
import { IUiPoolDataProviderV3 } from "../interfaces/aave/IUiDataProvider.sol";

contract AaveGateway is IGateway {
    IPoolAddressesProvider public immutable poolAddressesProvider;
    IUiPoolDataProviderV3 public immutable uiPoolDataProvider;

    constructor(address _poolAddressesProvider, address _uiPoolDataProvider) {
        poolAddressesProvider = IPoolAddressesProvider(_poolAddressesProvider);
        uiPoolDataProvider = IUiPoolDataProviderV3(_uiPoolDataProvider);
    }

    function getLtv(address token, address user) external view returns (uint256) {
        // TODO: Implement
    }

    function deposit(address token, address user, uint256 amount) external override {}

    function withdraw(address token, address user, uint256 amount) external override {}

    function borrow(address token, address user, uint256 amount) external override {}

    function repay(address token, address user, uint256 amount) external override {}

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

    function getAllTokensInfo(address user) external view returns (TokenInfo[] memory) {
        (IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves, ) = uiPoolDataProvider.getReservesData(poolAddressesProvider);
        TokenInfo[] memory tokens = new TokenInfo[](reserves.length);
        for (uint256 i = 0; i < reserves.length; i++) {
            uint256 borrowBalance = getBorrowBalance(reserves[i].underlyingAsset, user);
            uint256 balance = getBalance(reserves[i].underlyingAsset, user);
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

    function getBorrowRate(address token) external view override returns (uint256) {
        (IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves, ) = uiPoolDataProvider.getReservesData(poolAddressesProvider);
        for (uint256 i = 0; i < reserves.length; i++) {
            if (reserves[i].underlyingAsset == token) {
                return reserves[i].variableBorrowRate;
            }
        }
        return 0;
    }

    function getSupplyRate(address token) external view override returns (uint256) {
        (IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves, ) = uiPoolDataProvider.getReservesData(poolAddressesProvider);
        for (uint256 i = 0; i < reserves.length; i++) {
            if (reserves[i].underlyingAsset == token) {
                return reserves[i].liquidityRate;
            }
        }
        return 0;
    }


    function getBalance(address token, address user) public view override returns (uint256) {
        (IUiPoolDataProviderV3.UserReserveData[] memory userReserves, ) = uiPoolDataProvider.getUserReservesData(poolAddressesProvider, user);
        for (uint256 i = 0; i < userReserves.length; i++) {
            if (userReserves[i].underlyingAsset == token) {
                return userReserves[i].scaledATokenBalance;
            }
        }
        return 0;
    }

    function getBorrowBalance(address token, address user) public view override returns (uint256) {
        (IUiPoolDataProviderV3.UserReserveData[] memory userReserves, ) = uiPoolDataProvider.getUserReservesData(poolAddressesProvider, user);
        for (uint256 i = 0; i < userReserves.length; i++) {
            if (userReserves[i].underlyingAsset == token) {
                return userReserves[i].scaledVariableDebt;
            }
        }
        return 0;
    }

    function borrowedTokens(address user) external view returns (address[] memory) {
        (IUiPoolDataProviderV3.UserReserveData[] memory userReserves, ) = uiPoolDataProvider.getUserReservesData(poolAddressesProvider, user);
        address[] memory tokens = new address[](userReserves.length);
        uint256 index = 0;
        for (uint256 i = 0; i < userReserves.length; i++) {
            if (userReserves[i].scaledVariableDebt > 0) {
                tokens[index++] = userReserves[i].underlyingAsset;
            }
        }
        return tokens;
    }
}