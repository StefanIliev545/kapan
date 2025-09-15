// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/ILendingGateway.sol";
import "../interfaces/IGatewayView.sol";
import "../../gateways/ProtocolGateway.sol";
import "../../interfaces/aave/IPoolAddressesProvider.sol";
import "../../interfaces/aave/IUiDataProvider.sol";
import "@aave/core-v3/contracts/interfaces/IPool.sol";
import "@aave/core-v3/contracts/interfaces/IAToken.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface DebtToken {
    function borrowAllowance(address user, address spender) external view returns (uint256);
}

contract AaveGateway is ILendingGateway, IGatewayView, ProtocolGateway, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IPoolAddressesProvider public immutable poolAddressesProvider;
    IUiPoolDataProviderV3 public immutable uiPoolDataProvider;
    uint16 public immutable REFERRAL_CODE;

    constructor(address router, address _poolAddressesProvider, address _uiPoolDataProvider, uint16 _referralCode)
        ProtocolGateway(router)
    {
        poolAddressesProvider = IPoolAddressesProvider(_poolAddressesProvider);
        uiPoolDataProvider = IUiPoolDataProviderV3(_uiPoolDataProvider);
        REFERRAL_CODE = _referralCode;
    }

    // --------- Core instruction processing ---------
    function processLendingInstructions(LendingInstruction[] calldata instructions) external override onlyRouter {
        for (uint256 i = 0; i < instructions.length; i++) {
            LendingInstruction calldata ins = instructions[i];
            if (ins.instructionType == InstructionType.Deposit) {
                _deposit(ins.basic.token, ins.basic.user, ins.basic.amount);
            } else if (ins.instructionType == InstructionType.Borrow) {
                _borrow(ins.basic.token, ins.basic.user, ins.basic.amount);
            } else if (ins.instructionType == InstructionType.Repay) {
                _repay(ins.basic.token, ins.basic.user, ins.basic.amount, ins.repayAll);
            } else if (ins.instructionType == InstructionType.Withdraw) {
                _withdraw(ins.basic.token, ins.basic.user, ins.basic.amount, ins.withdrawAll);
            }
        }
    }

    function _deposit(address token, address user, uint256 amount) internal nonReentrant {
        IPool pool = IPool(poolAddressesProvider.getPool());
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).approve(address(pool), amount);
        pool.supply(token, amount, user, REFERRAL_CODE);
    }

    function _borrow(address token, address user, uint256 amount) internal nonReentrant {
        IPool pool = IPool(poolAddressesProvider.getPool());
        (, address variableDebtToken, bool found) = _getReserveAddresses(token);
        require(found && variableDebtToken != address(0), "invalid debt token");
        uint256 allowance = DebtToken(variableDebtToken).borrowAllowance(user, address(this));
        require(allowance >= amount, "insufficient borrow allowance");
        pool.borrow(token, amount, 2, REFERRAL_CODE, user);
        IERC20(token).safeTransfer(msg.sender, IERC20(token).balanceOf(address(this)));
    }

    function _repay(address token, address user, uint256 amount, bool repayAll) internal nonReentrant {
        IPool pool = IPool(poolAddressesProvider.getPool());
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 repayAmount = repayAll ? type(uint256).max : amount;
        IERC20(token).approve(address(pool), repayAmount);
        pool.repay(token, repayAmount, 2, user);
        uint256 leftover = IERC20(token).balanceOf(address(this));
        if (leftover > 0) {
            IERC20(token).safeTransfer(msg.sender, leftover);
        }
    }

    function _withdraw(address token, address user, uint256 amount, bool withdrawAll) internal nonReentrant {
        IPool pool = IPool(poolAddressesProvider.getPool());
        uint256 withdrawAmount = withdrawAll ? type(uint256).max : amount;
        pool.withdraw(token, withdrawAmount, address(this));
        IERC20(token).safeTransfer(msg.sender, IERC20(token).balanceOf(address(this)));
    }

    // --------- View functions ---------
    function getBalance(address token, address user) external view override returns (uint256) {
        (address aToken,, bool found) = _getReserveAddresses(token);
        if (found && aToken != address(0)) {
            try IERC20(aToken).balanceOf(user) returns (uint256 bal) {
                return bal;
            } catch {}
        }
        (IUiPoolDataProviderV3.UserReserveData[] memory userReserves, ) =
            uiPoolDataProvider.getUserReservesData(poolAddressesProvider, user);
        for (uint256 i = 0; i < userReserves.length; i++) {
            if (userReserves[i].underlyingAsset == token) {
                return userReserves[i].scaledATokenBalance;
            }
        }
        return 0;
    }

    function getBorrowBalance(address token, address user) public view override returns (uint256) {
        (, address variableDebtToken, bool found) = _getReserveAddresses(token);
        if (found && variableDebtToken != address(0)) {
            try IERC20(variableDebtToken).balanceOf(user) returns (uint256 bal) {
                return bal;
            } catch {}
        }
        (IUiPoolDataProviderV3.UserReserveData[] memory userReserves, ) =
            uiPoolDataProvider.getUserReservesData(poolAddressesProvider, user);
        for (uint256 i = 0; i < userReserves.length; i++) {
            if (userReserves[i].underlyingAsset == token) {
                return userReserves[i].scaledVariableDebt;
            }
        }
        return 0;
    }

    function getBorrowRate(address token) external view override returns (uint256, bool) {
        (IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves, ) =
            uiPoolDataProvider.getReservesData(poolAddressesProvider);
        for (uint256 i = 0; i < reserves.length; i++) {
            if (reserves[i].underlyingAsset == token) {
                return (reserves[i].variableBorrowRate, true);
            }
        }
        return (0, false);
    }

    function getSupplyRate(address token) external view override returns (uint256, bool) {
        (IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves, ) =
            uiPoolDataProvider.getReservesData(poolAddressesProvider);
        for (uint256 i = 0; i < reserves.length; i++) {
            if (reserves[i].underlyingAsset == token) {
                return (reserves[i].liquidityRate, true);
            }
        }
        return (0, false);
    }

    function getBorrowBalanceCurrent(address token, address user) external override returns (uint256) {
        return getBorrowBalance(token, user);
    }

    function _getReserveAddresses(address token) internal view returns (address aToken, address variableDebtToken, bool found) {
        try uiPoolDataProvider.getReservesData(poolAddressesProvider) returns (
            IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves,
            IUiPoolDataProviderV3.BaseCurrencyInfo memory
        ) {
            for (uint256 i = 0; i < reserves.length; i++) {
                if (reserves[i].underlyingAsset == token) {
                    return (reserves[i].aTokenAddress, reserves[i].variableDebtTokenAddress, true);
                }
            }
        } catch {}
        return (address(0), address(0), false);
    }
}

