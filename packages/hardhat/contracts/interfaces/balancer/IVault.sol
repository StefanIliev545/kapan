// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.20;

interface IVault {
    function unlock(bytes calldata data) external returns (bytes memory result);
    function sendTo(address token, address to, uint256 amount) external;
    function settle(address token, uint256 amountHint) external returns (uint256 credit);
}
