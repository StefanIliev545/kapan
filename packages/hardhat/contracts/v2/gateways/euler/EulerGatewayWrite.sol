// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ProtocolGateway} from "../../../gateways/ProtocolGateway.sol";
import {IGateway} from "../../interfaces/IGateway.sol";
import {ProtocolTypes} from "../../interfaces/ProtocolTypes.sol";
import {IEulerVault} from "../../interfaces/euler/IEulerVault.sol";

contract EulerGatewayWrite is IGateway, ProtocolGateway, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    mapping(address => IEulerVault) public tokenToVault;
    address[] private _vaults;
    mapping(address => bool) private _isRegistered;

    event EulerMarketAdded(address indexed token, address indexed vault);

    constructor(address router, address owner_) ProtocolGateway(router) Ownable(owner_) {}

    function addEulerMarket(address vault) external onlyOwner {
        IEulerVault v = IEulerVault(vault);
        address underlying = _getUnderlying(v);
        tokenToVault[underlying] = v;
        if (!_isRegistered[vault]) {
            _isRegistered[vault] = true;
            _vaults.push(vault);
        }
        emit EulerMarketAdded(underlying, vault);
    }

    function allVaults() external view returns (address[] memory) {
        return _vaults;
    }

    function processLendingInstruction(
        ProtocolTypes.Output[] calldata inputs,
        bytes calldata data
    ) external returns (ProtocolTypes.Output[] memory outputs) {
        ProtocolTypes.LendingInstruction memory ins = abi.decode(data, (ProtocolTypes.LendingInstruction));
        address token = ins.token;
        uint256 amount = ins.amount;
        if (ins.input.index < inputs.length) {
            token = inputs[ins.input.index].token;
            amount = inputs[ins.input.index].amount;
        }

        if (ins.op == ProtocolTypes.LendingOp.Deposit || ins.op == ProtocolTypes.LendingOp.DepositCollateral) {
            deposit(token, ins.user, amount);
            outputs = new ProtocolTypes.Output[](0);
        } else if (ins.op == ProtocolTypes.LendingOp.WithdrawCollateral) {
            (address outToken, uint256 outAmount) = withdraw(token, ins.user, amount);
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({token: outToken, amount: outAmount});
        } else if (ins.op == ProtocolTypes.LendingOp.Borrow) {
            borrow(token, ins.user, amount);
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({token: token, amount: amount});
        } else if (ins.op == ProtocolTypes.LendingOp.Repay) {
            repay(token, ins.user, amount);
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({token: token, amount: 0});
        } else if (ins.op == ProtocolTypes.LendingOp.GetBorrowBalance) {
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({token: token, amount: 0});
        } else if (ins.op == ProtocolTypes.LendingOp.GetSupplyBalance) {
            IEulerVault vault = tokenToVault[token];
            uint256 bal = address(vault) == address(0) ? 0 : vault.balanceOf(ins.user);
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({token: token, amount: bal});
        } else {
            revert("Euler: unknown op");
        }
    }

    function deposit(address token, address onBehalfOf, uint256 amount) public onlyRouter nonReentrant {
        IEulerVault vault = tokenToVault[token];
        require(address(vault) != address(0), "Euler: vault not found");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).forceApprove(address(vault), amount);
        vault.deposit(amount, onBehalfOf);
    }

    function withdraw(address token, address user, uint256 amount)
        public
        onlyRouterOrSelf(user)
        nonReentrant
        returns (address, uint256)
    {
        IEulerVault vault = tokenToVault[token];
        require(address(vault) != address(0), "Euler: vault not found");

        uint256 shares;
        try vault.convertToShares(amount) returns (uint256 s) {
            shares = s;
        } catch {
            uint256 supply = vault.totalSupply();
            uint256 assets = vault.totalAssets();
            shares = assets == 0 ? 0 : (amount * supply) / assets;
        }

        if (shares == 0) {
            try vault.redeem(type(uint256).max, msg.sender, user) returns (uint256 assetsOut) {
                return (token, assetsOut);
            } catch {
                return (token, 0);
            }
        }

        vault.redeem(shares, msg.sender, user);
        return (token, amount);
    }

    function borrow(address token, address user, uint256 amount) public onlyRouterOrSelf(user) nonReentrant {
        IEulerVault vault = tokenToVault[token];
        require(address(vault) != address(0), "Euler: vault not found");
        vault.borrow(amount, msg.sender, user);
    }

    function repay(address token, address user, uint256 amount) public onlyRouter nonReentrant {
        IEulerVault vault = tokenToVault[token];
        require(address(vault) != address(0), "Euler: vault not found");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).forceApprove(address(vault), amount);
        vault.repay(amount, user);
    }

    function authorize(
        ProtocolTypes.LendingInstruction[] calldata instrs,
        address,
        ProtocolTypes.Output[] calldata
    )
        external
        pure
        returns (address[] memory targets, bytes[] memory data, ProtocolTypes.Output[] memory produced)
    {
        targets = new address[](instrs.length);
        data = new bytes[](instrs.length);
        produced = new ProtocolTypes.Output[](0);
    }

    function deauthorize(ProtocolTypes.LendingInstruction[] calldata instrs, address)
        external
        pure
        returns (address[] memory targets, bytes[] memory data)
    {
        targets = new address[](instrs.length);
        data = new bytes[](instrs.length);
    }

    function _getUnderlying(IEulerVault vault) internal view returns (address token) {
        try vault.underlyingAsset() returns (address t) {
            return t;
        } catch {}
        try vault.asset() returns (address t) {
            return t;
        } catch {}
    }
}
