// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "../interfaces/IGateway.sol";
import "../interfaces/ICompoundComet.sol";

contract CompoundGateway is IGateway {

    mapping(address => ICompoundComet) public tokenToComet;

    modifier whenCometExists(address token) {
        if (address(tokenToComet[token]) != address(0)) {
            _;
        }
    }

    constructor(
        ICompoundComet _USDCComet, 
        ICompoundComet _USDTComet, 
        ICompoundComet _USDCeComet, 
        ICompoundComet _ethComet
    ) {
        require(address(_USDCComet.baseToken()) != address(0), "USDCComet is not set");
        require(address(_USDTComet.baseToken()) != address(0), "USDTComet is not set");
        require(address(_USDCeComet.baseToken()) != address(0), "USDCeComet is not set");
        require(address(_ethComet.baseToken()) != address(0), "ethComet is not set");

        tokenToComet[address(_USDCComet.baseToken())] = _USDCComet;
        tokenToComet[address(_USDTComet.baseToken())] = _USDTComet;
        tokenToComet[address(_USDCeComet.baseToken())] = _USDCeComet;
        tokenToComet[address(_ethComet.baseToken())] = _ethComet;
    }

    function getSupplyRate(address token) external view whenCometExists(token) returns (uint256 supplyRate, bool success) {
        supplyRate = tokenToComet[token].getSupplyRate(tokenToComet[token].getUtilization());
        success = true;
    }

    function getBorrowRate(address token) external view whenCometExists(token) returns (uint256 borrowRate, bool success) {
        borrowRate = tokenToComet[token].getBorrowRate(tokenToComet[token].getUtilization());
        success = true;
    }

    function getBaseToken(ICompoundComet comet) external view returns (address) {
        return comet.baseToken();
    }

    function deposit(address token, address user, uint256 amount) external {
        // TODO: Implement
    }

    function withdraw(address token, address user, uint256 amount) external {
        // TODO: Implement
    }   

    function borrow(address token, address user, uint256 amount) external {
        // TODO: Implement
    }   

    function repay(address token, address user, uint256 amount) external {
        // TODO: Implement
    }

    function getBalance(address token, address user) external view returns (uint256) {
        return tokenToComet[token].balanceOf(user);
    }

    function getBorrowBalance(address token, address user) external view returns (uint256) {
        return tokenToComet[token].borrowBalanceOf(user);
    }

    function getLtv(address token, address user) external view returns (uint256) {
        // TODO: Implement
    }

    function getMaxLtv(address token) external view returns (uint256) {
        // TODO: Implement
    }

    function getDepositedCollaterals(ICompoundComet comet, address account)
        external
        view
        returns (address[] memory collaterals, uint128[] memory balances)
    {
        uint8 n = comet.numAssets();
        uint256 count = 0;
        
        // First, determine how many assets have a nonzero collateral balance.
        for (uint8 i = 0; i < n; i++) {
            ICompoundComet.AssetInfo memory info = comet.getAssetInfo(i);
            uint128 bal = comet.collateralBalanceOf(account, info.asset);
            if (bal > 0) {
                count++;
            }
        }
        
        // Allocate arrays of the correct size.
        collaterals = new address[](count);
        balances = new uint128[](count);
        
        uint256 index = 0;
        // Populate the arrays with assets that have a nonzero balance.
        for (uint8 i = 0; i < n; i++) {
            ICompoundComet.AssetInfo memory info = comet.getAssetInfo(i);
            uint128 bal = comet.collateralBalanceOf(account, info.asset);
            if (bal > 0) {
                collaterals[index] = info.asset;
                balances[index] = bal;
                index++;
            }
        }
    }

    function getPrice(address token) public view returns (uint256) {
        address priceFeed = tokenToComet[token].baseTokenPriceFeed();
        return tokenToComet[token].getPrice(priceFeed);
    }

    // New function: Aggregates all compound data needed for the readHook.
    // Returns supply rate, borrow rate, balance, and borrow balance for the given token and account.
    function getCompoundData(address token, address account)
        external
        view
        returns (
            uint256 supplyRate,
            uint256 borrowRate,
            uint256 balance,
            uint256 borrowBalance,
            uint256 price,
            uint256 priceScale
        )
    {
        ICompoundComet comet = tokenToComet[token];
        supplyRate = comet.getSupplyRate(comet.getUtilization());
        borrowRate = comet.getBorrowRate(comet.getUtilization());
        balance = comet.balanceOf(account);
        borrowBalance = comet.borrowBalanceOf(account);
        price = getPrice(token);
        priceScale = comet.priceScale();
    }
}
