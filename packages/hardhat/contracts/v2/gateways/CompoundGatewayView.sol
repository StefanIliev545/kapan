// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/IGatewayView.sol";
import "../../interfaces/ICompoundComet.sol";

contract CompoundGatewayView is IGatewayView {
    mapping(address => ICompoundComet) public tokenToComet;

    constructor(ICompoundComet[] memory comets) {
        for (uint256 i = 0; i < comets.length; i++) {
            if (address(comets[i]) != address(0)) {
                tokenToComet[address(comets[i].baseToken())] = comets[i];
            }
        }
    }

    function getBalance(address token, address user) external view override returns (uint256) {
        ICompoundComet comet = tokenToComet[token];
        if (address(comet) == address(0)) return 0;
        return comet.balanceOf(user);
    }

    function getBorrowBalance(address token, address user) public view override returns (uint256) {
        ICompoundComet comet = tokenToComet[token];
        if (address(comet) == address(0)) return 0;
        return comet.borrowBalanceOf(user);
    }

    function getBorrowRate(address token) external view override returns (uint256, bool) {
        ICompoundComet comet = tokenToComet[token];
        if (address(comet) == address(0)) return (0, false);
        return (comet.getBorrowRate(comet.getUtilization()), true);
    }

    function getSupplyRate(address token) external view override returns (uint256, bool) {
        ICompoundComet comet = tokenToComet[token];
        if (address(comet) == address(0)) return (0, false);
        return (comet.getSupplyRate(comet.getUtilization()), true);
    }

}

