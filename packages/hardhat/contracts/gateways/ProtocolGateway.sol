// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Shared base for v2 GatewayWrite/GatewayView contracts.
///         Holds immutable router address and common access modifiers.
abstract contract ProtocolGateway {
    /// @notice Immutable router address that can call protected functions
    address public immutable ROUTER;

    /// @notice Restrict function access to only the router contract
    modifier onlyRouter() {
        require(msg.sender == ROUTER, "Only router can call");
        _;
    }

    /// @notice Restrict access to router or the user themselves
    /// @param user The user the function is being called for
    modifier onlyRouterOrSelf(address user) {
        require(msg.sender == ROUTER || msg.sender == user, "Only router or self can call");
        _;
    }

    /// @notice Restrict access to the router's owner (for emergency recovery)
    modifier onlyRouterOwner() {
        require(msg.sender == Ownable(ROUTER).owner(), "Only router owner");
        _;
    }

    /// @param router The address of the router contract that can call protected functions
    constructor(address router) {
        require(router != address(0), "router=0");
        ROUTER = router;
    }
}


