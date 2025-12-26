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

/// @notice Abstract base supporting Balancer v2/v3, Aave v3 (and forks like ZeroLend) and Uniswap v3 flash sources.
///         Security model: callback is accepted IFF it is in the middle of an expected flash flow AND sender matches
///         the expected provider/pool (plus basic provider-specific validation).
abstract contract FlashLoanConsumerBase is IAaveFlashLoanSimpleReceiver {
    using SafeERC20 for IERC20;

    // ----------------- Providers (config) -----------------
    IFlashLoanProvider public balancerV2Vault; // Balancer v2 Vault
    IVaultV3 public balancerV3Vault;          // Balancer v3 Vault

    mapping(bytes32 => address) public aaveCompatiblePools; // key hash => pool address
    mapping(address => bool) public isAaveCompatiblePool;   // callback validation allowlist

    // Trusted Uniswap v3 factory (non-zero enables Uniswap v3)
    address public uniswapV3Factory;

    // ----------------- Callback guard -----------------
    bool private flashLoanEnabled;
    address private authorizedFlashSender;

    // ----------------- Events -----------------
    event FlashRequested(bytes32 provider, address indexed token, uint256 amount);
    event FlashRepaid(bytes32 provider, address indexed token, uint256 amountWithFee);

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

    function _removeAaveCompatiblePool(string memory key) internal {
        bytes32 keyHash = keccak256(abi.encodePacked(key));
        address pool = aaveCompatiblePools[keyHash];
        if (pool != address(0)) {
            isAaveCompatiblePool[pool] = false;
            aaveCompatiblePools[keyHash] = address(0);
        }
    }

    function getAaveCompatiblePool(string memory key) public view returns (address) {
        return aaveCompatiblePools[keccak256(abi.encodePacked(key))];
    }

    function _setUniswapV3Factory(address factory) internal {
        uniswapV3Factory = factory;
    }

    // ----------------- Enabled flags -----------------
    function balancerV2Enabled() public view returns (bool) {
        return address(balancerV2Vault) != address(0);
    }

    function balancerV3Enabled() public view returns (bool) {
        return address(balancerV3Vault) != address(0);
    }

    function aaveEnabledForKey(string memory key) public view returns (bool) {
        return aaveCompatiblePools[keccak256(abi.encodePacked(key))] != address(0);
    }

    function uniswapEnabled() public view returns (bool) {
        return uniswapV3Factory != address(0);
    }

    // ----------------- Guard modifiers -----------------
    modifier flashLoanOnly() {
        require(flashLoanEnabled, "Flash loan not enabled");
        require(msg.sender == authorizedFlashSender, "Unauthorized flash caller");
        _;
    }

    /// @dev Sets the expected sender for the callback and enables the flash-loan-only gate.
    ///      Includes a no-nesting guard for clarity/safety.
    modifier authorizeFlashLoan(address expectedSender) {
        require(!flashLoanEnabled, "Nested flash not allowed");
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
        require(balancerV2Enabled(), "Balancer v2 disabled");
        require(token != address(0) && amount > 0, "Bad params");

        IERC20[] memory tokens = new IERC20[](1);
        tokens[0] = IERC20(token);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;

        emit FlashRequested("BALANCER_V2", token, amount);
        balancerV2Vault.flashLoan(address(this), tokens, amounts, userData);
    }

    function receiveFlashLoan(
        IERC20[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata feeAmounts,
        bytes calldata userData
    ) external flashLoanOnly {
        // defense-in-depth (even though flashLoanOnly already checked)
        require(msg.sender == address(balancerV2Vault), "Unauthorized Balancer v2");
        require(tokens.length == 1, "Only single-asset supported");

        uint256 repayment = amounts[0] + feeAmounts[0];
        _afterFlashLoan(address(tokens[0]), repayment, userData);

        tokens[0].safeTransfer(address(balancerV2Vault), repayment);
        emit FlashRepaid("BALANCER_V2", address(tokens[0]), repayment);
    }

    // ============================================================
    //                          BALANCER V3
    // ============================================================

    function _requestBalancerV3(address token, uint256 amount)
        internal
        authorizeFlashLoan(address(balancerV3Vault))
    {
        require(balancerV3Enabled(), "Balancer v3 disabled");
        require(token != address(0) && amount > 0, "Bad params");

        bytes memory userData = abi.encode(token, amount);
        bytes memory callData = abi.encodeWithSelector(this.receiveFlashLoanV3.selector, userData);

        emit FlashRequested("BALANCER_V3", token, amount);
        balancerV3Vault.unlock(callData);
    }

    function receiveFlashLoanV3(bytes calldata userData) external flashLoanOnly {
        require(msg.sender == address(balancerV3Vault), "Unauthorized Balancer v3");

        (address token, uint256 amount) = abi.decode(userData, (address, uint256));
        require(token != address(0) && amount > 0, "Bad params");

        balancerV3Vault.sendTo(token, address(this), amount);

        // NOTE: If Balancer v3 charges a fee in your deployment context, adjust repayment accordingly.
        _afterFlashLoan(token, amount, userData);

        IERC20(token).safeTransfer(address(balancerV3Vault), amount);
        balancerV3Vault.settle(token, amount);

        emit FlashRepaid("BALANCER_V3", token, amount);
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
        require(pool != address(0), "Aave pool not registered for key");
        _requestAaveCompatibleInternal(pool, token, amount, userData);
    }

    function _requestAaveCompatibleInternal(
        address pool,
        address token,
        uint256 amount,
        bytes memory userData
    ) private authorizeFlashLoan(pool) {
        require(token != address(0) && amount > 0, "Bad params");

        emit FlashRequested("AAVE_COMPATIBLE", token, amount);
        IAaveV3Pool(pool).flashLoanSimple(address(this), token, amount, userData, 0);
    }

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override flashLoanOnly returns (bool) {
        require(isAaveCompatiblePool[msg.sender], "Unauthorized Aave pool");
        require(initiator == address(this), "Bad initiator");

        uint256 repayment = amount + premium;
        _afterFlashLoan(asset, repayment, params);

        IERC20(asset).approve(msg.sender, 0);
        IERC20(asset).approve(msg.sender, repayment);

        emit FlashRepaid("AAVE_COMPATIBLE", asset, repayment);
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
        require(uniswapEnabled(), "Uniswap v3 disabled");
        require(pool != address(0), "Pool required");
        require(token != address(0) && amount > 0, "Bad params");

        // Authenticate pool against trusted factory + canonical getPool
        IUniswapV3Pool p = IUniswapV3Pool(pool);
        require(p.factory() == uniswapV3Factory, "Pool not from trusted factory");

        address t0 = p.token0();
        address t1 = p.token1();
        uint24 fee = p.fee();
        address canonical = IUniswapV3Factory(uniswapV3Factory).getPool(t0, t1, fee);
        require(canonical == pool, "Non-canonical Uniswap pool");

        bool is0 = token == t0;
        bool is1 = token == t1;
        require(is0 || is1, "Token not in pool");

        bytes memory data = abi.encode(pool, token, amount, userData, is0);

        emit FlashRequested("UNISWAP_V3", token, amount);
        p.flash(address(this), is0 ? amount : 0, is1 ? amount : 0, data);
    }

    function uniswapV3FlashCallback(uint256 fee0, uint256 fee1, bytes calldata data) external flashLoanOnly {
        (address pool, address token, uint256 amount, bytes memory userData, bool is0) =
            abi.decode(data, (address, address, uint256, bytes, bool));

        require(msg.sender == pool, "Unauthorized Uniswap pool");

        // Defense-in-depth: re-check factory/canonical
        IUniswapV3Pool p = IUniswapV3Pool(pool);
        require(p.factory() == uniswapV3Factory, "Pool not from trusted factory");
        address canonical = IUniswapV3Factory(uniswapV3Factory).getPool(p.token0(), p.token1(), p.fee());
        require(canonical == pool, "Non-canonical Uniswap pool");

        uint256 fee = is0 ? fee0 : fee1;
        uint256 repayment = amount + fee;

        _afterFlashLoan(token, repayment, userData);

        IERC20(token).safeTransfer(msg.sender, repayment);
        emit FlashRepaid("UNISWAP_V3", token, repayment);
    }

    // ============================================================
    //                       ABSTRACT RESUME HOOK
    // ============================================================

    function _afterFlashLoan(address token, uint256 repaymentAmount, bytes memory userData) internal virtual;
}
