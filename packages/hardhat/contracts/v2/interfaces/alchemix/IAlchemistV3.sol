// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Slim interface for the AlchemistV3 functions used by the Kapan gateway.
///         The full upstream interface lives in alchemix-finance/v3-poc; we only
///         declare the subset we call.
interface IAlchemistV3 {
    // ---- State / config ----
    function debtToken() external view returns (address);

    function underlyingToken() external view returns (address);

    /// @notice The yield token the alchemist holds as collateral. In V3 this is the MYT
    ///         (a Morpho V2 ERC4626 vault wrapping the underlying).
    /// @dev    Public state variable on AlchemistV3 — accessor is named `myt`, not `yieldToken`.
    function myt() external view returns (address);

    function alchemistPositionNFT() external view returns (address);

    function minimumCollateralization() external view returns (uint256);

    /// @notice Mint allowance for `spender` to mintFrom the account owned by `ownerTokenId`.
    function mintAllowance(uint256 ownerTokenId, address spender) external view returns (uint256);

    // ---- Account state ----
    /// @return collateral Yield-token denominated collateral balance.
    /// @return debt       Debt denominated in `debtToken` units.
    /// @return earmarked  Portion of `debt` reserved for transmuter redemption (only repayable via `repay`).
    function getCDP(uint256 tokenId)
        external
        view
        returns (uint256 collateral, uint256 debt, uint256 earmarked);

    function getMaxBorrowable(uint256 tokenId) external view returns (uint256 maxDebt);

    function totalValue(uint256 tokenId) external view returns (uint256 value);

    // ---- Conversions ----
    function convertYieldTokensToDebt(uint256 amount) external view returns (uint256);

    function convertYieldTokensToUnderlying(uint256 amount) external view returns (uint256);

    function convertDebtTokensToYield(uint256 amount) external view returns (uint256);

    function convertUnderlyingTokensToYield(uint256 amount) external view returns (uint256);

    function normalizeUnderlyingTokensToDebt(uint256 amount) external view returns (uint256);

    function normalizeDebtTokensToUnderlying(uint256 amount) external view returns (uint256);

    // ---- Actions ----
    /// @notice Deposit `amount` yield tokens (MYT shares) crediting the position NFT `recipientId`.
    /// @dev    Pass `recipientId == 0` to mint a fresh NFT to `recipient`.
    function deposit(uint256 amount, address recipient, uint256 recipientId) external returns (uint256 debtValue);

    /// @notice Withdraw `amount` yield tokens (MYT shares) to `recipient`.
    /// @dev    msg.sender MUST equal `ownerOf(tokenId)` — there is no operator/approval bypass.
    function withdraw(uint256 amount, address recipient, uint256 tokenId) external returns (uint256 amountWithdrawn);

    /// @notice Mint `amount` debt tokens against position `tokenId` (caller must own the NFT).
    function mint(uint256 tokenId, uint256 amount, address recipient) external;

    /// @notice Mint via pre-approved allowance (`approveMint`). Used when caller is not the NFT owner.
    function mintFrom(uint256 tokenId, uint256 amount, address recipient) external;

    /// @notice Approve `spender` to mintFrom up to `amount` against position `tokenId`.
    function approveMint(uint256 tokenId, address spender, uint256 amount) external;

    /// @notice Repay using debt tokens (alAsset). Only repays the UNEARMARKED portion of debt.
    /// @dev    Reverts if caller minted in the same block (flash-loan repay guard).
    function burn(uint256 amount, uint256 recipientId) external returns (uint256 amountBurned);

    /// @notice Repay using yield tokens (MYT shares). Repays both earmarked and unearmarked debt.
    /// @dev    Reverts if caller minted in the same block (flash-loan repay guard).
    function repay(uint256 amount, uint256 recipientTokenId) external returns (uint256 amountRepaid);
}
