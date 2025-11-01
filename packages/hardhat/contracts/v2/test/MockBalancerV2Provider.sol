// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IFlashLoanProvider} from "../interfaces/balancer/IFlashLoanProvider.sol";

interface IReceiverV2 {
    function receiveFlashLoan(
        IERC20[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata feeAmounts,
        bytes calldata userData
    ) external;
}

contract MockBalancerV2Provider is IFlashLoanProvider {
    function flashLoan(
        address receiver,
        IERC20[] calldata /*tokens*/,
        uint256[] calldata /*amounts*/,
        bytes calldata userData
    ) external override {
        IERC20[] memory tokens = new IERC20[](0);
        uint256[] memory amounts = new uint256[](0);
        uint256[] memory fees = new uint256[](0);
        IReceiverV2(receiver).receiveFlashLoan(tokens, amounts, fees, userData);
    }
}


