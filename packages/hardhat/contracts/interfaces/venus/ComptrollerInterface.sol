// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "./VTokenInterface.sol";

/**
 * @title Venus's Comptroller Interface
 * @notice Interface for interacting with Venus Comptroller
 * @dev Adapted for compatibility with Solidity ^0.8.10 from Venus v4 documentation
 * @dev Source: https://docs-v4.venus.io/technical-reference/reference-core-pool/comptroller/diamond/facets/market-facet
 */
interface ComptrollerInterface {
    /**
     * @notice Indicator that this is a Comptroller contract (for inspection)
     */
    function isComptroller() external pure returns (bool);
    
    /**
     * @notice Enters a list of markets (vTokens)
     * @param vTokens The list of addresses of the vToken markets to enter
     * @return success A list of error codes (0=success, otherwise a failure)
     */
    function enterMarkets(address[] calldata vTokens) external returns (uint[] memory);
    
    /**
     * @notice Exits a vToken market
     * @param vTokenAddress Address of the vToken market to exit
     * @return success 0=success, otherwise a failure
     */
    function exitMarket(address vTokenAddress) external returns (uint);
    
    /**
     * @notice Returns the list of vToken markets an account has entered
     * @param account The address of the account to query
     * @return The list of vToken markets the account has entered
     */
    function getAssetsIn(address account) external view returns (VTokenInterface[] memory);
    
    /**
     * @notice Checks if an account is entered into a specific market
     * @param account The address of the account to check
     * @param vToken The vToken market to check
     * @return True if the account is in the market, otherwise false
     */
    function checkMembership(address account, address vToken) external view returns (bool);
    
    /**
     * @notice Returns a list of all vToken markets
     * @return A list of all vToken market addresses
     */
    function getAllMarkets() external view returns (VTokenInterface[] memory);
    
    /**
     * @notice Determine the amount of vToken that could be seized in a liquidation
     * @param vTokenBorrowed The borrowed vToken
     * @param vTokenCollateral The collateral vToken
     * @param actualRepayAmount The amount of vTokenBorrowed underlying to repay
     * @return errorCode 0=success, otherwise a failure
     * @return seizeTokens The number of vTokenCollateral tokens to seize
     */
    function liquidateCalculateSeizeTokens(
        address vTokenBorrowed,
        address vTokenCollateral,
        uint actualRepayAmount
    ) external view returns (uint, uint);
    
    /**
     * @notice Calculate amount of tokens to seize in a VAI liquidation
     * @param vTokenCollateral The collateral vToken
     * @param actualRepayAmount The amount of VAI to repay
     * @return errorCode 0=success, otherwise a failure
     * @return seizeTokens The number of vTokenCollateral tokens to seize
     */
    function liquidateVAICalculateSeizeTokens(address vTokenCollateral, uint actualRepayAmount) external view returns (uint, uint);
    
    /**
     * @notice Update delegate status to allow/disallow borrowing on behalf
     * @param delegate The delegate address
     * @param allowBorrows Whether to allow the delegate to borrow
     */
    function updateDelegate(address delegate, bool allowBorrows) external;
    
    function approvedDelegates(address user, address delegate) external view returns (bool);
    
    /**
     * @notice Return information about a specific market
     * @dev On Venus v4 core pool, the third value is the liquidation threshold,
     *      NOT an "isComped" flag as on some older Comptroller variants.
     * @param vToken The vToken address to get market data for
     * @return isListed Whether the market is listed
     * @return collateralFactorMantissa The collateral factor (LTV) for the market (scaled by 1e18)
     * @return liquidationThresholdMantissa The liquidation threshold (LLTV) for the market (scaled by 1e18)
     */
    function markets(address vToken)
        external
        view
        returns (
            bool isListed,
            uint256 collateralFactorMantissa,
            uint256 liquidationThresholdMantissa
        );
    
    /**
     * @notice Get the account liquidity information
     * @param account The address of the account
     * @return error Error code (0=success, otherwise a failure)
     * @return liquidity The USD value borrowable by the account
     * @return shortfall The USD value of collateral needed to meet obligations
     */
    function getAccountLiquidity(address account) external view returns (uint, uint, uint);
    
    /**
     * @notice Check if a specific action is allowed
     * @param vToken The vToken market to check
     * @param action The action to check (mint=1, redeem=2, borrow=3, repay=4, etc.)
     * @return True if the action is allowed
     */
    function actionAllowed(address vToken, uint8 action) external view returns (bool);
    
    /**
     * @notice Checks if a borrow is allowed
     * @param vToken The vToken market to check
     * @param borrower The account borrowing
     * @param borrowAmount The amount of underlying to borrow
     * @return 0=success, otherwise a failure
     */
    function borrowAllowed(address vToken, address borrower, uint borrowAmount) external returns (uint);
    
    /**
     * @notice Checks if a mint is allowed
     * @param vToken The vToken market to check
     * @param minter The account minting
     * @param mintAmount The amount of underlying to mint
     * @return 0=success, otherwise a failure
     */
    function mintAllowed(address vToken, address minter, uint mintAmount) external returns (uint);
    
    /**
     * @notice Checks if a redeem is allowed
     * @param vToken The vToken market to check
     * @param redeemer The account redeeming
     * @param redeemTokens The amount of vTokens to redeem
     * @return 0=success, otherwise a failure
     */
    function redeemAllowed(address vToken, address redeemer, uint redeemTokens) external returns (uint);
    
    /**
     * @notice Checks if a repay is allowed
     * @param vToken The vToken market to check
     * @param payer The account paying
     * @param borrower The account having their loan repaid
     * @param repayAmount The amount of underlying to repay
     * @return 0=success, otherwise a failure
     */
    function repayBorrowAllowed(address vToken, address payer, address borrower, uint repayAmount) external returns (uint);

    /**
     * @notice Returns the price oracle used by the comptroller
     * @return The address of the oracle
     */
    function oracle() external view returns (address);
}
