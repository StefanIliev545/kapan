// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Mock FlashLoanRouter for testing KapanCowAdapter
contract MockFlashLoanRouter {
    address public settlementContract;
    
    constructor(address _settlement) {
        settlementContract = _settlement;
    }
    
    function borrowerCallBack(bytes calldata) external {
        // No-op in mock
    }
}
