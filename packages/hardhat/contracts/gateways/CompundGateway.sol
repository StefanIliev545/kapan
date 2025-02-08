//SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "../interfaces/IGateway.sol";
import "../interfaces/ICompoundComet.sol";
contract CompoundGateway is IGateway {

    mapping(address => ICompoundComet) public tokenToComet;

    constructor(ICompoundComet _USDCComet, ICompoundComet _USDTComet, ICompoundComet _USDCeComet, ICompoundComet _ethComet) {
        require(address(_USDCComet.baseToken()) != address(0), "USDCComet is not set");
        require(address(_USDTComet.baseToken()) != address(0), "USDTComet is not set");
        require(address(_USDCeComet.baseToken()) != address(0), "USDCeComet is not set");
        require(address(_ethComet.baseToken()) != address(0), "ethComet is not set");

        tokenToComet[address(_USDCComet.baseToken())] = _USDCComet;
        tokenToComet[address(_USDTComet.baseToken())] = _USDTComet;
        tokenToComet[address(_USDCeComet.baseToken())] = _USDCeComet;
        tokenToComet[address(_ethComet.baseToken())] = _ethComet;
    }

    function getSupplyRate(address token) external view returns (uint256) {
        return tokenToComet[token].getSupplyRate(tokenToComet[token].getUtilization());
    }

    function getBorrowRate(address token) external view returns (uint256) {
        return tokenToComet[token].getBorrowRate(tokenToComet[token].getUtilization());
    }

    function getBaseToken(ICompoundComet comet) external view returns (address) {
        return comet.baseToken();
    }


    function deposit(address token, address user, uint256 amount) external {
        // TODO: Implement
    }

    function withdraw(address token, address user, uint256 amount) external {
        // TODO: Implement
    }   

    function borrow(address token, address user, uint256 amount) external {
        // TODO: Implement
    }   

    function repay(address token, address user, uint256 amount) external {
        // TODO: Implement
    }

    function getBalance(address token, address user) external view returns (uint256) {
        return tokenToComet[token].balanceOf(user);
    }

    function getBorrowBalance(address token, address user) external view returns (uint256) {
        return tokenToComet[token].borrowBalanceOf(user);
    }

    function getLtv(address token, address user) external view returns (uint256) {
        // TODO: Implement
    }

    function getMaxLtv(address token) external view returns (uint256) {
        // TODO: Implement
    }
}
