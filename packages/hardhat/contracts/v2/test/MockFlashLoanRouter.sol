// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ICallbackReceiver {
    function onCallback(bytes calldata data) external;
}

interface ICowAdapterFlashLoan {
    function flashLoanAndCallBack(
        address lender,
        IERC20 token,
        uint256 amount,
        bytes calldata callbackData
    ) external;
}

/// @notice Mock FlashLoanRouter for testing KapanCowAdapter
contract MockFlashLoanRouter {
    address public settlementContract;

    // Optional callback receiver for integration tests
    ICallbackReceiver public callbackReceiver;

    constructor(address _settlement) {
        settlementContract = _settlement;
    }

    function setCallbackReceiver(address _receiver) external {
        callbackReceiver = ICallbackReceiver(_receiver);
    }

    function borrowerCallBack(bytes calldata data) external {
        // If callback receiver is set, forward the call
        if (address(callbackReceiver) != address(0)) {
            callbackReceiver.onCallback(data);
        }
        // Otherwise no-op
    }

    /// @notice Helper to trigger flash loan for testing
    function triggerFlashLoan(
        address cowAdapter,
        address lender,
        IERC20 token,
        uint256 amount,
        bytes calldata callbackData
    ) external {
        ICowAdapterFlashLoan(cowAdapter).flashLoanAndCallBack(lender, token, amount, callbackData);
    }
}
