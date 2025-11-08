// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IReceiverV3 {
    function receiveFlashLoanV3(bytes calldata userData) external;
}

contract MockBalancerV3Vault {
    using SafeERC20 for IERC20;

    function unlock(bytes calldata data) external returns (bytes memory) {
        (bool ok, bytes memory ret) = msg.sender.call(data);
        require(ok, "unlock call failed");
        return ret;
    }

    function settle(address token, uint256 amount) external {
        // Mock vault: pull tokens back from caller (router) to settle
        // Note: Router should have approved us, but if not, we'll just skip (for simple tests)
        try IERC20(token).transferFrom(msg.sender, address(this), amount) returns (bool success) {
            if (!success) {
                // Transfer failed, but that's ok for simple tests
            }
        } catch {
            // Transfer failed (no allowance), but that's ok for simple tests
        }
    }

    function sendTo(address token, address to, uint256 amount) external {
        // Mock vault: send tokens to the router during flash loan
        IERC20(token).safeTransfer(to, amount);
    }
}


