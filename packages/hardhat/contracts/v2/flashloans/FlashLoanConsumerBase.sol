// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// --- Existing Balancer imports ---
import { IFlashLoanProvider } from "../interfaces/balancer/IFlashLoanProvider.sol";
import { IVaultV3 } from "../interfaces/balancer/IVaultV3.sol";

// --- Minimal Aave v3 interfaces (flashLoanSimple) ---
interface IAaveV3Pool {
    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 referralCode
    ) external;
}

interface IAaveFlashLoanSimpleReceiver {
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool);
}

// --- Minimal Uniswap v3 pool interface ---
interface IUniswapV3Pool {
    function token0() external view returns (address);

    function token1() external view returns (address);

    function flash(address recipient, uint256 amount0, uint256 amount1, bytes calldata data) external;
}

/// @notice Abstract base supporting Balancer v2/v3, Aave v3 and Uniswap v3 flash sources.
///         Providers are *configurable*; zero address = disabled (and requests revert).
abstract contract FlashLoanConsumerBase is IAaveFlashLoanSimpleReceiver {
    using SafeERC20 for IERC20;

    // ----------------- Providers (config) -----------------
    IFlashLoanProvider public balancerV2Vault; // Balancer v2 Vault
    IVaultV3 public balancerV3Vault; // Balancer v3 Vault
    IAaveV3Pool public aaveV3Pool; // Aave v3 Pool (flashLoanSimple)

    // We gate Uniswap v3 availability by storing a *factory or sentinel address*.
    // The actual pool is passed per-request.
    address public uniswapV3FactoryOrSentinel;

    // ----------------- Internal state guard -----------------
    bool private flashLoanEnabled;
    address private authorizedFlashSender;

    // ----------------- Events (optional, helpful for tracing) -----------------
    event FlashRequested(bytes32 provider, address indexed token, uint256 amount);
    event FlashRepaid(bytes32 provider, address indexed token, uint256 amountWithFee);

    // ----------------- Setters -----------------
    function _setBalancerV2(address provider) internal {
        balancerV2Vault = IFlashLoanProvider(provider);
    }

    function _setBalancerV3(address vault) internal {
        balancerV3Vault = IVaultV3(vault);
    }

    function _setAaveV3(address pool) internal {
        aaveV3Pool = IAaveV3Pool(pool);
    }

    /// @dev Any non-zero address works as an enable switch (factory, router, sentinel).
    function _setUniswapV3Enabled(address factoryOrSentinel) internal {
        uniswapV3FactoryOrSentinel = factoryOrSentinel;
    }

    // ----------------- Enabled flags -----------------
    function balancerV2Enabled() public view returns (bool) {
        return address(balancerV2Vault) != address(0);
    }

    function balancerV3Enabled() public view returns (bool) {
        return address(balancerV3Vault) != address(0);
    }

    function aaveEnabled() public view returns (bool) {
        return address(aaveV3Pool) != address(0);
    }

    function uniswapEnabled() public view returns (bool) {
        return uniswapV3FactoryOrSentinel != address(0);
    }

    // ----------------- Guard modifiers -----------------
    modifier enableFlashLoan() {
        flashLoanEnabled = true;
        _;
        flashLoanEnabled = false;
    }

    modifier flashLoanOnly() {
        require(flashLoanEnabled, "Flash loan not enabled");
        require(msg.sender == authorizedFlashSender, "Unauthorized flash caller");
        _;
    }

    modifier authorizeFlashLoan(address expectedSender) {
        flashLoanEnabled = true;
        authorizedFlashSender = expectedSender;
        _;
        authorizedFlashSender = address(0);
        flashLoanEnabled = false;
    }

    // ============================================================
    //                          BALANCER V2
    // ============================================================

    /// @notice Request a Balancer v2 flash loan (single-asset for simplicity).
    function _requestBalancerV2(
        address token,
        uint256 amount,
        bytes memory userData
    ) internal authorizeFlashLoan(address(balancerV2Vault)) {
        require(balancerV2Enabled(), "Balancer v2 disabled");

        IERC20[] memory tokens = new IERC20[](1);
        tokens[0] = IERC20(token);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;

        emit FlashRequested("BALANCER_V2", token, amount);
        balancerV2Vault.flashLoan(address(this), tokens, amounts, userData);
    }

    /// @notice Balancer v2 callback.
    function receiveFlashLoan(
        IERC20[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata feeAmounts,
        bytes calldata userData
    ) external flashLoanOnly {
        require(msg.sender == address(balancerV2Vault), "Unauthorized Balancer v2");

        // For single-asset flash loans, pass the repayment amount
        require(tokens.length == 1, "Only single-asset flash loans supported");
        uint256 repayment = amounts[0] + feeAmounts[0];
        _afterFlashLoan(address(tokens[0]), repayment, userData);

        // Repay principal + fee to the vault
        tokens[0].safeTransfer(address(balancerV2Vault), repayment);
        emit FlashRepaid("BALANCER_V2", address(tokens[0]), repayment);
    }

    // ============================================================
    //                          BALANCER V3
    // ============================================================

    /// @notice Request a Balancer v3 "unlocked" context; vault will callback with our calldata.
    function _requestBalancerV3(address token, uint256 amount) internal authorizeFlashLoan(address(balancerV3Vault)) {
        require(balancerV3Enabled(), "Balancer v3 disabled");

        bytes memory userData = abi.encode(token, amount);
        bytes memory callData = abi.encodeWithSelector(this.receiveFlashLoanV3.selector, userData);

        emit FlashRequested("BALANCER_V3", token, amount);
        balancerV3Vault.unlock(callData); // calls back receiveFlashLoanV3 within unlocked context
    }

    /// @notice Balancer v3 callback, runs in unlocked context.
    function receiveFlashLoanV3(bytes calldata userData) external flashLoanOnly {
        require(msg.sender == address(balancerV3Vault), "Unauthorized Balancer v3");

        (address token, uint256 amount) = abi.decode(userData, (address, uint256));

        if (token != address(0) && amount > 0) {
            // Pull funds in unlocked context
            balancerV3Vault.sendTo(token, address(this), amount);
            // For Balancer v3, repayment amount equals the borrowed amount (fee handled by vault accounting)
            _afterFlashLoan(token, amount, userData);
            // Repay + settle (no premium encoded here, handled by vault accounting)
            IERC20(token).safeTransfer(address(balancerV3Vault), amount);
            balancerV3Vault.settle(token, amount);
            emit FlashRepaid("BALANCER_V3", token, amount);
        }
    }

    // ============================================================
    //                            AAVE V3
    // ============================================================

    /// @notice Request an Aave v3 flash loan (simple mode).
    /// @param token Asset to borrow
    /// @param amount Amount to borrow
    /// @param userData Arbitrary data forwarded to executeOperation and to _afterFlashLoan
    function _requestAaveV3(
        address token,
        uint256 amount,
        bytes memory userData
    ) internal authorizeFlashLoan(address(aaveV3Pool)) {
        require(aaveEnabled(), "Aave v3 disabled");
        emit FlashRequested("AAVE_V3", token, amount);
        // referralCode = 0
        aaveV3Pool.flashLoanSimple(address(this), token, amount, userData, 0);
    }

    /// @notice Aave v3 callback. Approve Pool for principal+premium; return true to finalize.
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override flashLoanOnly returns (bool) {
        require(msg.sender == address(aaveV3Pool), "Unauthorized Aave pool");
        require(initiator == address(this), "Bad initiator");

        uint256 repayment = amount + premium;
        _afterFlashLoan(asset, repayment, params);

        // Repay: approve Pool to pull principal + premium
        // Reset approval to 0 first, then approve new amount (safeApprove pattern for compatibility)
        IERC20(asset).approve(address(aaveV3Pool), 0);
        IERC20(asset).approve(address(aaveV3Pool), repayment);

        emit FlashRepaid("AAVE_V3", asset, repayment);
        return true;
    }

    // ============================================================
    //                          UNISWAP V3
    // ============================================================

    /// @notice Request a Uniswap v3 flash (flash-swap) from a specific pool.
    ///         We enforce global enable via uniswapV3FactoryOrSentinel (non-zero).
    /// @param pool Address of the Uniswap v3 pool (must contain `token`)
    /// @param token The token to borrow (must be token0 or token1 of the pool)
    /// @param amount Amount to borrow
    /// @param userData Your opaque data forwarded to the callback and _afterFlashLoan
    function _requestUniswapV3(
        address pool,
        address token,
        uint256 amount,
        bytes memory userData
    ) internal authorizeFlashLoan(pool) {
        require(uniswapEnabled(), "Uniswap v3 disabled");
        require(pool != address(0), "Pool required");
        require(amount > 0, "Amount=0");

        address t0 = IUniswapV3Pool(pool).token0();
        address t1 = IUniswapV3Pool(pool).token1();
        bool is0 = token == t0;
        bool is1 = token == t1;
        require(is0 || is1, "Token not in pool");

        // Encode pool + token orientation so callback can verify msg.sender and repay the correct leg.
        bytes memory data = abi.encode(pool, token, amount, userData, is0);

        emit FlashRequested("UNISWAP_V3", token, amount);
        IUniswapV3Pool(pool).flash(address(this), is0 ? amount : 0, is1 ? amount : 0, data);
    }

    /// @notice Uniswap v3 flash callback. Must repay (amount + fee) to the *pool* (msg.sender).
    function uniswapV3FlashCallback(uint256 fee0, uint256 fee1, bytes calldata data) external flashLoanOnly {
        (address pool, address token, uint256 amount, bytes memory userData, bool is0) = abi.decode(
            data,
            (address, address, uint256, bytes, bool)
        );

        require(msg.sender == pool, "Unauthorized Uniswap pool");

        uint256 fee = is0 ? fee0 : fee1;
        uint256 repayment = amount + fee;
        _afterFlashLoan(token, repayment, userData);

        IERC20(token).safeTransfer(msg.sender, repayment);
        emit FlashRepaid("UNISWAP_V3", token, repayment);
    }

    // ============================================================
    //                       ABSTRACT RESUME HOOK
    // ============================================================

    /// @dev Derived contracts implement how to resume execution (swap/repay/move collateral etc.).
    /// @param token The token address that was borrowed
    /// @param repaymentAmount The total amount that must be repaid (principal + fee)
    /// @param userData Your opaque data forwarded from the request
    ///      Accepts bytes memory to support both calldata (from callbacks) and memory (from decoded data).
    function _afterFlashLoan(address token, uint256 repaymentAmount, bytes memory userData) internal virtual;
}
