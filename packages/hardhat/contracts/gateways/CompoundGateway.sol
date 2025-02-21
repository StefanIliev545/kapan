// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "../interfaces/IGateway.sol";
import "../interfaces/ICompoundComet.sol";
import {FeedRegistryInterface} from "@chainlink/contracts/src/v0.8/interfaces/FeedRegistryInterface.sol";
import {Denominations} from "@chainlink/contracts/src/v0.8/Denominations.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { ProtocolGateway } from "./ProtocolGateway.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "hardhat/console.sol";

contract CompoundGateway is IGateway, ProtocolGateway, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    event CollateralWithdrawn(address indexed market, address indexed collateral, address indexed user, uint256 amount);


    mapping(address => ICompoundComet) public tokenToComet;
    FeedRegistryInterface public priceFeed;
    mapping(address => AggregatorV3Interface) public overrideFeeds;

    modifier whenCometExists(address token) {
        if (address(tokenToComet[token]) != address(0)) {
            _;
        }
    }

    modifier cometMustExist(address token) {
        require(address(tokenToComet[token]) != address(0), "Comet is not set");
        _;
    }

    constructor(
        address router,
        ICompoundComet[] memory _comets,
        FeedRegistryInterface _priceFeed,
        address _owner
    ) ProtocolGateway(router) Ownable(_owner) {
        for (uint256 i = 0; i < _comets.length; i++) {
            if (address(_comets[i]) != address(0)) {
                tokenToComet[address(_comets[i].baseToken())] = _comets[i];
            }
        }
        priceFeed = _priceFeed;
    }

    function overrideFeed(address token, AggregatorV3Interface feed) external onlyOwner {
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

    function depositToComet(ICompoundComet comet, address token, address user, uint256 amount) private {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);        
        IERC20(token).approve(address(comet), amount);
        comet.supplyTo(user, token, amount);
    }

    function deposit(address token, address user, uint256 amount) external cometMustExist(token) nonReentrant {
        ICompoundComet comet = tokenToComet[token];
        depositToComet(comet, token, user, amount);
    }

    function depositCollateral(address market, address collateral, uint256 amount, address receiver) external cometMustExist(market) nonReentrant {
        ICompoundComet comet = tokenToComet[market];
        depositToComet(comet, collateral, receiver, amount);
    }
    

    // TODO: Insecure as this allows anyone to withdraw from a user's account, given this gateway will be manager.
    function withdrawCollateral(address market, address collateral, address user, uint256 amount) public onlyRouterOrSelf(user) cometMustExist(market) nonReentrant returns (address) {
        ICompoundComet comet = tokenToComet[market];
        console.log("withdrawing collateral", market, amount);
        comet.withdrawFrom(user, address(this), collateral, amount);
        emit CollateralWithdrawn(market, collateral, user, amount);
        console.log("transferring collateral", collateral, amount);
        IERC20(collateral).safeTransfer(msg.sender, amount);
        return collateral;
    }   

    function borrow(address token, address user, uint256 amount) external onlyRouterOrSelf(user) {
        withdrawCollateral(token, token, user, amount);
        console.log("borrowed", token, amount);
    }   

    function repay(address token, address user, uint256 amount) external override nonReentrant {
        // For Compound, repaying is the same as supplying
        // The negative balance will be used to repay the debt
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        
        ICompoundComet comet = tokenToComet[token];
        IERC20(token).approve(address(comet), amount);
        comet.supplyTo(user, token, amount);
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

    function getPossibleCollaterals(address token, address user) external view returns (
        address[] memory collateralAddresses,
        uint256[] memory balances,
        string[] memory symbols,
        uint8[] memory decimals
    ) {
        (address[] memory collaterals, uint128[] memory rawBalances, string[] memory displayNames) = getDepositedCollaterals(token, user);
        
        // Count non-zero balances
        uint256 nonZeroCount = 0;
        for (uint256 i = 0; i < rawBalances.length; i++) {
            if (rawBalances[i] > 0) {
                nonZeroCount++;
            }
        }

        // Create new arrays with only non-zero balances
        collateralAddresses = new address[](nonZeroCount);
        balances = new uint256[](nonZeroCount);
        symbols = new string[](nonZeroCount);
        decimals = new uint8[](nonZeroCount);

        // Fill arrays with non-zero balance entries
        uint256 j = 0;
        for (uint256 i = 0; i < rawBalances.length; i++) {
            if (rawBalances[i] > 0) {
                collateralAddresses[j] = collaterals[i];
                balances[j] = uint256(rawBalances[i]);
                symbols[j] = displayNames[i];
                decimals[j] = IERC20Metadata(collaterals[i]).decimals();
                j++;
            }
        }
    }

    function getDepositedCollaterals(address token, address account)
        public
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

    function getEncodedCollateralApprovals(address token, Collateral[] calldata) external view returns (address[] memory target, bytes[] memory data) {
        ICompoundComet comet = tokenToComet[token];
        target = new address[](1);
        data = new bytes[](1);
        target[0] = address(comet);
        data[0] = abi.encodeWithSelector(ICompoundComet.allow.selector, address(this), true);
    }

    function getEncodedDebtApproval(address token, uint256) external view returns (address[] memory target, bytes[] memory data) {
        ICompoundComet comet = tokenToComet[token];
        target = new address[](1);
        data = new bytes[](1);
        target[0] = address(comet);
        data[0] = abi.encodeWithSelector(ICompoundComet.allow.selector, address(this), true);
    }
}
