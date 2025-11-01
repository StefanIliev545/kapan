// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IFlashLoanProvider {
    function flashLoan(
        address receiver,
        IERC20[] calldata tokens,
        uint256[] calldata amounts,
        bytes calldata userData
    ) external;
}


