// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract KyberSwapAdapter is Ownable {
    using SafeERC20 for IERC20;

    // KyberSwap MetaAggregationRouterV2 address (same across supported chains)
    address public immutable KYBER_ROUTER;
    address public kapanGateway;

    constructor(address _gateway, address _router) Ownable(msg.sender) {
        kapanGateway = _gateway;
        KYBER_ROUTER = _router;
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
        if (IERC20(tokenIn).allowance(address(this), KYBER_ROUTER) < amountIn) {
            IERC20(tokenIn).forceApprove(KYBER_ROUTER, type(uint256).max);
        }

        uint256 balanceOutBefore = IERC20(tokenOut).balanceOf(address(this));

        (bool success, bytes memory returnData) = KYBER_ROUTER.call(data);

        if (!success) {
            if (returnData.length > 0) {
                assembly {
                    let returndata_size := mload(returnData)
                    revert(add(32, returnData), returndata_size)
                }
            } else {
                revert("Adapter: KyberSwap Swap Failed");
            }
        }

        uint256 balanceOutAfter = IERC20(tokenOut).balanceOf(address(this));
        uint256 balanceInAfter = IERC20(tokenIn).balanceOf(address(this));

        amountReceived = balanceOutAfter - balanceOutBefore;
        require(amountReceived >= minAmountOut, "Adapter: High Slippage");

        amountRefunded = balanceInAfter;

        if (amountReceived > 0) {
            IERC20(tokenOut).safeTransfer(msg.sender, amountReceived);
        }
        if (amountRefunded > 0) {
            IERC20(tokenIn).safeTransfer(msg.sender, amountRefunded);
        }
    }
}
