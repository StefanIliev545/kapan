// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title IKapanOrderManager
/// @dev Minimal interface for TestSettler
interface IKapanOrderManager {
    function executePreHook(bytes32 orderHash) external;
    function executePostHook(bytes32 orderHash) external;
}

/// @title TestSettler
/// @notice Mock CoW Protocol settlement for testing conditional orders
/// @dev Simulates the swap execution flow without actual CoW infrastructure
///
/// Flow:
/// 1. Pre-hook is called (withdraws collateral from user's position)
/// 2. Tokens are transferred to simulate CoW swap
/// 3. Post-hook is called (repays debt to user's position)
contract TestSettler {
    using SafeERC20 for IERC20;

    // ============ Errors ============

    error InsufficientSellBalance();
    error InsufficientBuyBalance();

    // ============ Events ============

    event SwapSimulated(
        bytes32 indexed orderHash,
        address sellToken,
        address buyToken,
        uint256 sellAmount,
        uint256 buyAmount
    );

    // ============ State ============

    /// @notice Address that will act as the HooksTrampoline
    /// @dev In production, this is CoW Protocol's HooksTrampoline
    address public immutable hooksTrampoline;

    // ============ Constructor ============

    /// @param _hooksTrampoline Address to impersonate as HooksTrampoline
    constructor(address _hooksTrampoline) {
        hooksTrampoline = _hooksTrampoline;
    }

    // ============ Main Function ============

    /// @notice Simulate a CoW swap execution with hooks
    /// @dev Mimics the CoW Protocol settlement process:
    ///      1. Pre-hook executed (via HooksTrampoline)
    ///      2. Sell tokens transferred from order manager
    ///      3. Buy tokens transferred to order manager
    ///      4. Post-hook executed (via HooksTrampoline)
    ///
    /// @param orderManager The KapanOrderManager contract
    /// @param orderHash The order being executed
    /// @param sellToken Token being sold
    /// @param buyToken Token being bought
    /// @param sellAmount Amount to take from order manager
    /// @param buyAmount Amount to send to order manager
    function simulateSwap(
        address orderManager,
        bytes32 orderHash,
        address sellToken,
        address buyToken,
        uint256 sellAmount,
        uint256 buyAmount
    ) external {
        // Caller must have buyAmount of buyToken to fund the swap
        if (IERC20(buyToken).balanceOf(msg.sender) < buyAmount) {
            revert InsufficientBuyBalance();
        }

        // 1. Execute pre-hook (impersonating HooksTrampoline)
        // This triggers: withdraw collateral from lending position → to OrderManager
        _callAsTrampoline(orderManager, abi.encodeCall(IKapanOrderManager.executePreHook, (orderHash)));

        // 2. Verify OrderManager has the sell tokens after pre-hook
        uint256 managerSellBalance = IERC20(sellToken).balanceOf(orderManager);
        if (managerSellBalance < sellAmount) {
            revert InsufficientSellBalance();
        }

        // 3. Simulate the swap:
        // - Pull sell tokens from OrderManager (as Settlement would)
        // - Send buy tokens to OrderManager (swap result)

        // Note: In production, CoW's VaultRelayer pulls tokens.
        // Here we simulate by having OrderManager transfer to us.
        // OrderManager must have approved VaultRelayer (which we impersonate via transferFrom).
        // For testing, we need OrderManager to have approved this contract or the settlement.

        // Transfer sell tokens from OrderManager to this contract
        IERC20(sellToken).safeTransferFrom(orderManager, address(this), sellAmount);

        // Transfer buy tokens from caller to OrderManager (simulating swap output)
        IERC20(buyToken).safeTransferFrom(msg.sender, orderManager, buyAmount);

        // 4. Execute post-hook (impersonating HooksTrampoline)
        // This triggers: repay debt with received tokens
        _callAsTrampoline(orderManager, abi.encodeCall(IKapanOrderManager.executePostHook, (orderHash)));

        emit SwapSimulated(orderHash, sellToken, buyToken, sellAmount, buyAmount);
    }

    /// @notice Simulate swap without pre-hook (for testing post-hook in isolation)
    /// @param orderManager The KapanOrderManager contract
    /// @param orderHash The order being executed
    /// @param buyToken Token being bought
    /// @param buyAmount Amount to send to order manager
    function simulatePostHookOnly(
        address orderManager,
        bytes32 orderHash,
        address buyToken,
        uint256 buyAmount
    ) external {
        // Transfer buy tokens to OrderManager
        IERC20(buyToken).safeTransferFrom(msg.sender, orderManager, buyAmount);

        // Execute post-hook
        _callAsTrampoline(orderManager, abi.encodeCall(IKapanOrderManager.executePostHook, (orderHash)));
    }

    /// @notice Execute just the pre-hook (for testing pre-hook in isolation)
    /// @param orderManager The KapanOrderManager contract
    /// @param orderHash The order being executed
    function simulatePreHookOnly(
        address orderManager,
        bytes32 orderHash
    ) external {
        _callAsTrampoline(orderManager, abi.encodeCall(IKapanOrderManager.executePreHook, (orderHash)));
    }

    // ============ Internal ============

    /// @dev Call a function on target, impersonating the HooksTrampoline
    /// @notice Uses vm.prank in Foundry tests - for Hardhat, use the actual HooksTrampoline
    function _callAsTrampoline(address target, bytes memory data) internal {
        // In a real test environment, we'd need to:
        // 1. Set msg.sender to hooksTrampoline address
        // 2. Make the call
        //
        // For Hardhat tests, the test script should impersonate hooksTrampoline
        // This function just makes the call directly
        (bool success, bytes memory returnData) = target.call(data);
        if (!success) {
            // Bubble up the revert reason
            if (returnData.length > 0) {
                assembly {
                    revert(add(returnData, 32), mload(returnData))
                }
            }
            revert("TestSettler: call failed");
        }
    }

    // ============ View Functions ============

    /// @notice Get the HooksTrampoline address this settler uses
    function getHooksTrampoline() external view returns (address) {
        return hooksTrampoline;
    }
}

/// @title TestSettlerHarness
/// @notice Hardhat-compatible test settler that allows setting caller context
/// @dev For Hardhat tests, use hardhat_impersonateAccount to impersonate HooksTrampoline
contract TestSettlerHarness {
    using SafeERC20 for IERC20;

    // ============ Events ============

    event SwapSimulated(
        bytes32 indexed orderHash,
        address sellToken,
        address buyToken,
        uint256 sellAmount,
        uint256 buyAmount
    );

    // ============ Main Function ============

    /// @notice Simulate a CoW swap - caller must be HooksTrampoline (use impersonation)
    /// @dev For Hardhat: impersonate HooksTrampoline, then call orderManager hooks directly
    ///
    /// Usage in Hardhat tests:
    /// ```
    /// await hre.network.provider.request({
    ///   method: "hardhat_impersonateAccount",
    ///   params: [hooksTrampolineAddress],
    /// });
    /// const trampolineSigner = await ethers.getSigner(hooksTrampolineAddress);
    /// await orderManager.connect(trampolineSigner).executePreHook(orderHash);
    /// // ... transfer tokens ...
    /// await orderManager.connect(trampolineSigner).executePostHook(orderHash);
    /// ```
    ///
    /// This contract provides a simpler flow for basic tests.
    function simulateSwapWithImpersonation(
        address orderManager,
        bytes32 orderHash,
        address sellToken,
        address buyToken,
        uint256 sellAmount,
        uint256 buyAmount,
        address /* hooksCaller */
    ) external {
        // 1. Pre-hook (must be called by hooksCaller - test should impersonate)
        IKapanOrderManager(orderManager).executePreHook(orderHash);

        // 2. Simulate swap
        IERC20(sellToken).safeTransferFrom(orderManager, address(this), sellAmount);
        IERC20(buyToken).safeTransferFrom(msg.sender, orderManager, buyAmount);

        // 3. Post-hook
        IKapanOrderManager(orderManager).executePostHook(orderHash);

        emit SwapSimulated(orderHash, sellToken, buyToken, sellAmount, buyAmount);
    }
}
