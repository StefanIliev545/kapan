// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IPoolAddressesProvider} from "../../../interfaces/aave/IPoolAddressesProvider.sol";
import {IUiPoolDataProviderV3} from "../../../interfaces/aave/IUiDataProvider.sol";
import {IPoolDataProvider} from "@aave/core-v3/contracts/interfaces/IPoolDataProvider.sol";
import {IAToken} from "@aave/core-v3/contracts/interfaces/IAToken.sol";

interface IAaveGatewayView {
    struct TokenInfo { address token; uint256 supplyRate; uint256 borrowRate; string name; string symbol; uint256 price; uint256 borrowBalance; uint256 balance; address aToken; }
    struct Collateral { address token; uint256 amount; }
    function getAllTokensInfo(address user) external view returns (TokenInfo[] memory);
    function getBorrowRate(address token) external view returns (uint256 rate, bool found);
    function getSupplyRate(address token) external view returns (uint256 rate, bool found);
    function getBalance(address token, address user) external view returns (uint256);
    function getBorrowBalance(address token, address user) external view returns (uint256);
    function getBorrowBalanceCurrent(address token, address user) external view returns (uint256);
    function borrowedTokens(address user) external view returns (address[] memory);
    function getPossibleCollaterals(address token, address user) external view returns (address[] memory collateralAddresses, uint256[] memory balances, string[] memory symbols, uint8[] memory decimals);
    function getEncodedCollateralApprovals(address token, Collateral[] calldata collaterals) external view returns (address[] memory target, bytes[] memory data);
    function getEncodedDebtApproval(address token, uint256 amount, address user) external view returns (address[] memory target, bytes[] memory data);
    function getAToken(address underlyingToken) external view returns (address);
    function getUnderlyingToken(address aToken) external view returns (address);
    function isCollateralSupported(address market, address collateral) external view returns (bool isSupported);
    function getSupportedCollaterals(address market) external view returns (address[] memory collateralAddresses);
    function getInboundCollateralActions(address token, Collateral[] calldata collaterals) external view returns (address[] memory target, bytes[] memory data);
}

contract AaveGatewayView is IAaveGatewayView {
    IPoolAddressesProvider public immutable poolAddressesProvider;
    IUiPoolDataProviderV3 public immutable uiPoolDataProvider;
    address public immutable writeGateway;

    constructor(address _writeGateway, address _poolAddressesProvider, address _uiPoolDataProvider) {
        writeGateway = _writeGateway;
        poolAddressesProvider = IPoolAddressesProvider(_poolAddressesProvider);
        uiPoolDataProvider = IUiPoolDataProviderV3(_uiPoolDataProvider);
    }

    function getAllTokensInfo(address user) external view override returns (TokenInfo[] memory) {
        (IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves, ) = uiPoolDataProvider.getReservesData(poolAddressesProvider);
        (IUiPoolDataProviderV3.UserReserveData[] memory userReserves, ) = uiPoolDataProvider.getUserReservesData(poolAddressesProvider, user);
        TokenInfo[] memory tokens = new TokenInfo[](reserves.length);
        for (uint256 i = 0; i < reserves.length; i++) {
            uint256 bal = _getBalanceFromReserveData(reserves[i], user, userReserves);
            uint256 debt = _getBorrowBalanceFromReserveData(reserves[i], user, userReserves);
            tokens[i] = TokenInfo(reserves[i].underlyingAsset, reserves[i].liquidityRate, reserves[i].variableBorrowRate, reserves[i].name, reserves[i].symbol, reserves[i].priceInMarketReferenceCurrency, debt, bal, reserves[i].aTokenAddress);
        }
        return tokens;
    }

    function getBorrowRate(address token) external view override returns (uint256, bool) {
        (IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves, ) = uiPoolDataProvider.getReservesData(poolAddressesProvider);
        for (uint256 i = 0; i < reserves.length; i++) {
            if (reserves[i].underlyingAsset == token) return (reserves[i].variableBorrowRate, true);
        }
        return (0, false);
    }

    function getSupplyRate(address token) external view override returns (uint256, bool) {
        (IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves, ) = uiPoolDataProvider.getReservesData(poolAddressesProvider);
        for (uint256 i = 0; i < reserves.length; i++) {
            if (reserves[i].underlyingAsset == token) return (reserves[i].liquidityRate, true);
        }
        return (0, false);
    }

    function getBalance(address token, address user) public view override returns (uint256) {
        (address aToken,,) = _getReserveTokens(token);
        if (aToken != address(0)) {
            try IERC20(aToken).balanceOf(user) returns (uint256 bal) { return bal; } catch {}
        }
        (IUiPoolDataProviderV3.UserReserveData[] memory userReserves, ) = uiPoolDataProvider.getUserReservesData(poolAddressesProvider, user);
        for (uint256 i = 0; i < userReserves.length; i++) {
            if (userReserves[i].underlyingAsset == token) return userReserves[i].scaledATokenBalance;
        }
        return 0;
    }

    function getBorrowBalance(address token, address user) public view override returns (uint256) {
        (,, address vDebt) = _getReserveTokens(token);
        if (vDebt != address(0)) {
            try IERC20(vDebt).balanceOf(user) returns (uint256 bal) { return bal; } catch {}
        }
        (IUiPoolDataProviderV3.UserReserveData[] memory userReserves, ) = uiPoolDataProvider.getUserReservesData(poolAddressesProvider, user);
        for (uint256 i = 0; i < userReserves.length; i++) {
            if (userReserves[i].underlyingAsset == token) return userReserves[i].scaledVariableDebt;
        }
        return 0;
    }

    function getBorrowBalanceCurrent(address token, address user) external view override returns (uint256) {
        return getBorrowBalance(token, user);
    }

    function borrowedTokens(address user) external view override returns (address[] memory) {
        (IUiPoolDataProviderV3.UserReserveData[] memory userReserves, ) = uiPoolDataProvider.getUserReservesData(poolAddressesProvider, user);
        uint256 count; for (uint256 i = 0; i < userReserves.length; i++) if (userReserves[i].scaledVariableDebt > 0) count++;
        address[] memory tokens = new address[](count); uint256 idx;
        for (uint256 i = 0; i < userReserves.length; i++) if (userReserves[i].scaledVariableDebt > 0) tokens[idx++] = userReserves[i].underlyingAsset;
        return tokens;
    }

    function getPossibleCollaterals(address /*token*/, address user)
        external view override
        returns (address[] memory collateralAddresses, uint256[] memory balances, string[] memory symbols, uint8[] memory decimals)
    {
        if (user == address(0)) {
            (IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves,) = uiPoolDataProvider.getReservesData(poolAddressesProvider);
            uint256 n = reserves.length;
            collateralAddresses = new address[](n); balances = new uint256[](n); symbols = new string[](n); decimals = new uint8[](n);
            for (uint256 i = 0; i < n; i++) {
                collateralAddresses[i] = reserves[i].underlyingAsset;
                symbols[i] = reserves[i].symbol;
                try ERC20(reserves[i].underlyingAsset).decimals() returns (uint8 dec) { decimals[i] = dec; } catch { decimals[i] = 18; }
            }
            return (collateralAddresses, balances, symbols, decimals);
        }
        TokenInfo[] memory all = this.getAllTokensInfo(user);
        uint256 count; for (uint256 i = 0; i < all.length; i++) if (all[i].balance > 0) count++;
        collateralAddresses = new address[](count); balances = new uint256[](count); symbols = new string[](count); decimals = new uint8[](count);
        uint256 idx; for (uint256 i = 0; i < all.length; i++) if (all[i].balance > 0) {
            collateralAddresses[idx] = all[i].token; balances[idx] = all[i].balance; symbols[idx] = all[i].symbol;
            try ERC20(all[i].token).decimals() returns (uint8 dec) { decimals[idx] = dec; } catch { decimals[idx] = 18; }
            idx++;
        }
        return (collateralAddresses, balances, symbols, decimals);
    }

    function getEncodedCollateralApprovals(address /*token*/, Collateral[] calldata collaterals)
        external view override returns (address[] memory target, bytes[] memory data)
    {
        target = new address[](collaterals.length); data = new bytes[](collaterals.length);
        for (uint256 i = 0; i < collaterals.length; i++) {
            address aToken = getAToken(collaterals[i].token);
            target[i] = aToken;
            data[i] = abi.encodeWithSelector(IERC20.approve.selector, writeGateway, collaterals[i].amount);
        }
    }

    function getEncodedDebtApproval(address token, uint256 /*amount*/, address /*user*/)
        external view override returns (address[] memory target, bytes[] memory data)
    {
        (, , address vDebt) = _getReserveTokens(token);
        require(vDebt != address(0), "Token not listed");
        target = new address[](1); data = new bytes[](1); target[0] = vDebt;
        data[0] = abi.encodeWithSignature("approveDelegation(address,uint256)", writeGateway, type(uint256).max);
    }

    function getAToken(address underlyingToken) public view override returns (address) {
        IPoolDataProvider dataProvider = IPoolDataProvider(poolAddressesProvider.getPoolDataProvider());
        (address aTokenAddress, , ) = dataProvider.getReserveTokensAddresses(underlyingToken);
        return aTokenAddress;
    }
    function getUnderlyingToken(address aToken) external view override returns (address) {
        try IAToken(aToken).UNDERLYING_ASSET_ADDRESS() returns (address u) { return u; } catch { return address(0); }
    }

    function isCollateralSupported(address /*market*/, address collateral) external view override returns (bool isSupported) {
        (IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves,) = uiPoolDataProvider.getReservesData(poolAddressesProvider);
        for (uint256 i = 0; i < reserves.length; i++) if (reserves[i].underlyingAsset == collateral) return reserves[i].usageAsCollateralEnabled; return false;
    }

    function getSupportedCollaterals(address /*market*/) external view override returns (address[] memory collateralAddresses) {
        (IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves,) = uiPoolDataProvider.getReservesData(poolAddressesProvider);
        uint256 count; for (uint256 i = 0; i < reserves.length; i++) if (reserves[i].usageAsCollateralEnabled) count++;
        collateralAddresses = new address[](count); uint256 idx;
        for (uint256 i = 0; i < reserves.length; i++) if (reserves[i].usageAsCollateralEnabled) collateralAddresses[idx++] = reserves[i].underlyingAsset;
    }

    function getInboundCollateralActions(address /*token*/, Collateral[] calldata /*collaterals*/)
        external pure override returns (address[] memory target, bytes[] memory data)
    { return (new address[](0), new bytes[](0)); }

    function _getReserveTokens(address underlying) internal view returns (address aToken, address sDebt, address vDebt) {
        IPoolDataProvider dataProvider = IPoolDataProvider(poolAddressesProvider.getPoolDataProvider());
        (aToken, sDebt, vDebt) = dataProvider.getReserveTokensAddresses(underlying);
    }

    function _getBalanceFromReserveData(IUiPoolDataProviderV3.AggregatedReserveData memory reserve, address user, IUiPoolDataProviderV3.UserReserveData[] memory userReserves) internal view returns (uint256) {
        if (reserve.aTokenAddress != address(0)) {
            try IERC20(reserve.aTokenAddress).balanceOf(user) returns (uint256 bal) { return bal; } catch {}
        }
        for (uint256 i = 0; i < userReserves.length; i++) if (userReserves[i].underlyingAsset == reserve.underlyingAsset) return userReserves[i].scaledATokenBalance; return 0;
    }
    function _getBorrowBalanceFromReserveData(IUiPoolDataProviderV3.AggregatedReserveData memory reserve, address user, IUiPoolDataProviderV3.UserReserveData[] memory userReserves) internal view returns (uint256) {
        if (reserve.variableDebtTokenAddress != address(0)) {
            try IERC20(reserve.variableDebtTokenAddress).balanceOf(user) returns (uint256 bal) { return bal; } catch {}
        }
        for (uint256 i = 0; i < userReserves.length; i++) if (userReserves[i].underlyingAsset == reserve.underlyingAsset) return userReserves[i].scaledVariableDebt; return 0;
    }
}


