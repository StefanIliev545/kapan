// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { ProtocolGateway } from "../../../gateways/ProtocolGateway.sol";
import { IGateway } from "../../interfaces/IGateway.sol";
import { ProtocolTypes } from "../../interfaces/ProtocolTypes.sol";
import { ICompoundComet } from "../../interfaces/compound/ICompoundComet.sol";

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract CompoundGatewayWrite is IGateway, ProtocolGateway, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // base token => Comet
    mapping(address => ICompoundComet) public tokenToComet;

    // registry for view
    address[] private _comets;
    mapping(address => bool) private _isRegistered;

    event CometRegistered(address indexed baseToken, address indexed comet);
    event CometReplaced(address indexed baseToken, address indexed oldComet, address indexed newComet);

    constructor(address router, address owner_) ProtocolGateway(router) Ownable(owner_) {}

    function addComet(ICompoundComet comet) external onlyOwner {
        address base = comet.baseToken();
        require(base != address(0), "Compound: base=0");
        require(!_isRegistered[address(comet)], "Compound: already registered");

        tokenToComet[base] = comet;
        _isRegistered[address(comet)] = true;
        _comets.push(address(comet));
        emit CometRegistered(base, address(comet));
    }

    function setCometForBase(address baseToken, address comet_) external onlyOwner {
        require(baseToken != address(0) && comet_ != address(0), "Compound: zero");
        require(address(tokenToComet[baseToken]) == address(0), "Compound: comet already set");
        require(!_isRegistered[comet_], "Compound: comet already registered");

        tokenToComet[baseToken] = ICompoundComet(comet_);
        emit CometRegistered(baseToken, comet_);
    }

    function allComets() external view returns (address[] memory) {
        return _comets;
    }

    function processLendingInstruction(
        ProtocolTypes.Output[] calldata inputs,
        bytes calldata data
    ) external onlyRouter returns (ProtocolTypes.Output[] memory outputs) {
        ProtocolTypes.LendingInstruction memory ins = abi.decode(data, (ProtocolTypes.LendingInstruction));
        address market = _decodeMarket(ins.context);
        address token = ins.token;
        uint256 amount = ins.amount;
        if (ins.input.index < inputs.length) {
            token = inputs[ins.input.index].token;
            amount = inputs[ins.input.index].amount;
        }

        if (ins.op == ProtocolTypes.LendingOp.Deposit) {
            if (market != address(0) && market != token) depositCollateral(market, token, amount, ins.user);
            else deposit(token, ins.user, amount);
            outputs = new ProtocolTypes.Output[](0);
        } else if (ins.op == ProtocolTypes.LendingOp.DepositCollateral) {
            address base = market != address(0) ? market : token;
            depositCollateral(base, token, amount, ins.user);
            outputs = new ProtocolTypes.Output[](0);
        } else if (ins.op == ProtocolTypes.LendingOp.WithdrawCollateral) {
            address base = market != address(0) ? market : token;
            (address u, uint256 amt) = withdrawCollateral(base, token, ins.user, amount);
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({ token: u, amount: amt });
        } else if (ins.op == ProtocolTypes.LendingOp.Borrow) {
            borrow(token, ins.user, amount);
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({ token: token, amount: amount });
        } else if (ins.op == ProtocolTypes.LendingOp.Repay) {
            repay(token, ins.user, amount);
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({ token: token, amount: 0 });
        } else if (ins.op == ProtocolTypes.LendingOp.GetBorrowBalance) {
            ICompoundComet comet = tokenToComet[token];
            uint256 bal = address(comet) == address(0) ? 0 : comet.borrowBalanceOf(ins.user);
            // NO BUFFER in execution
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({ token: token, amount: bal });
        } else if (ins.op == ProtocolTypes.LendingOp.GetSupplyBalance) {
            uint256 bal;
            if (market != address(0) && market != token) {
                ICompoundComet comet = tokenToComet[market];
                bal = address(comet) == address(0) ? 0 : uint256(comet.collateralBalanceOf(ins.user, token));
            } else {
                ICompoundComet comet = tokenToComet[token];
                bal = address(comet) == address(0) ? 0 : comet.balanceOf(ins.user);
            }
            // NO BUFFER in execution (Fixes Withdraw revert)
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({ token: token, amount: bal });
        } else {
            revert("Compound: unknown op");
        }
    }

    function deposit(address token, address onBehalfOf, uint256 amount) internal nonReentrant {
        ICompoundComet comet = tokenToComet[token];
        require(address(comet) != address(0), "Compound: base comet not found");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).approve(address(comet), 0);
        IERC20(token).approve(address(comet), amount);
        comet.supplyTo(onBehalfOf, token, amount);
    }

    function depositCollateral(
        address market,
        address collateral,
        uint256 amount,
        address receiver
    ) internal nonReentrant {
        ICompoundComet comet = tokenToComet[market];
        require(address(comet) != address(0), "Compound: market comet not found");
        IERC20(collateral).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(collateral).approve(address(comet), 0);
        IERC20(collateral).approve(address(comet), amount);
        comet.supplyTo(receiver, collateral, amount);
    }

    function withdrawCollateral(
        address market,
        address collateral,
        address user,
        uint256 amount
    ) internal nonReentrant returns (address, uint256) {
        ICompoundComet comet = tokenToComet[market];
        require(address(comet) != address(0), "Compound: market comet not found");

        // Fix: Use msg.sender (Router) as receiver to simplify flow and ensure authorization alignment
        comet.withdrawFrom(user, msg.sender, collateral, amount);

        return (collateral, amount);
    }

    function borrow(address token, address user, uint256 amount) internal nonReentrant {
        ICompoundComet comet = tokenToComet[token];
        require(address(comet) != address(0), "Compound: base comet not found");
        comet.withdrawFrom(user, address(this), token, amount);
        IERC20(token).safeTransfer(msg.sender, amount);
    }

    function repay(address token, address user, uint256 amount) internal nonReentrant {
        ICompoundComet comet = tokenToComet[token];
        require(address(comet) != address(0), "Compound: base comet not found");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).approve(address(comet), 0);
        IERC20(token).approve(address(comet), amount);
        comet.supplyTo(user, token, amount);
    }

    function authorize(
        ProtocolTypes.LendingInstruction[] calldata instrs,
        address caller,
        ProtocolTypes.Output[] calldata inputs
    ) external view returns (address[] memory targets, bytes[] memory data, ProtocolTypes.Output[] memory produced) {
        targets = new address[](instrs.length);
        data = new bytes[](instrs.length);
        produced = new ProtocolTypes.Output[](_countOutputs(instrs));
        uint256 pIdx = 0;

        for (uint256 i = 0; i < instrs.length; i++) {
            (address target, bytes memory callData, ProtocolTypes.Output memory output, bool hasOutput) = 
                _processAuthorizeOp(instrs[i], caller, inputs);
            targets[i] = target;
            data[i] = callData;
            if (hasOutput) {
                produced[pIdx++] = output;
            }
        }
    }

    function _countOutputs(ProtocolTypes.LendingInstruction[] calldata instrs) private pure returns (uint256 count) {
        for (uint256 i = 0; i < instrs.length; i++) {
            ProtocolTypes.LendingOp op = instrs[i].op;
            if (
                op == ProtocolTypes.LendingOp.WithdrawCollateral ||
                op == ProtocolTypes.LendingOp.Borrow ||
                op == ProtocolTypes.LendingOp.Repay ||
                op == ProtocolTypes.LendingOp.GetBorrowBalance ||
                op == ProtocolTypes.LendingOp.GetSupplyBalance
            ) {
                count++;
            }
        }
    }

    function _processAuthorizeOp(
        ProtocolTypes.LendingInstruction calldata ins,
        address caller,
        ProtocolTypes.Output[] calldata inputs
    ) private view returns (address target, bytes memory callData, ProtocolTypes.Output memory output, bool hasOutput) {
        address market = _decodeMarket(ins.context);
        address token = ins.token;
        uint256 amount = ins.amount;
        if (ins.input.index < inputs.length) {
            token = inputs[ins.input.index].token;
            amount = inputs[ins.input.index].amount;
        }

        if (ins.op == ProtocolTypes.LendingOp.Deposit || ins.op == ProtocolTypes.LendingOp.Repay) {
            if (ins.op == ProtocolTypes.LendingOp.Repay) {
                output = ProtocolTypes.Output({ token: token, amount: 0 });
                hasOutput = true;
            }
        } else if (
            ins.op == ProtocolTypes.LendingOp.DepositCollateral ||
            (ins.op == ProtocolTypes.LendingOp.Deposit && market != address(0) && market != token)
        ) {
            // No output
        } else if (ins.op == ProtocolTypes.LendingOp.WithdrawCollateral) {
            (target, callData) = _getWithdrawAuth(market, token, caller);
            output = ProtocolTypes.Output({ token: token, amount: amount });
            hasOutput = true;
        } else if (ins.op == ProtocolTypes.LendingOp.Borrow) {
            (target, callData) = _getBorrowAuth(token, caller);
            output = ProtocolTypes.Output({ token: token, amount: amount });
            hasOutput = true;
        } else if (ins.op == ProtocolTypes.LendingOp.GetBorrowBalance) {
            uint256 bal = _getBorrowBalance(token, ins.user);
            output = ProtocolTypes.Output({ token: token, amount: (bal * 1001) / 1000 });
            hasOutput = true;
        } else if (ins.op == ProtocolTypes.LendingOp.GetSupplyBalance) {
            uint256 bal = _getSupplyBalance(token, market, ins.user);
            output = ProtocolTypes.Output({ token: token, amount: (bal * 1001) / 1000 });
            hasOutput = true;
        }
    }

    function _getWithdrawAuth(address market, address token, address caller) private view returns (address target, bytes memory callData) {
        address base = market != address(0) ? market : token;
        ICompoundComet comet = tokenToComet[base];
        if (!comet.isAllowed(caller, address(this))) {
            target = address(comet);
            callData = abi.encodeWithSelector(ICompoundComet.allow.selector, address(this), true);
        }
    }

    function _getBorrowAuth(address token, address caller) private view returns (address target, bytes memory callData) {
        ICompoundComet comet = tokenToComet[token];
        if (!comet.isAllowed(caller, address(this))) {
            target = address(comet);
            callData = abi.encodeWithSelector(ICompoundComet.allow.selector, address(this), true);
        }
    }

    function _getBorrowBalance(address token, address user) private view returns (uint256) {
        ICompoundComet comet = tokenToComet[token];
        return address(comet) == address(0) ? 0 : comet.borrowBalanceOf(user);
    }

    function _getSupplyBalance(address token, address market, address user) private view returns (uint256) {
        if (market != address(0) && market != token) {
            ICompoundComet comet = tokenToComet[market];
            return address(comet) == address(0) ? 0 : uint256(comet.collateralBalanceOf(user, token));
        } else {
            ICompoundComet comet = tokenToComet[token];
            return address(comet) == address(0) ? 0 : comet.balanceOf(user);
        }
    }

    function deauthorize(
        ProtocolTypes.LendingInstruction[] calldata instrs,
        address /*caller*/,
        ProtocolTypes.Output[] calldata inputs
    ) external view override returns (address[] memory targets, bytes[] memory data) {
        targets = new address[](instrs.length);
        data = new bytes[](instrs.length);

        for (uint256 i = 0; i < instrs.length; i++) {
            ProtocolTypes.LendingInstruction calldata ins = instrs[i];
            address market = _decodeMarket(ins.context);
            address token = ins.token;
            if (ins.input.index < inputs.length) {
                token = inputs[ins.input.index].token;
            }

            if (ins.op == ProtocolTypes.LendingOp.WithdrawCollateral) {
                address base = market != address(0) ? market : token;
                ICompoundComet comet = tokenToComet[base];
                if (address(comet) != address(0)) {
                    targets[i] = address(comet);
                    // allow(manager, isAllowed) -> false
                    data[i] = abi.encodeWithSelector(ICompoundComet.allow.selector, address(this), false);
                }
            } else if (ins.op == ProtocolTypes.LendingOp.Borrow) {
                ICompoundComet comet = tokenToComet[token];
                if (address(comet) != address(0)) {
                    targets[i] = address(comet);
                    data[i] = abi.encodeWithSelector(ICompoundComet.allow.selector, address(this), false);
                }
            } else {
                targets[i] = address(0);
                data[i] = bytes("");
            }
        }
    }

    function _decodeMarket(bytes memory ctx) internal pure returns (address market) {
        if (ctx.length >= 32) {
            assembly {
                market := mload(add(ctx, 32))
            }
        }
    }

    // ============ Emergency Recovery ============

    /// @notice Recover stuck tokens (owner only)
    function recoverTokens(address token, address to, uint256 amount) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        uint256 toRecover = amount == type(uint256).max ? balance : amount;
        if (toRecover > balance) toRecover = balance;
        if (toRecover > 0) {
            IERC20(token).safeTransfer(to, toRecover);
        }
    }
}
