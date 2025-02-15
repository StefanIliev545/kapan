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

    function getLtv(address token, address user) external view returns (uint256) {
        // TODO: Implement
    }

    function deposit(address token, address user, uint256 amount) external override {
        address poolAddress = poolAddressesProvider.getPool();
        require(poolAddress != address(0), "Pool address not set");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).approve(poolAddress, amount);
        IPool(poolAddress).supply(token, amount, user, REFERRAL_CODE);
    }

    // not sure when this will ever be used. 
    function withdraw(address token, address user, uint256 amount) external override {
        revert("not implemented");
    }

    // the borrow function will work through the variable debt token's credit delegation mechanism. 
    // This means this gateway will borrow on behalf of the user when a new position is established, unsecured
    // for the protocol. 
    function borrow(address token, address user, uint256 amount) external override {
        revert("not implemented");
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

    function getBorrowRate(address token) external view override returns (uint256, bool) {
        (IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves, ) = uiPoolDataProvider.getReservesData(poolAddressesProvider);
        for (uint256 i = 0; i < reserves.length; i++) {
            if (reserves[i].underlyingAsset == token) {
                return (reserves[i].variableBorrowRate, true);
            }
        }
        return (0, false);
    }

    function getSupplyRate(address token) external view override returns (uint256, bool) {
        (IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves, ) = uiPoolDataProvider.getReservesData(poolAddressesProvider);
        for (uint256 i = 0; i < reserves.length; i++) {
            if (reserves[i].underlyingAsset == token) {
                return (reserves[i].liquidityRate, true);
            }
        }
        return (0, false);
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