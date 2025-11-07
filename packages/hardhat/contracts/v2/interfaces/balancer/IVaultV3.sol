// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IVaultV3 {
    function unlock(bytes calldata data) external returns (bytes memory result);
    function sendTo(address token, address to, uint256 amount) external;
    function settle(address token, uint256 amount) external;
}


