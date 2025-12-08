// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IEVC} from "../interfaces/euler/IEVC.sol";

contract MockEVC is IEVC {
    mapping(address => mapping(address => bool)) public operators;
    mapping(address => mapping(address => bool)) public controllers;
    mapping(address => mapping(address => bool)) public collaterals;

    address private _currentAccount;

    function currentAccount() external view returns (address) {
        return _currentAccount;
    }

    function multicall(bytes[] calldata data) external returns (bytes[] memory results) {
        results = new bytes[](data.length);
        for (uint256 i = 0; i < data.length; i++) {
            (bool ok, bytes memory res) = address(this).delegatecall(data[i]);
            require(ok, "MockEVC: call failed");
            results[i] = res;
        }
    }

    function callThroughEVC(address account, address target, bytes calldata data) external returns (bytes memory) {
        _currentAccount = account;
        (bool ok, bytes memory res) = target.call(data);
        require(ok, "MockEVC: target call failed");
        _currentAccount = address(0);
        return res;
    }

    function setOperator(address operator, bool isOperator) external {
        operators[msg.sender][operator] = isOperator;
    }

    function enableController(address vault) external {
        controllers[msg.sender][vault] = true;
    }

    function disableController(address vault) external {
        controllers[msg.sender][vault] = false;
    }

    function enableCollateral(address vault) external {
        collaterals[msg.sender][vault] = true;
    }

    function disableCollateral(address vault) external {
        collaterals[msg.sender][vault] = false;
    }

    function isOperator(address account, address operator) external view returns (bool) {
        return operators[account][operator];
    }

    function isControllerEnabled(address account, address vault) external view returns (bool) {
        return controllers[account][vault];
    }

    function isCollateralEnabled(address account, address vault) external view returns (bool) {
        return collaterals[account][vault];
    }
}
