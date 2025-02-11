// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "../interfaces/IGateway.sol";
import "../interfaces/ICompoundComet.sol";
import {FeedRegistryInterface} from "@chainlink/contracts/src/v0.8/interfaces/FeedRegistryInterface.sol";
import {Denominations} from "@chainlink/contracts/src/v0.8/Denominations.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract CompoundGateway is IGateway {

    mapping(address => ICompoundComet) public tokenToComet;
    FeedRegistryInterface public priceFeed;
    mapping(address => AggregatorV3Interface) public overrideFeeds;

    modifier whenCometExists(address token) {
        if (address(tokenToComet[token]) != address(0)) {
            _;
        }
    }

    constructor(
        ICompoundComet _USDCComet, 
        ICompoundComet _USDTComet, 
        ICompoundComet _USDCeComet, 
        ICompoundComet _ethComet,
        FeedRegistryInterface _priceFeed
    ) {
        require(address(_USDCComet.baseToken()) != address(0), "USDCComet is not set");
        require(address(_USDTComet.baseToken()) != address(0), "USDTComet is not set");
        require(address(_USDCeComet.baseToken()) != address(0), "USDCeComet is not set");
        require(address(_ethComet.baseToken()) != address(0), "ethComet is not set");

        tokenToComet[address(_USDCComet.baseToken())] = _USDCComet;
        tokenToComet[address(_USDTComet.baseToken())] = _USDTComet;
        tokenToComet[address(_USDCeComet.baseToken())] = _USDCeComet;
        tokenToComet[address(_ethComet.baseToken())] = _ethComet;
        priceFeed = _priceFeed;
    }

    function overrideFeed(address token, AggregatorV3Interface feed) external {
        overrideFeeds[token] = feed;
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

    function getDepositedCollaterals(address token, address account)
        external
        view
        returns (address[] memory collaterals, uint128[] memory balances, string[] memory displayNames)
    {
        ICompoundComet comet = tokenToComet[token];
        require(address(comet) != address(0), "Comet is not set");
        uint8 n = comet.numAssets();        
        // Allocate arrays of the correct size.
        collaterals = new address[](n);
        displayNames = new string[](n);
        balances = new uint128[](n);
        
        uint256 index = 0;
        // Populate the arrays with assets that have a nonzero balance.
        for (uint8 i = 0; i < n; i++) {
            ICompoundComet.AssetInfo memory info = comet.getAssetInfo(i);
            (uint128 bal, ) = comet.userCollateral(account, info.asset);
            collaterals[index] = info.asset;
            displayNames[index] = ERC20(info.asset).symbol();
            balances[index] = bal;
            index++;
        }
    }

    function getPrice(address token) public view returns (uint256) {
        if (address(overrideFeeds[token]) != address(0)) {
            (, int256 price,,,) = overrideFeeds[token].latestRoundData();
            return uint256(price);
        }

        if (address(priceFeed) != address(0)) {
            (, int256 price,,,) = priceFeed.latestRoundData(token, Denominations.USD);
            return uint256(price);
        }

        address theirFeed = tokenToComet[token].baseTokenPriceFeed();
        if (theirFeed != address(0)) {
            return tokenToComet[token].getPrice(theirFeed);
        }

        return 0;
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
