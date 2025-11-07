// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IFlashLoanProvider} from "../interfaces/balancer/IFlashLoanProvider.sol";
import {IVaultV3} from "../interfaces/balancer/IVaultV3.sol";

abstract contract FlashLoanConsumerBase {
    using SafeERC20 for IERC20;

    IFlashLoanProvider public balancerV2Vault;
    IVaultV3 public balancerV3Vault;
    bool private flashLoanEnabled;

    function _setBalancerV2(address provider) internal {
        balancerV2Vault = IFlashLoanProvider(provider);
    }

    function _setBalancerV3(address vault) internal {
        balancerV3Vault = IVaultV3(vault);
    }

    modifier enableFlashLoan() {
        flashLoanEnabled = true;
        _;
        flashLoanEnabled = false;
    }

    modifier flashLoanOnly() {
        require(flashLoanEnabled, "Flash loan not enabled");
        _;
    }

    // Request Balancer v2 flash loan for a single asset (extendable to multi-asset)
    function _requestBalancerV2(address token, uint256 amount, bytes memory userData) internal enableFlashLoan {
        IERC20[] memory tokens = new IERC20[](1);
        tokens[0] = IERC20(token);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;
        balancerV2Vault.flashLoan(address(this), tokens, amounts, userData);
    }

    // Balancer v2 callback entrypoint
    function receiveFlashLoan(
        IERC20[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata feeAmounts,
        bytes calldata userData
    ) external flashLoanOnly {
        require(msg.sender == address(balancerV2Vault), "Unauthorized flash loan provider");

        _afterFlashLoan(userData);

        // Repay principal + fee
        for (uint256 i = 0; i < tokens.length; i++) {
            uint256 repayment = amounts[i] + feeAmounts[i];
            tokens[i].safeTransfer(address(balancerV2Vault), repayment);
        }
    }

    // Request Balancer v3 flash loan: unlock first; provider callbacks this contract with raw calldata
    function _requestBalancerV3(address token, uint256 amount) internal enableFlashLoan {
        bytes memory userData = abi.encode(token, amount);
        bytes memory callData = abi.encodeWithSelector(this.receiveFlashLoanV3.selector, userData);
        // Vault will call msg.sender (this contract) with callData
        balancerV3Vault.unlock(callData);
    }

    // Balancer v3 callback entrypoint (executed within unlocked context)
    function receiveFlashLoanV3(bytes calldata userData) external flashLoanOnly {
        require(msg.sender == address(balancerV3Vault), "Unauthorized flash loan provider");
        // userData expected: abi.encode(address token, uint256 amount)
        (address token, uint256 amount) = abi.decode(userData, (address, uint256));
        // Pull funds now that we are inside unlocked context
        if (token != address(0) && amount > 0) {
            balancerV3Vault.sendTo(token, address(this), amount);
        }
        _afterFlashLoan(userData);
        if (token != address(0) && amount > 0) {
            // Repay and settle must succeed before lock can close
            IERC20(token).safeTransfer(address(balancerV3Vault), amount);
            balancerV3Vault.settle(token, amount);
        }
    }

    // Derived contracts implement how to resume execution
    function _afterFlashLoan(bytes calldata userData) internal virtual;
}


