// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title IEulerVault
/// @notice Interface for Euler V2 vaults (EVK - Euler Vault Kit)
/// @dev Extends ERC-4626 with borrowing functionality
interface IEulerVault {
    // ============ ERC-4626 Standard Functions ============

    /// @notice The underlying asset of the vault
    function asset() external view returns (address);

    /// @notice Total assets held by the vault
    function totalAssets() external view returns (uint256);

    /// @notice Convert assets to shares
    function convertToShares(uint256 assets) external view returns (uint256);

    /// @notice Convert shares to assets
    function convertToAssets(uint256 shares) external view returns (uint256);

    /// @notice Deposit assets and receive shares
    /// @param assets Amount of assets to deposit
    /// @param receiver Address to receive shares
    /// @return shares Amount of shares minted
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);

    /// @notice Withdraw assets by burning shares
    /// @param assets Amount of assets to withdraw
    /// @param receiver Address to receive assets
    /// @param owner Address whose shares will be burned
    /// @return shares Amount of shares burned
    function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares);

    /// @notice Redeem shares for assets
    /// @param shares Amount of shares to redeem
    /// @param receiver Address to receive assets
    /// @param owner Address whose shares will be burned
    /// @return assets Amount of assets received
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);

    /// @notice Get share balance of an account
    function balanceOf(address account) external view returns (uint256);

    /// @notice Maximum withdrawable assets for an owner
    function maxWithdraw(address owner) external view returns (uint256);

    /// @notice Maximum redeemable shares for an owner
    function maxRedeem(address owner) external view returns (uint256);

    // ============ EVK Borrowing Extensions ============

    /// @notice Borrow assets from the vault
    /// @param assets Amount of assets to borrow
    /// @param receiver Address to receive borrowed assets
    /// @return Amount actually borrowed
    function borrow(uint256 assets, address receiver) external returns (uint256);

    /// @notice Repay borrowed assets
    /// @param assets Amount of assets to repay
    /// @param receiver Address of the borrower whose debt to repay
    /// @return Amount actually repaid
    function repay(uint256 assets, address receiver) external returns (uint256);

    /// @notice Get debt balance of an account
    /// @param account Address to query
    /// @return Amount of debt in asset units
    function debtOf(address account) external view returns (uint256);

    /// @notice Get debt balance in shares
    /// @param account Address to query
    /// @return Amount of debt shares
    function debtOfExact(address account) external view returns (uint256);

    /// @notice Total borrowed assets
    function totalBorrows() external view returns (uint256);

    // ============ Interest Rate ============

    /// @notice Current interest rate
    function interestRate() external view returns (uint256);

    /// @notice Interest accumulator for debt calculation
    function interestAccumulator() external view returns (uint256);

    // ============ LTV Configuration ============

    /// @notice Get the borrow LTV for a collateral (max LTV for new borrows)
    /// @param collateral The collateral vault address
    /// @return Borrow LTV in 1e4 scale (8000 = 80%)
    function LTVBorrow(address collateral) external view returns (uint16);

    /// @notice Get the liquidation LTV for a collateral (LLTV threshold)
    /// @param collateral The collateral vault address
    /// @return Liquidation LTV in 1e4 scale (9000 = 90%)
    function LTVLiquidation(address collateral) external view returns (uint16);

    /// @notice Get full LTV configuration including ramping parameters
    /// @param collateral The collateral vault address
    /// @return borrowLTV The borrow LTV
    /// @return liquidationLTV The current liquidation LTV
    /// @return initialLiquidationLTV The initial liquidation LTV before ramping
    /// @return targetTimestamp When ramping completes
    /// @return rampDuration Duration of the ramp
    function LTVFull(address collateral) external view returns (
        uint16 borrowLTV,
        uint16 liquidationLTV,
        uint16 initialLiquidationLTV,
        uint48 targetTimestamp,
        uint32 rampDuration
    );

    /// @notice Get list of all collaterals with configured LTVs
    /// @return Array of collateral vault addresses
    function LTVList() external view returns (address[] memory);

    // ============ Account Liquidity ============

    /// @notice Get account liquidity (health check)
    /// @param account The account to check
    /// @param liquidation If true, use liquidation LTV; if false, use borrow LTV
    /// @return collateralValue Total collateral value in unit of account
    /// @return liabilityValue Total liability value in unit of account
    function accountLiquidity(address account, bool liquidation)
        external view returns (uint256 collateralValue, uint256 liabilityValue);

    /// @notice Get detailed account liquidity per collateral
    /// @param account The account to check
    /// @param liquidation If true, use liquidation LTV; if false, use borrow LTV
    /// @return collaterals Array of collateral addresses
    /// @return collateralValues Array of collateral values
    /// @return liabilityValue Total liability value
    function accountLiquidityFull(address account, bool liquidation)
        external view returns (
            address[] memory collaterals,
            uint256[] memory collateralValues,
            uint256 liabilityValue
        );

    // ============ Vault Info ============

    /// @notice Name of the vault token
    function name() external view returns (string memory);

    /// @notice Symbol of the vault token
    function symbol() external view returns (string memory);

    /// @notice Decimals of the vault token
    function decimals() external view returns (uint8);
}
