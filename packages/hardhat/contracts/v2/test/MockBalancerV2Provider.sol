// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
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
    using SafeERC20 for IERC20;

    function flashLoan(
        address receiver,
        IERC20[] calldata tokens,
        uint256[] calldata amounts,
        bytes calldata userData
    ) external override {
        // Mock provider: pass through the tokens and amounts, add a small fee
        require(tokens.length == 1, "Only single-asset flash loans supported");
        require(amounts.length == 1, "Only single-asset flash loans supported");
        
        IERC20 token = tokens[0];
        uint256 amount = amounts[0];
        uint256 fee = (amount * 9) / 10000; // 0.09% fee (9 basis points)
        uint256 repayment = amount + fee;
        
        // Transfer tokens to receiver (router) before callback
        token.safeTransfer(receiver, amount);
        
        // Prepare callback data
        IERC20[] memory tokensArray = new IERC20[](1);
        tokensArray[0] = token;
        
        uint256[] memory amountsArray = new uint256[](1);
        amountsArray[0] = amount;
        
        uint256[] memory fees = new uint256[](1);
        fees[0] = fee;
        
        // Call the receiver's callback
        // The callback will transfer the repayment (amount + fee) back to us
        IReceiverV2(receiver).receiveFlashLoan(tokensArray, amountsArray, fees, userData);
        
        // No need to pull - the callback already transferred tokens back
    }
}


