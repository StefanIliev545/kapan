// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

abstract contract ProtocolGateway {
    // Immutable router address that can call protected functions
    address public immutable ROUTER;

    /**
     * @notice Modifier to restrict function access to only the router contract
     */
    modifier onlyRouter() {
        require(msg.sender == ROUTER, "Only router can call");
        _;
    }

    /**
     * @notice Modifier to restrict function access to router or user themselves
     * @param user The user the function is being called for
     */
    modifier onlyRouterOrSelf(address user) {
        require(msg.sender == ROUTER || msg.sender == user, "Only router or self can call");
        _;
    }

    /**
     * @notice Constructor to set the router address
     * @param router The address of the router contract that can call protected functions
     */
    constructor(address router) {
        require(router != address(0), "Router address cannot be zero");
        ROUTER = router;
    }
}
