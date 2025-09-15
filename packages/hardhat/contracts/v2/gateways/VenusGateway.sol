// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "../interfaces/ILendingGateway.sol";
import "../interfaces/IGatewayView.sol";
import "../../gateways/ProtocolGateway.sol";
import "../../interfaces/venus/ComptrollerInterface.sol";
import "../../interfaces/venus/VTokenInterface.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract VenusGateway is ILendingGateway, IGatewayView, ProtocolGateway, ReentrancyGuard {
    using SafeERC20 for IERC20;

    ComptrollerInterface public comptroller;

    // track vToken balances held on behalf of users
    mapping(address => mapping(address => uint256)) public userVTokenBalance;

    constructor(address router, address _comptroller) ProtocolGateway(router) {
        comptroller = ComptrollerInterface(_comptroller);
    }

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
        address vToken = getVTokenForUnderlying(token);
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).approve(vToken, amount);
        uint256 balanceBefore = VTokenInterface(vToken).balanceOf(address(this));
        require(VTokenInterface(vToken).mint(amount) == 0, "mint failed");
        uint256 balanceAfter = VTokenInterface(vToken).balanceOf(address(this));
        uint256 minted = balanceAfter - balanceBefore;
        userVTokenBalance[user][vToken] += minted;
    }

    function _borrow(address token, address user, uint256 amount) internal nonReentrant {
        address vToken = getVTokenForUnderlying(token);
        require(VTokenInterface(vToken).borrowBehalf(user, amount) == 0, "borrow failed");
        IERC20(token).safeTransfer(msg.sender, IERC20(token).balanceOf(address(this)));
    }

    function _repay(address token, address user, uint256 amount, bool repayAll) internal nonReentrant {
        address vToken = getVTokenForUnderlying(token);
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 repayAmount = amount;
        if (repayAll) {
            uint256 debt = VTokenInterface(vToken).borrowBalanceCurrent(user);
            if (debt < repayAmount) {
                repayAmount = debt;
            }
        }
        IERC20(token).approve(vToken, repayAmount);
        require(VTokenInterface(vToken).repayBorrowBehalf(user, repayAmount) == 0, "repay failed");
        uint256 leftover = IERC20(token).balanceOf(address(this));
        if (leftover > 0) {
            IERC20(token).safeTransfer(msg.sender, leftover);
        }
    }

    function _withdraw(address token, address user, uint256 amount, bool withdrawAll) internal nonReentrant {
        address vToken = getVTokenForUnderlying(token);
        uint256 vBalance = userVTokenBalance[user][vToken];
        require(vBalance > 0, "no balance");
        uint256 vTokensToRedeem;
        if (withdrawAll) {
            vTokensToRedeem = vBalance;
            require(VTokenInterface(vToken).redeem(vTokensToRedeem) == 0, "redeem failed");
        } else {
            uint256 beforeBal = VTokenInterface(vToken).balanceOf(address(this));
            require(VTokenInterface(vToken).redeemUnderlying(amount) == 0, "redeem failed");
            uint256 afterBal = VTokenInterface(vToken).balanceOf(address(this));
            vTokensToRedeem = beforeBal - afterBal;
        }
        userVTokenBalance[user][vToken] -= vTokensToRedeem;
        IERC20(token).safeTransfer(msg.sender, IERC20(token).balanceOf(address(this)));
    }

    // --------- View functions ---------
    function getBalance(address token, address user) external view override returns (uint256) {
        address vToken = getVTokenForUnderlying(token);
        uint256 vBal = userVTokenBalance[user][vToken];
        if (vBal == 0) return 0;
        uint256 exchangeRate = VTokenInterface(vToken).exchangeRateStored();
        return (vBal * exchangeRate) / 1e18;
    }

    function getBorrowBalance(address token, address user) public view override returns (uint256) {
        address vToken = getVTokenForUnderlying(token);
        return VTokenInterface(vToken).borrowBalanceStored(user);
    }

    function getBorrowRate(address token) external view override returns (uint256, bool) {
        address vToken = getVTokenForUnderlying(token);
        return (VTokenInterface(vToken).borrowRatePerBlock(), true);
    }

    function getSupplyRate(address token) external view override returns (uint256, bool) {
        address vToken = getVTokenForUnderlying(token);
        return (VTokenInterface(vToken).supplyRatePerBlock(), true);
    }

    function getBorrowBalanceCurrent(address token, address user) external returns (uint256) {
        return getBorrowBalance(token, user);
    }

    // helper to find vToken for underlying asset
    function getVTokenForUnderlying(address underlyingToken) public view returns (address) {
        VTokenInterface[] memory markets = comptroller.getAllMarkets();
        for (uint i = 0; i < markets.length; i++) {
            address vTokenAddress = address(markets[i]);
            try VTokenInterface(vTokenAddress).underlying() returns (address underlying) {
                if (underlying == underlyingToken) {
                    return vTokenAddress;
                }
            } catch {}
        }
        revert("vToken not found");
    }
}

