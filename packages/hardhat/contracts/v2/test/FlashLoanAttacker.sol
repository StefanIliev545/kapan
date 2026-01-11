// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IKapanCowAdapterTest {
    function fundOrder(bytes32 orderHash, address token, address recipient, uint256 amount) external;
    function onPreHook(bytes32 orderHash) external;
    function onPostHook(bytes32 orderHash) external;
}

interface IKapanOrderManagerTest {
    function executePreHook(bytes32 orderHash) external;
    function executePostHook(bytes32 orderHash, uint256 buyAmount) external;
}

/// @notice Test contract to verify flash loan hook hijacking prevention
/// @dev Used during flash loan callback to attempt attacks
contract FlashLoanAttacker {
    IKapanCowAdapterTest public cowAdapter;
    IKapanOrderManagerTest public orderManager;
    address public token;

    // Attack parameters
    bytes32 public fundOrderHash;    // Hash used in fundOrder
    bytes32 public hookOrderHash;    // Hash used in hook call (different = attack)
    uint256 public fundAmount;
    address public fundRecipient;

    // Results
    bool public attackSucceeded;
    bytes public lastError;

    constructor(address _cowAdapter, address _orderManager, address _token) {
        cowAdapter = IKapanCowAdapterTest(_cowAdapter);
        orderManager = IKapanOrderManagerTest(_orderManager);
        token = _token;
    }

    /// @notice Set up the attack parameters
    function setupAttack(
        bytes32 _fundOrderHash,
        bytes32 _hookOrderHash,
        uint256 _fundAmount,
        address _fundRecipient
    ) external {
        fundOrderHash = _fundOrderHash;
        hookOrderHash = _hookOrderHash;
        fundAmount = _fundAmount;
        fundRecipient = _fundRecipient;
        attackSucceeded = false;
        lastError = "";
    }

    /// @notice Called during flash loan callback - attempts the attack
    function onCallback(bytes calldata) external {
        // Step 1: Call fundOrder with fundOrderHash
        // This sets _expectedOrderHash in the adapter
        try cowAdapter.fundOrder(fundOrderHash, token, fundRecipient, fundAmount) {
            // fundOrder succeeded
        } catch (bytes memory err) {
            lastError = err;
            return;
        }

        // Step 2: Try to call executePreHook with a DIFFERENT hash
        // This should FAIL with OrderMismatch if security is working
        try orderManager.executePreHook(hookOrderHash) {
            // If we get here, the attack succeeded (BAD!)
            attackSucceeded = true;
        } catch (bytes memory err) {
            // Attack failed (GOOD! - security working)
            lastError = err;
            attackSucceeded = false;
        }
    }

    /// @notice Test the happy path - same hash for both calls
    function onCallbackHappyPath(bytes calldata) external {
        // Use same hash for both - should succeed
        cowAdapter.fundOrder(fundOrderHash, token, fundRecipient, fundAmount);
        orderManager.executePreHook(fundOrderHash);  // Same hash
        orderManager.executePostHook(fundOrderHash, 0);  // Same hash
        attackSucceeded = true;  // Indicates full flow completed
    }
}
