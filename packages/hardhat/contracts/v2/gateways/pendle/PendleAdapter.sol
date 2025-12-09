// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";

contract PendleAdapter is Ownable {
    using SafeERC20 for IERC20;

    address public immutable PENDLE_ROUTER;
    address public kapanGateway;

    constructor(address _gateway, address _router) Ownable(msg.sender) {
        kapanGateway = _gateway;
        PENDLE_ROUTER = _router;
    }

    modifier onlyGateway() {
        require(msg.sender == kapanGateway, "Adapter: Only Gateway");
        _;
    }

    function setGateway(address _gateway) external onlyOwner {
        kapanGateway = _gateway;
    }

    function executeSwap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes calldata data
    ) external onlyGateway returns (uint256 amountReceived, uint256 amountRefunded) {
        // 1. Approve Pendle Router
        if (IERC20(tokenIn).allowance(address(this), PENDLE_ROUTER) < amountIn) {
            IERC20(tokenIn).forceApprove(PENDLE_ROUTER, type(uint256).max);
        }

        // 2. Record Balances Before
        uint256 balanceOutBefore = IERC20(tokenOut).balanceOf(address(this));

        // 3. Execute the Swap via Pendle Router
        (bool success, bytes memory returnData) = PENDLE_ROUTER.call(data);

        if (!success) {
            if (returnData.length > 0) {
                assembly {
                    let returndata_size := mload(returnData)
                    revert(add(32, returnData), returndata_size)
                }
            } else {
                revert("Adapter: Pendle Swap Failed");
            }
        }

        // 4. Verification & Refund Calculation
        uint256 balanceOutAfter = IERC20(tokenOut).balanceOf(address(this));
        uint256 balanceInAfter = IERC20(tokenIn).balanceOf(address(this));

        console.log("PendleAdapter: tokenIn=%s, tokenOut=%s", tokenIn, tokenOut);
        console.log("PendleAdapter: amountIn=%s, minAmountOut=%s", amountIn, minAmountOut);
        console.log("PendleAdapter: balanceOutBefore=%s, balanceOutAfter=%s", balanceOutBefore, balanceOutAfter);
        console.log("PendleAdapter: balanceInAfter=%s", balanceInAfter);

        amountReceived = balanceOutAfter - balanceOutBefore;
        console.log("PendleAdapter: amountReceived=%s", amountReceived);
        require(amountReceived >= minAmountOut, "Adapter: High Slippage");

        amountRefunded = balanceInAfter;

        // 5. Return Funds to Gateway
        if (amountReceived > 0) {
            IERC20(tokenOut).safeTransfer(msg.sender, amountReceived);
        }
        if (amountRefunded > 0) {
            IERC20(tokenIn).safeTransfer(msg.sender, amountRefunded);
        }
    }
}
