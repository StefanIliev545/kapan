// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title IERC1271 - Standard Signature Validation Method for Contracts
/// @notice Interface for smart contract signature verification (EIP-1271)
interface IERC1271 {
    /// @notice Verifies that the signature is valid for the given hash
    /// @param _hash The hash of the data signed
    /// @param _signature The signature bytes
    /// @return magicValue bytes4(0x1626ba7e) if valid, any other value if invalid
    function isValidSignature(
        bytes32 _hash,
        bytes calldata _signature
    ) external view returns (bytes4 magicValue);
}

/// @dev Magic value returned by isValidSignature when the signature is valid
bytes4 constant ERC1271_MAGIC_VALUE = 0x1626ba7e;
