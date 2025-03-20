// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

/**
 * @title Venus's VToken Interface
 * @notice Interface for interacting with Venus VTokens
 * @dev Adapted for compatibility with Solidity ^0.8.10 from Venus documentation
 */
interface VTokenInterface {
    /*** Market Events ***/
    event AccrueInterest(uint cashPrior, uint interestAccumulated, uint borrowIndex, uint totalBorrows);
    event Mint(address minter, uint mintAmount, uint mintTokens);
    event Redeem(address redeemer, uint redeemAmount, uint redeemTokens);
    event Borrow(address borrower, uint borrowAmount, uint accountBorrows, uint totalBorrows);
    event RepayBorrow(address payer, address borrower, uint repayAmount, uint accountBorrows, uint totalBorrows);
    event LiquidateBorrow(address liquidator, address borrower, uint repayAmount, address vTokenCollateral, uint seizeTokens);
    
    /*** VToken State ***/
    function underlying() external view returns (address);
    function decimals() external view returns (uint8);
    function totalSupply() external view returns (uint);
    function totalBorrows() external view returns (uint);
    function totalReserves() external view returns (uint);
    function exchangeRateStored() external view returns (uint);
    function accrualBlockNumber() external view returns (uint);
    function comptroller() external view returns (address);
    function symbol() external view returns (string memory);
    function name() external view returns (string memory);
    function reserveFactorMantissa() external view returns (uint);
    function getCash() external view returns (uint);
    function borrowIndex() external view returns (uint);
    
    /*** User Account Functions ***/
    function balanceOf(address owner) external view returns (uint);
    function allowance(address owner, address spender) external view returns (uint);
    function approve(address spender, uint amount) external returns (bool);
    function transfer(address dst, uint amount) external returns (bool);
    function transferFrom(address src, address dst, uint amount) external returns (bool);
    
    /*** VToken Market Functions ***/
    function mint(uint mintAmount) external returns (uint);
    function redeem(uint redeemTokens) external returns (uint);
    function redeemUnderlying(uint redeemAmount) external returns (uint);
    function borrow(uint borrowAmount) external returns (uint);
    function borrowBehalf(address borrower, uint borrowAmount) external returns (uint);
    function repayBorrow(uint repayAmount) external returns (uint);
    function repayBorrowBehalf(address borrower, uint repayAmount) external returns (uint);
    
    /*** Borrow-Related Functions ***/
    function borrowBalanceCurrent(address account) external returns (uint);
    function borrowBalanceStored(address account) external view returns (uint);
    function supplyRatePerBlock() external view returns (uint);
    function borrowRatePerBlock() external view returns (uint);
    function exchangeRateCurrent() external returns (uint);
    function accrueInterest() external returns (uint);
    
    /*** Liquidation Functions ***/
    function liquidateBorrow(address borrower, uint repayAmount, address vTokenCollateral) external returns (uint);
    
    /*** Admin Functions ***/
    function _setReserveFactor(uint newReserveFactorMantissa) external returns (uint);
    function _reduceReserves(uint reduceAmount) external returns (uint);
    function _setInterestRateModel(address newInterestRateModel) external returns (uint);
} 