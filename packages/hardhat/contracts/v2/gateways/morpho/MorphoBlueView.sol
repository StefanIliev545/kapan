// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IGateway} from "../../interfaces/IGateway.sol";

interface IMorpho {
    struct MarketParams {
        address loanToken;
        address collateralToken;
        address oracle;
        address irm;
        uint256 lltv;
    }

    function idToMarketParams(bytes32 marketId) external view returns (MarketParams memory);
    function supplyShares(bytes32 marketId, address user) external view returns (uint256);
    function borrowShares(bytes32 marketId, address user) external view returns (uint256);
    function collateral(bytes32 marketId, address user) external view returns (uint256);
    function totalSupplyAssets(bytes32 marketId) external view returns (uint256);
    function totalSupplyShares(bytes32 marketId) external view returns (uint256);
    function totalBorrowAssets(bytes32 marketId) external view returns (uint256);
    function totalBorrowShares(bytes32 marketId) external view returns (uint256);
}

/**
 * @title MorphoBlueView
 * @notice View-only gateway for Morpho Blue protocol
 * @dev Contains all read/view functions, separate from write operations
 * Context format: abi.encode(address morpho, bytes32 marketId)
 */
contract MorphoBlueView {
    error MorphoBlueView__InvalidContext();

    /**
     * @notice Returns the account balances and total market sizes for a given Morpho Blue market and user.
     * @param context Encoded context containing the Morpho contract address and market identifier (abi.encode(address morpho, bytes32 marketId)).
     * @param user The address of the account to query.
     * @return loanToken The address of the market's loan (borrowable) asset.
     * @return collateralToken The address of the market's collateral asset.
     * @return userSupplyAmount The amount of loanToken that the user has supplied (lent) in this market.
     * @return userCollateralAmount The amount of collateralToken that the user has deposited as collateral in this market.
     * @return userBorrowAmount The amount of loanToken that the user has borrowed in this market.
     * @return totalSupplyAmount The total amount of loanToken supplied (lent) by all users in this market.
     * @return totalBorrowAmount The total amount of loanToken borrowed by all users in this market.
     */
    function getMarketBalances(bytes calldata context, address user)
        external
        view
        returns (
            address loanToken,
            address collateralToken,
            uint256 userSupplyAmount,
            uint256 userCollateralAmount,
            uint256 userBorrowAmount,
            uint256 totalSupplyAmount,
            uint256 totalBorrowAmount
        )
    {
        if (context.length != 64) {
            revert MorphoBlueView__InvalidContext();
        }

        (address morphoAddr, bytes32 marketId) = abi.decode(context, (address, bytes32));
        IMorpho morpho = IMorpho(morphoAddr);

        // Get market parameters to obtain asset addresses
        IMorpho.MarketParams memory marketParams = morpho.idToMarketParams(marketId);
        loanToken = marketParams.loanToken;
        collateralToken = marketParams.collateralToken;

        // Fetch total assets and shares for supply and borrow
        totalSupplyAmount = morpho.totalSupplyAssets(marketId);
        uint256 totalSupplyShares = morpho.totalSupplyShares(marketId);
        totalBorrowAmount = morpho.totalBorrowAssets(marketId);
        uint256 totalBorrowShares = morpho.totalBorrowShares(marketId);

        // Fetch user positions: supply shares, borrow shares, and collateral amount
        uint256 userSupplyShares = morpho.supplyShares(marketId, user);
        uint256 userBorrowShares = morpho.borrowShares(marketId, user);
        userCollateralAmount = morpho.collateral(marketId, user);

        // Compute user's supply and borrow amounts in underlying terms.
        // If there are no shares (or total shares is zero), result is zero to avoid division by zero.
        if (totalSupplyShares > 0) {
            // Calculate supply amount proportionally: (userShares / totalShares) * totalAssets
            userSupplyAmount = (userSupplyShares * totalSupplyAmount) / totalSupplyShares;
        } else {
            userSupplyAmount = 0;
        }

        if (totalBorrowShares > 0) {
            // Calculate borrow amount proportionally: (userShares / totalShares) * totalAssets
            userBorrowAmount = (userBorrowShares * totalBorrowAmount) / totalBorrowShares;
        } else {
            userBorrowAmount = 0;
        }
    }

    function getBalance(address token, address user) public view returns (uint256) {
        revert("MorphoBlue: use getMarketBalances with context");
    }

    function getBorrowBalance(address token, address user) public view returns (uint256) {
        revert("MorphoBlue: use getMarketBalances with context");
    }

    function getBorrowBalanceCurrent(address token, address user) external returns (uint256) {
        return getBorrowBalance(token, user);
    }

    function getBorrowRate(address token) external view returns (uint256, bool) {
        // Morpho Blue uses IRM (Interest Rate Model) per market
        // Rate calculation would require market context
        return (0, false);
    }

    function getSupplyRate(address token) external view returns (uint256, bool) {
        // Morpho Blue uses IRM (Interest Rate Model) per market
        // Rate calculation would require market context
        return (0, false);
    }

    function getPossibleCollaterals(address /* market */, address /* user */) external pure returns (
        address[] memory collateralAddresses,
        uint256[] memory balances,
        string[] memory symbols,
        uint8[] memory decimals
    ) {
        // Morpho Blue markets are isolated - each market has one collateral token
        // This would require market context to return
        collateralAddresses = new address[](0);
        balances = new uint256[](0);
        symbols = new string[](0);
        decimals = new uint8[](0);
    }

    function isCollateralSupported(address /* market */, address /* collateral */) external pure returns (bool isSupported) {
        // Morpho Blue markets are isolated - each market has one collateral token
        // This would require market context to check
        return false;
    }

    function getSupportedCollaterals(address /* market */) external pure returns (address[] memory collateralAddresses) {
        // Morpho Blue markets are isolated - each market has one collateral token
        // This would require market context to return
        collateralAddresses = new address[](0);
    }

    function getLtv(address /* token */, address /* user */) external pure returns (uint256) {
        // Morpho Blue LTV is per-market (lltv in MarketParams)
        // This would require market context to return
        return 0;
    }

    function getEncodedCollateralApprovals(address /* token */, IGateway.Collateral[] calldata /* collaterals */) 
        external 
        pure 
        returns (address[] memory target, bytes[] memory data) 
    {
        // Morpho Blue doesn't require special collateral approvals - standard ERC20 approvals are handled by router
        target = new address[](0);
        data = new bytes[](0);
    }

    function getEncodedDebtApproval(address /* token */, uint256 /* amount */, address /* user */) 
        external 
        pure 
        returns (address[] memory target, bytes[] memory data) 
    {
        // Morpho Blue doesn't require special debt approvals - standard ERC20 approvals are handled by router
        target = new address[](0);
        data = new bytes[](0);
    }

    function getInboundCollateralActions(address /* token */, IGateway.Collateral[] calldata /* collaterals */) 
        external 
        pure 
        returns (address[] memory target, bytes[] memory data) 
    {
        // Morpho Blue doesn't require special inbound collateral actions
        target = new address[](0);
        data = new bytes[](0);
    }
}

