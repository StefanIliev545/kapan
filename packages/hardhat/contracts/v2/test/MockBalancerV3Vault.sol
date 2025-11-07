// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IReceiverV3 {
    function receiveFlashLoanV3(bytes calldata userData) external;
}

contract MockBalancerV3Vault {
    function unlock(bytes calldata data) external returns (bytes memory) {
        (bool ok, bytes memory ret) = msg.sender.call(data);
        require(ok, "unlock call failed");
        return ret;
    }

    function settle(address /*token*/, uint256 /*amount*/) external {}
    function sendTo(address /*token*/, address /*to*/, uint256 /*amount*/) external {}
}


