// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";

contract OneInchAdapter is Ownable {
    using SafeERC20 for IERC20;

    // The official 1inch Aggregation Router V6 address
    address public immutable ONE_INCH_ROUTER;
    address public kapanGateway;

    constructor(address _gateway, address _router) Ownable(msg.sender) {
        kapanGateway = _gateway;
        ONE_INCH_ROUTER = _router;
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
        // 1. Approve 1inch Router
        // Optimization: Use infinite approval once, or approve exact amount.
        // Infinite approval is cheaper on gas but slightly higher risk if 1inch is compromised.
        // Given 1inch's maturity, infinite approval for the Router is standard.
        if (IERC20(tokenIn).allowance(address(this), ONE_INCH_ROUTER) < amountIn) {
            IERC20(tokenIn).forceApprove(ONE_INCH_ROUTER, type(uint256).max);
        }

        // 2. Record Balances Before
        uint256 balanceOutBefore = IERC20(tokenOut).balanceOf(address(this));
        // balanceInBefore is not needed as we just sweep remaining balance

        // 3. Execute the Swap
        // We perform a low-level call. The 'data' is the opaque blob from 1inch API.
        // Critical: The 'data' from API must have been generated with 'from' = address(this).
        (bool success, bytes memory returnData) = ONE_INCH_ROUTER.call(data);

        if (!success) {
            // Forward the revert reason from 1inch if possible
            if (returnData.length > 0) {
                assembly {
                    let returndata_size := mload(returnData)
                    revert(add(32, returnData), returndata_size)
                }
            } else {
                revert("Adapter: 1inch Swap Failed");
            }
        }

        // 4. Verification & Refund Calculation
        uint256 balanceOutAfter = IERC20(tokenOut).balanceOf(address(this));
        uint256 balanceInAfter = IERC20(tokenIn).balanceOf(address(this));

        console.log("OneInchAdapter: tokenIn=%s, tokenOut=%s", tokenIn, tokenOut);
        console.log("OneInchAdapter: amountIn=%s, minAmountOut=%s", amountIn, minAmountOut);
        console.log("OneInchAdapter: balanceOutBefore=%s, balanceOutAfter=%s", balanceOutBefore, balanceOutAfter);
        console.log("OneInchAdapter: balanceInAfter=%s", balanceInAfter);

        amountReceived = balanceOutAfter - balanceOutBefore;
        console.log("OneInchAdapter: amountReceived=%s", amountReceived);
        require(amountReceived >= minAmountOut, "Adapter: High Slippage");

        // Calculate refund (remaining tokenIn)
        // We assume the adapter started with 'amountIn' (plus potentially dust, but we only care about what's left)
        // Actually, we just sweep whatever is left of tokenIn, or just the delta?
        // The adapter should be empty before.
        // Let's just return the current balance of tokenIn as refund.
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
