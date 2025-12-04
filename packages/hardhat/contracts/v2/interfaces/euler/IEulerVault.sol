// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Minimal interface for an Euler vault (EVault) built on ERC-4626 semantics.
/// @dev Functions covered here are the ones used by the gateways for deposits, withdrawals, borrows and repayments.
interface IEulerVault is IERC20 {
    function asset() external view returns (address);

    function underlyingAsset() external view returns (address);

    function deposit(uint256 assets, address receiver) external returns (uint256 shares);

    function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares);

    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);

    function convertToAssets(uint256 shares) external view returns (uint256 assets);

    function convertToShares(uint256 assets) external view returns (uint256 shares);

    function totalAssets() external view returns (uint256);

    function borrow(uint256 assets, address receiver, address owner) external returns (uint256 shares);

    function repay(uint256 assets, address onBehalfOf) external returns (uint256 sharesRepaid);
}
