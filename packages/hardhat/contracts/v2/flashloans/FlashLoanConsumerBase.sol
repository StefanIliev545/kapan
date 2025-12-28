// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// --- Existing Balancer imports ---
import { IFlashLoanProvider } from "../interfaces/balancer/IFlashLoanProvider.sol";
import { IVaultV3 } from "../interfaces/balancer/IVaultV3.sol";

// --- Morpho Blue imports ---
import { IMorphoBlue, IMorphoFlashLoanCallback } from "../interfaces/morpho/IMorphoBlue.sol";

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

// --- Minimal Uniswap v3 factory/pool interfaces (with auth support) ---
interface IUniswapV3Factory {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address);
}

interface IUniswapV3Pool {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function fee() external view returns (uint24);
    function factory() external view returns (address);

    function flash(address recipient, uint256 amount0, uint256 amount1, bytes calldata data) external;
}

// Custom errors for flash loans
error FlashLoanNotEnabled();
error UnauthorizedFlashCaller();
error NestedFlashNotAllowed();
error ProviderNotConfigured();
error InvalidFlashParams();
error BadInitiator();
error InvalidPool();
error TokenNotInPool();

/// @notice Abstract base supporting Balancer v2/v3, Aave v3 (and forks like ZeroLend), Uniswap v3, and Morpho flash sources.
abstract contract FlashLoanConsumerBase is IAaveFlashLoanSimpleReceiver, IMorphoFlashLoanCallback {
    using SafeERC20 for IERC20;

    // ----------------- Providers (config) -----------------
    IFlashLoanProvider public balancerV2Vault; // Balancer v2 Vault
    IVaultV3 public balancerV3Vault;          // Balancer v3 Vault

    mapping(bytes32 => address) public aaveCompatiblePools; // key hash => pool address
    mapping(address => bool) public isAaveCompatiblePool;   // callback validation allowlist

    // Trusted Uniswap v3 factory (non-zero enables Uniswap v3)
    address public uniswapV3Factory;

    // Morpho Blue singleton (non-zero enables Morpho flash loans)
    address public morphoBlue;

    // ----------------- Callback guard -----------------
    bool private flashLoanEnabled;
    address private authorizedFlashSender;



    // ----------------- Setters -----------------
    function _setBalancerV2(address provider) internal {
        balancerV2Vault = IFlashLoanProvider(provider);
    }

    function _setBalancerV3(address vault) internal {
        balancerV3Vault = IVaultV3(vault);
    }

    function _addAaveCompatiblePool(string memory key, address pool) internal {
        bytes32 keyHash = keccak256(abi.encodePacked(key));
        address oldPool = aaveCompatiblePools[keyHash];
        if (oldPool != address(0)) isAaveCompatiblePool[oldPool] = false;

        aaveCompatiblePools[keyHash] = pool;
        if (pool != address(0)) isAaveCompatiblePool[pool] = true;
    }

    function _setUniswapV3Factory(address factory) internal {
        uniswapV3Factory = factory;
    }

    function _setMorphoBlue(address morpho) internal {
        morphoBlue = morpho;
    }

    // ----------------- Guard modifiers -----------------
    modifier flashLoanOnly() {
        if (!flashLoanEnabled) revert FlashLoanNotEnabled();
        if (msg.sender != authorizedFlashSender) revert UnauthorizedFlashCaller();
        _;
    }

    modifier authorizeFlashLoan(address expectedSender) {
        if (flashLoanEnabled) revert NestedFlashNotAllowed();
        flashLoanEnabled = true;
        authorizedFlashSender = expectedSender;
        _;
        authorizedFlashSender = address(0);
        flashLoanEnabled = false;
    }

    // ============================================================
    //                          BALANCER V2
    // ============================================================

    function _requestBalancerV2(
        address token,
        uint256 amount,
        bytes memory userData
    ) internal authorizeFlashLoan(address(balancerV2Vault)) {
        if (address(balancerV2Vault) == address(0)) revert ProviderNotConfigured();
        if (token == address(0) || amount == 0) revert InvalidFlashParams();

        IERC20[] memory tokens = new IERC20[](1);
        tokens[0] = IERC20(token);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;

        balancerV2Vault.flashLoan(address(this), tokens, amounts, userData);
    }

    function receiveFlashLoan(
        IERC20[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata feeAmounts,
        bytes calldata userData
    ) external flashLoanOnly {
        uint256 repayment = amounts[0] + feeAmounts[0];
        _afterFlashLoan(address(tokens[0]), repayment, userData);
        tokens[0].safeTransfer(address(balancerV2Vault), repayment);
    }

    // ============================================================
    //                          BALANCER V3
    // ============================================================

    function _requestBalancerV3(address token, uint256 amount)
        internal
        authorizeFlashLoan(address(balancerV3Vault))
    {
        if (address(balancerV3Vault) == address(0)) revert ProviderNotConfigured();
        if (token == address(0) || amount == 0) revert InvalidFlashParams();

        bytes memory userData = abi.encode(token, amount);
        balancerV3Vault.unlock(abi.encodeWithSelector(this.receiveFlashLoanV3.selector, userData));
    }

    function receiveFlashLoanV3(bytes calldata userData) external flashLoanOnly {
        (address token, uint256 amount) = abi.decode(userData, (address, uint256));
        balancerV3Vault.sendTo(token, address(this), amount);
        _afterFlashLoan(token, amount, userData);
        IERC20(token).safeTransfer(address(balancerV3Vault), amount);
        balancerV3Vault.settle(token, amount);
    }

    // ============================================================
    //                   AAVE V3 & COMPATIBLE FORKS
    // ============================================================

    function _requestAaveCompatible(
        string memory poolKey,
        address token,
        uint256 amount,
        bytes memory userData
    ) internal {
        address pool = aaveCompatiblePools[keccak256(abi.encodePacked(poolKey))];
        if (pool == address(0)) revert ProviderNotConfigured();
        _requestAaveCompatibleInternal(pool, token, amount, userData);
    }

    function _requestAaveCompatibleInternal(
        address pool,
        address token,
        uint256 amount,
        bytes memory userData
    ) private authorizeFlashLoan(pool) {
        if (token == address(0) || amount == 0) revert InvalidFlashParams();
        IAaveV3Pool(pool).flashLoanSimple(address(this), token, amount, userData, 0);
    }

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override flashLoanOnly returns (bool) {
        if (initiator != address(this)) revert BadInitiator();
        uint256 repayment = amount + premium;
        _afterFlashLoan(asset, repayment, params);
        IERC20(asset).forceApprove(msg.sender, repayment);
        return true;
    }

    // ============================================================
    //                          UNISWAP V3
    // ============================================================

    function _requestUniswapV3(
        address pool,
        address token,
        uint256 amount,
        bytes memory userData
    ) internal authorizeFlashLoan(pool) {
        if (uniswapV3Factory == address(0)) revert ProviderNotConfigured();
        if (pool == address(0) || token == address(0) || amount == 0) revert InvalidFlashParams();

        IUniswapV3Pool p = IUniswapV3Pool(pool);
        if (p.factory() != uniswapV3Factory) revert InvalidPool();

        address t0 = p.token0();
        address t1 = p.token1();
        if (IUniswapV3Factory(uniswapV3Factory).getPool(t0, t1, p.fee()) != pool) revert InvalidPool();

        bool is0 = token == t0;
        if (!is0 && token != t1) revert TokenNotInPool();

        p.flash(address(this), is0 ? amount : 0, is0 ? 0 : amount, abi.encode(pool, token, amount, userData, is0));
    }

    function uniswapV3FlashCallback(uint256 fee0, uint256 fee1, bytes calldata data) external flashLoanOnly {
        (address pool, address token, uint256 amount, bytes memory userData, bool is0) =
            abi.decode(data, (address, address, uint256, bytes, bool));
        uint256 repayment = amount + (is0 ? fee0 : fee1);
        _afterFlashLoan(token, repayment, userData);
        IERC20(token).safeTransfer(pool, repayment);
    }

    // ============================================================
    //                          MORPHO BLUE
    // ============================================================

    function _requestMorpho(
        address token,
        uint256 amount,
        bytes memory userData
    ) internal authorizeFlashLoan(morphoBlue) {
        if (morphoBlue == address(0)) revert ProviderNotConfigured();
        if (token == address(0) || amount == 0) revert InvalidFlashParams();
        IMorphoBlue(morphoBlue).flashLoan(token, amount, abi.encode(token, userData));
    }

    function onMorphoFlashLoan(uint256 assets, bytes calldata data) external override flashLoanOnly {
        (address token, bytes memory userData) = abi.decode(data, (address, bytes));
        _afterFlashLoan(token, assets, userData);
        // Morpho uses safeTransferFrom to pull tokens back, so we need to approve
        IERC20(token).forceApprove(morphoBlue, assets);
    }

    // ============================================================
    //                       ABSTRACT RESUME HOOK
    // ============================================================

    function _afterFlashLoan(address token, uint256 repaymentAmount, bytes memory userData) internal virtual;
}
