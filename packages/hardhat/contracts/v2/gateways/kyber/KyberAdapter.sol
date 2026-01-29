// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract KyberAdapter is Ownable {
    using SafeERC20 for IERC20;

    // The Kyberswap MetaAggregationRouterV2 address (same on most chains)
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
        // 1. Approve Kyber Router
        if (IERC20(tokenIn).allowance(address(this), KYBER_ROUTER) < amountIn) {
            IERC20(tokenIn).forceApprove(KYBER_ROUTER, type(uint256).max);
        }

        // 2. Record Balances Before
        uint256 balanceOutBefore = IERC20(tokenOut).balanceOf(address(this));

        // 3. Execute the Swap
        // The 'data' is the opaque blob from Kyber API's /route/build endpoint
        // Critical: The 'data' from API must have been generated with recipient = address(this)
        (bool success, bytes memory returnData) = KYBER_ROUTER.call(data);

        if (!success) {
            // Forward the revert reason from Kyber if possible
            if (returnData.length > 0) {
                assembly {
                    let returndata_size := mload(returnData)
                    revert(add(32, returnData), returndata_size)
                }
            } else {
                revert("Adapter: Kyber Swap Failed");
            }
        }

        // 4. Verification & Refund Calculation
        uint256 balanceOutAfter = IERC20(tokenOut).balanceOf(address(this));
        uint256 balanceInAfter = IERC20(tokenIn).balanceOf(address(this));

        amountReceived = balanceOutAfter - balanceOutBefore;
        require(amountReceived >= minAmountOut, "Adapter: High Slippage");

        // Calculate refund (remaining tokenIn)
        amountRefunded = balanceInAfter;

        // 5. Return Funds to Gateway
        if (amountReceived > 0) {
            IERC20(tokenOut).safeTransfer(msg.sender, amountReceived);
        }
        if (amountRefunded > 0) {
            IERC20(tokenIn).safeTransfer(msg.sender, amountRefunded);
        }
    }

    // ============ Emergency Recovery ============

    /// @notice Recover stuck tokens (owner only)
    function recoverTokens(address token, address to, uint256 amount) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        uint256 toRecover = amount == type(uint256).max ? balance : amount;
        if (toRecover > balance) toRecover = balance;
        if (toRecover > 0) {
            IERC20(token).safeTransfer(to, toRecover);
        }
    }
}
