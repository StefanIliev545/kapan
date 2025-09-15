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

    function processLendingInstructions(LendingInstruction[] calldata instructions)
        external
        override
        onlyRouter
        returns (InstructionOutput[][] memory outputs)
    {
        outputs = new InstructionOutput[][](instructions.length);
        for (uint256 i = 0; i < instructions.length; i++) {
            LendingInstruction calldata ins = instructions[i];
            if (ins.instructionType == InstructionType.Deposit) {
                _deposit(ins.basic.token, ins.basic.user, ins.basic.amount);
                outputs[i] = _singleOutput(ins.basic.token, 0);
            } else if (ins.instructionType == InstructionType.Borrow) {
                uint256 outAmount = _borrow(ins.basic.token, ins.basic.user, ins.basic.amount);
                outputs[i] = _singleOutput(ins.basic.token, outAmount);
            } else if (ins.instructionType == InstructionType.Repay) {
                (uint256 repaid, uint256 refund) =
                    _repay(ins.basic.token, ins.basic.user, ins.basic.amount, ins.repayAll);
                outputs[i] = _dualOutput(ins.basic.token, repaid, refund);
            } else if (ins.instructionType == InstructionType.Withdraw) {
                uint256 outAmount =
                    _withdraw(ins.basic.token, ins.basic.user, ins.basic.amount, ins.withdrawAll);
                outputs[i] = _singleOutput(ins.basic.token, outAmount);
            }
        }
    }

    function _singleOutput(address token, uint256 amount)
        internal
        pure
        returns (InstructionOutput[] memory arr)
    {
        arr = new InstructionOutput[](1);
        arr[0] = InstructionOutput({token: token, balance: amount});
    }

    function _dualOutput(address token, uint256 a, uint256 b)
        internal
        pure
        returns (InstructionOutput[] memory arr)
    {
        arr = new InstructionOutput[](2);
        arr[0] = InstructionOutput({token: token, balance: a});
        arr[1] = InstructionOutput({token: token, balance: b});
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

    function _borrow(address token, address user, uint256 amount)
        internal
        nonReentrant
        returns (uint256 outAmount)
    {
        address vToken = getVTokenForUnderlying(token);
        require(VTokenInterface(vToken).borrowBehalf(user, amount) == 0, "borrow failed");
        outAmount = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(msg.sender, outAmount);
    }

    function _repay(address token, address user, uint256 amount, bool repayAll)
        internal
        nonReentrant
        returns (uint256 repaidAmount, uint256 refund)
    {
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
        refund = IERC20(token).balanceOf(address(this));
        if (refund > 0) {
            IERC20(token).safeTransfer(msg.sender, refund);
        }
        repaidAmount = amount - refund;
    }

    function _withdraw(address token, address user, uint256 amount, bool withdrawAll)
        internal
        nonReentrant
        returns (uint256 outAmount)
    {
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
        outAmount = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(msg.sender, outAmount);
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

