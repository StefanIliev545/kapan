// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "../interfaces/IGateway.sol";
import "../interfaces/ICompoundComet.sol";
import {FeedRegistryInterface} from "../interfaces/chainlink/FeedRegistryInterface.sol";
import {Denominations} from "../interfaces/chainlink/Denominations.sol";
import {AggregatorV3Interface} from "../interfaces/chainlink/AggregatorV3Interface.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { ProtocolGateway } from "./ProtocolGateway.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

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
    function withdrawCollateral(address market, address collateral, address user, uint256 amount) public onlyRouterOrSelf(user) cometMustExist(market) nonReentrant returns (address, uint256) {
        ICompoundComet comet = tokenToComet[market];
        (uint128 bal, ) = comet.userCollateral(user, collateral);
        uint256 collateralBal = uint256(bal);
        uint256 withdrawAmount = amount;
        if (withdrawAmount == type(uint256).max || withdrawAmount > collateralBal) {
            withdrawAmount = collateralBal;
        }
        if (withdrawAmount == 0) {
            return (collateral, 0);
        }
        comet.withdrawFrom(user, address(this), collateral, withdrawAmount);
        emit CollateralWithdrawn(market, collateral, user, withdrawAmount);
        IERC20(collateral).safeTransfer(msg.sender, withdrawAmount);
        return (collateral, withdrawAmount);
    }

    function borrow(address token, address user, uint256 amount) external onlyRouterOrSelf(user) {
        withdrawCollateral(token, token, user, amount);
    }   

    function repay(address token, address user, uint256 amount) external override nonReentrant {
        ICompoundComet comet = tokenToComet[token];
        uint256 debt = getBorrowBalance(token, user);
        uint256 repayAmount = amount;
        if (repayAmount == type(uint256).max || repayAmount > debt) {
            repayAmount = debt;
        }
        IERC20(token).safeTransferFrom(msg.sender, address(this), repayAmount);
        IERC20(token).approve(address(comet), repayAmount);
        comet.supplyTo(user, token, repayAmount);
    }

    function getBalance(address token, address user) external view returns (uint256) {
        return tokenToComet[token].balanceOf(user);
    }

    function getBorrowBalance(address token, address user) public view returns (uint256) {
        return tokenToComet[token].borrowBalanceOf(user);
    }

    function getBorrowBalanceCurrent(address token, address user) external returns (uint256) {
        return getBorrowBalance(token, user);
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

    function getCollateralPrice(address market,address asset) public view returns (uint256) {
        ICompoundComet comet = tokenToComet[market];
        ICompoundComet.AssetInfo memory info = comet.getAssetInfoByAddress(asset);
        return comet.getPrice(info.priceFeed);
    }

    /**
     * @notice Get prices for multiple tokens at once
     * @param tokens Array of token addresses
     * @return prices Array of token prices in USD (same decimals as individual getPrice calls)
     */
    function getPrices(address market,address[] calldata tokens) public view returns (uint256[] memory) {
        uint256[] memory prices = new uint256[](tokens.length);
        
        for (uint i = 0; i < tokens.length; i++) {
            prices[i] = getCollateralPrice(market,tokens[i]);
        }
        
        return prices;
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

    function getEncodedDebtApproval(address token, uint256 amount, address user) external view override returns (address[] memory target, bytes[] memory data) {
        ICompoundComet comet = tokenToComet[token];
        target = new address[](1);
        data = new bytes[](1);
        target[0] = address(comet);
        data[0] = abi.encodeWithSelector(ICompoundComet.allow.selector, address(this), true);
        return (target, data);
    }
    
    /**
     * @notice Check if a collateral token is supported for a specific market in Compound
     * @param market The address of the market token
     * @param collateral The address of the collateral token to check
     * @return isSupported Whether the collateral is supported in the market
     */
    function isCollateralSupported(address market, address collateral) external view override returns (bool isSupported) {
        ICompoundComet comet = tokenToComet[market];
        if (address(comet) == address(0)) {
            return false;
        }
        
        // Iterate through all assets to find if the collateral is supported
        uint8 numAssets = comet.numAssets();
        for (uint8 i = 0; i < numAssets; i++) {
            ICompoundComet.AssetInfo memory info = comet.getAssetInfo(i);
            if (info.asset == collateral) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * @notice Get all supported collaterals for a specific market in Compound
     * @param market The address of the market token
     * @return collateralAddresses Array of supported collateral token addresses
     */
    function getSupportedCollaterals(address market) external view override returns (address[] memory collateralAddresses) {
        ICompoundComet comet = tokenToComet[market];
        if (address(comet) == address(0)) {
            return new address[](0);
        }
        
        uint8 numAssets = comet.numAssets();
        collateralAddresses = new address[](numAssets);
        
        for (uint8 i = 0; i < numAssets; i++) {
            ICompoundComet.AssetInfo memory info = comet.getAssetInfo(i);
            collateralAddresses[i] = info.asset;
        }
        
        return collateralAddresses;
    }

    /**
     * @notice Get additional actions required for a token when providing collateral (not used in Compound)
     * @param token The token to borrow
     * @param collaterals The collaterals to use
     * @return target Array of target contract addresses (empty for Compound)
     * @return data Array of encoded function call data (empty for Compound)
     */
    function getInboundCollateralActions(address token, Collateral[] calldata collaterals) external view override returns (address[] memory target, bytes[] memory data) {
        // Compound doesn't require any additional actions
        return (new address[](0), new bytes[](0));
    }
}
