// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ProtocolGateway} from "../../../gateways/ProtocolGateway.sol";
import {IGateway} from "../../interfaces/IGateway.sol";
import {ProtocolTypes} from "../../interfaces/ProtocolTypes.sol";
import {ICompoundComet} from "../../interfaces/compound/ICompoundComet.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import "hardhat/console.sol";

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
        address prev = address(tokenToComet[base]);

        tokenToComet[base] = comet;
        if (!_isRegistered[address(comet)]) { _isRegistered[address(comet)] = true; _comets.push(address(comet)); }
        emit CometRegistered(base, address(comet));
        if (prev != address(0) && prev != address(comet)) emit CometReplaced(base, prev, address(comet));
    }

    function setCometForBase(address baseToken, address comet_) external onlyOwner {
        require(baseToken != address(0) && comet_ != address(0), "Compound: zero");
        address prev = address(tokenToComet[baseToken]);
        tokenToComet[baseToken] = ICompoundComet(comet_);
        if (!_isRegistered[comet_]) { _isRegistered[comet_] = true; _comets.push(comet_); }
        emit CometRegistered(baseToken, comet_);
        if (prev != address(0) && prev != comet_) emit CometReplaced(baseToken, prev, comet_);
    }

    function allComets() external view returns (address[] memory) { return _comets; }

    

    function processLendingInstruction(ProtocolTypes.Output[] calldata inputs, bytes calldata data)
        external
        returns (ProtocolTypes.Output[] memory outputs)
    {
        console.log("CompoundGatewayWrite: processLendingInstruction called");
        console.log("CompoundGatewayWrite: inputs count", inputs.length);
        for (uint256 i = 0; i < inputs.length; i++) {
            console.log("CompoundGatewayWrite: input[", i, "] token", uint256(uint160(inputs[i].token)));
            console.log("CompoundGatewayWrite: input[", i, "] amount", inputs[i].amount);
        }
        console.log("CompoundGatewayWrite: data length", data.length);
        
        ProtocolTypes.LendingInstruction memory ins = abi.decode(data, (ProtocolTypes.LendingInstruction));
        console.log("CompoundGatewayWrite: op", uint256(ins.op));
        console.log("CompoundGatewayWrite: token", uint256(uint160(ins.token)));
        console.log("CompoundGatewayWrite: user", uint256(uint160(ins.user)));
        console.log("CompoundGatewayWrite: amount", ins.amount);
        console.log("CompoundGatewayWrite: input.index", ins.input.index);
        
        address market = _decodeMarket(ins.context);
        console.log("CompoundGatewayWrite: market", uint256(uint160(market)));
        address token = ins.token;
        uint256 amount = ins.amount;
        if (ins.input.index < inputs.length) {
            token = inputs[ins.input.index].token;
            amount = inputs[ins.input.index].amount;
            console.log("CompoundGatewayWrite: using UTXO - token", uint256(uint160(token)));
            console.log("CompoundGatewayWrite: using UTXO - amount", amount);
        } else {
            console.log("CompoundGatewayWrite: using instruction params");
        }
        
        if (ins.op == ProtocolTypes.LendingOp.Deposit) {
            console.log("CompoundGatewayWrite: executing Deposit");
            if (market != address(0) && market != token) depositCollateral(market, token, amount, ins.user);
            else deposit(token, ins.user, amount);
            outputs = new ProtocolTypes.Output[](0);
            console.log("CompoundGatewayWrite: Deposit completed, 0 outputs");
        } else if (ins.op == ProtocolTypes.LendingOp.DepositCollateral) {
            console.log("CompoundGatewayWrite: executing DepositCollateral");
            address base = market != address(0) ? market : token;
            depositCollateral(base, token, amount, ins.user);
            outputs = new ProtocolTypes.Output[](0);
            console.log("CompoundGatewayWrite: DepositCollateral completed, 0 outputs");
        } else if (ins.op == ProtocolTypes.LendingOp.WithdrawCollateral) {
            console.log("CompoundGatewayWrite: executing WithdrawCollateral");
            address base = market != address(0) ? market : token;
            (address u, uint256 amt) = withdrawCollateral(base, token, ins.user, amount);
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({token: u, amount: amt});
            console.log("CompoundGatewayWrite: WithdrawCollateral completed, token", uint256(uint160(u)), "amount", amt);
        } else if (ins.op == ProtocolTypes.LendingOp.Borrow) {
            console.log("CompoundGatewayWrite: executing Borrow");
            borrow(token, ins.user, amount);
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({token: token, amount: amount});
            console.log("CompoundGatewayWrite: Borrow completed, token", uint256(uint160(token)), "amount", amount);
        } else if (ins.op == ProtocolTypes.LendingOp.Repay) {
            console.log("CompoundGatewayWrite: executing Repay");
            repay(token, ins.user, amount);
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({token: token, amount: 0});
            console.log("CompoundGatewayWrite: Repay completed, 0 refund");
        } else if (ins.op == ProtocolTypes.LendingOp.GetBorrowBalance) {
            console.log("CompoundGatewayWrite: executing GetBorrowBalance");
            ICompoundComet comet = tokenToComet[token];
            uint256 bal = address(comet) == address(0) ? 0 : comet.borrowBalanceOf(ins.user);
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({token: token, amount: bal});
            console.log("CompoundGatewayWrite: GetBorrowBalance completed, balance", bal);
        } else if (ins.op == ProtocolTypes.LendingOp.GetSupplyBalance) {
            console.log("CompoundGatewayWrite: executing GetSupplyBalance");
            uint256 bal;
            if (market != address(0) && market != token) {
                ICompoundComet comet = tokenToComet[market];
                bal = address(comet) == address(0) ? 0 : uint256(comet.collateralBalanceOf(ins.user, token));
            } else {
                ICompoundComet comet = tokenToComet[token];
                bal = address(comet) == address(0) ? 0 : comet.balanceOf(ins.user);
            }
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({token: token, amount: bal});
            console.log("CompoundGatewayWrite: GetSupplyBalance completed, balance", bal);
        } else {
            console.log("CompoundGatewayWrite: ERROR - unknown op", uint256(ins.op));
            revert("Compound: unknown op");
        }
    }

    function deposit(address token, address onBehalfOf, uint256 amount) public onlyRouter nonReentrant {
        ICompoundComet comet = tokenToComet[token];
        require(address(comet) != address(0), "Compound: base comet not found");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).approve(address(comet), 0);
        IERC20(token).approve(address(comet), amount);
        comet.supplyTo(onBehalfOf, token, amount);
    }

    function depositCollateral(address market, address collateral, uint256 amount, address receiver) public onlyRouter nonReentrant {
        ICompoundComet comet = tokenToComet[market];
        require(address(comet) != address(0), "Compound: market comet not found");
        IERC20(collateral).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(collateral).approve(address(comet), 0);
        IERC20(collateral).approve(address(comet), amount);
        comet.supplyTo(receiver, collateral, amount);
    }

    function withdrawCollateral(address market, address collateral, address user, uint256 amount)
        public onlyRouterOrSelf(user) nonReentrant returns (address, uint256)
    {
        ICompoundComet comet = tokenToComet[market];
        require(address(comet) != address(0), "Compound: market comet not found");
        comet.withdrawFrom(user, address(this), collateral, amount);
        IERC20(collateral).safeTransfer(msg.sender, amount);
        return (collateral, amount);
    }

    function borrow(address token, address user, uint256 amount) public onlyRouterOrSelf(user) nonReentrant {
        ICompoundComet comet = tokenToComet[token];
        require(address(comet) != address(0), "Compound: base comet not found");
        comet.withdrawFrom(user, address(this), token, amount);
        IERC20(token).safeTransfer(msg.sender, amount);
    }

    function repay(address token, address user, uint256 amount) public onlyRouter nonReentrant {
        ICompoundComet comet = tokenToComet[token];
        require(address(comet) != address(0), "Compound: base comet not found");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).approve(address(comet), 0);
        IERC20(token).approve(address(comet), amount);
        comet.supplyTo(user, token, amount);
    }

    function authorize(ProtocolTypes.LendingInstruction[] calldata instrs, address /*caller*/)
        external view returns (address[] memory targets, bytes[] memory data)
    {
        uint256 count;
        for (uint256 i; i < instrs.length; i++) {
            ProtocolTypes.LendingInstruction calldata ins = instrs[i];
            address market = _decodeMarket(ins.context);
            if (ins.op == ProtocolTypes.LendingOp.Deposit || ins.op == ProtocolTypes.LendingOp.Repay) count++;
            else if (ins.op == ProtocolTypes.LendingOp.DepositCollateral || (ins.op == ProtocolTypes.LendingOp.Deposit && market != address(0) && market != ins.token)) count++;
            else if (ins.op == ProtocolTypes.LendingOp.WithdrawCollateral || ins.op == ProtocolTypes.LendingOp.Borrow) count++;
        }
        targets = new address[](count); data = new bytes[](count); uint256 k;
        for (uint256 i; i < instrs.length; i++) {
            ProtocolTypes.LendingInstruction calldata ins = instrs[i];
            address market = _decodeMarket(ins.context);
            if (ins.op == ProtocolTypes.LendingOp.Deposit || ins.op == ProtocolTypes.LendingOp.Repay) {
                targets[k] = ins.token; data[k] = abi.encodeWithSelector(IERC20.approve.selector, address(this), ins.amount); k++;
            } else if (ins.op == ProtocolTypes.LendingOp.DepositCollateral || (ins.op == ProtocolTypes.LendingOp.Deposit && market != address(0) && market != ins.token)) {
                address col = ins.token;
                targets[k] = col; data[k] = abi.encodeWithSelector(IERC20.approve.selector, address(this), ins.amount); k++;
            } else if (ins.op == ProtocolTypes.LendingOp.WithdrawCollateral) {
                address base = market != address(0) ? market : ins.token; ICompoundComet comet = tokenToComet[base];
                targets[k] = address(comet); data[k] = abi.encodeWithSelector(ICompoundComet.allow.selector, address(this), true); k++;
            } else if (ins.op == ProtocolTypes.LendingOp.Borrow) {
                ICompoundComet comet = tokenToComet[ins.token];
                targets[k] = address(comet);
                data[k] = abi.encodeWithSelector(ICompoundComet.allow.selector, address(this), true); k++;
            }
        }
    }

    function _decodeMarket(bytes memory ctx) internal pure returns (address market) {
        if (ctx.length >= 32) { assembly { market := mload(add(ctx, 32)) } }
    }
}


