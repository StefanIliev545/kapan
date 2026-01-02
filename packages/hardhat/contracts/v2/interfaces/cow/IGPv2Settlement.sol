// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title IGPv2Settlement - Interface for CoW Protocol Settlement contract
/// @notice Minimal interface for interacting with GPv2Settlement
interface IGPv2Settlement {
    /// @notice Returns the domain separator used for signing orders
    function domainSeparator() external view returns (bytes32);

    /// @notice Returns the address of the vault relayer
    /// @dev The vault relayer is approved to transfer tokens on behalf of users
    function vaultRelayer() external view returns (address);
}
