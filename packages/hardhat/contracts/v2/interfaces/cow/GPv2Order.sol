// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title GPv2Order - CoW Protocol order library
/// @notice Data structures and helpers for CoW Protocol orders
library GPv2Order {
    /// @dev The complete order data that is signed by the user
    struct Data {
        IERC20 sellToken;
        IERC20 buyToken;
        address receiver;
        uint256 sellAmount;
        uint256 buyAmount;
        uint32 validTo;
        bytes32 appData;
        uint256 feeAmount;
        bytes32 kind;
        bool partiallyFillable;
        bytes32 sellTokenBalance;
        bytes32 buyTokenBalance;
    }

    /// @dev Order kind constants
    bytes32 internal constant KIND_SELL =
        keccak256("sell");
    bytes32 internal constant KIND_BUY =
        keccak256("buy");

    /// @dev Token balance constants
    bytes32 internal constant BALANCE_ERC20 =
        keccak256("erc20");
    bytes32 internal constant BALANCE_EXTERNAL =
        keccak256("external");
    bytes32 internal constant BALANCE_INTERNAL =
        keccak256("internal");

    /// @dev The order EIP-712 type hash
    bytes32 internal constant TYPE_HASH =
        keccak256(
            "Order("
            "address sellToken,"
            "address buyToken,"
            "address receiver,"
            "uint256 sellAmount,"
            "uint256 buyAmount,"
            "uint32 validTo,"
            "bytes32 appData,"
            "uint256 feeAmount,"
            "string kind,"
            "bool partiallyFillable,"
            "string sellTokenBalance,"
            "string buyTokenBalance"
            ")"
        );

    /// @dev Computes the order hash for the given order data
    /// @param order The order to hash
    /// @param domainSeparator The EIP-712 domain separator
    /// @return orderDigest The order digest
    function hash(Data memory order, bytes32 domainSeparator) internal pure returns (bytes32 orderDigest) {
        bytes32 structHash = keccak256(
            abi.encode(
                TYPE_HASH,
                order.sellToken,
                order.buyToken,
                order.receiver,
                order.sellAmount,
                order.buyAmount,
                order.validTo,
                order.appData,
                order.feeAmount,
                order.kind,
                order.partiallyFillable,
                order.sellTokenBalance,
                order.buyTokenBalance
            )
        );
        orderDigest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }
}
