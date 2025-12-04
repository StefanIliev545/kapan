// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Minimal Euler oracle interface used for retrieving asset prices.
interface IEulerPriceOracle {
    function getPrice(address underlying) external view returns (uint256 price);
}
