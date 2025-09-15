// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "../interfaces/IGatewayView.sol";
import "./VenusGateway.sol";
import "../../interfaces/venus/VTokenInterface.sol";

contract VenusGatewayView is IGatewayView {
    VenusGateway public immutable gateway;

    constructor(address gatewayAddress) {
        gateway = VenusGateway(gatewayAddress);
    }

    function getBalance(address token, address user) external view override returns (uint256) {
        address vToken = gateway.getVTokenForUnderlying(token);
        uint256 vBal = gateway.userVTokenBalance(user, vToken);
        if (vBal == 0) return 0;
        uint256 exchangeRate = VTokenInterface(vToken).exchangeRateStored();
        return (vBal * exchangeRate) / 1e18;
    }

    function getBorrowBalance(address token, address user) public view override returns (uint256) {
        address vToken = gateway.getVTokenForUnderlying(token);
        return VTokenInterface(vToken).borrowBalanceStored(user);
    }

    function getBorrowRate(address token) external view override returns (uint256, bool) {
        address vToken = gateway.getVTokenForUnderlying(token);
        return (VTokenInterface(vToken).borrowRatePerBlock(), true);
    }

    function getSupplyRate(address token) external view override returns (uint256, bool) {
        address vToken = gateway.getVTokenForUnderlying(token);
        return (VTokenInterface(vToken).supplyRatePerBlock(), true);
    }

}

