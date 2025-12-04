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
import {IEVC} from "../../interfaces/euler/IEVC.sol";

contract EulerGatewayWrite is IGateway, ProtocolGateway, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    mapping(address => IEulerVault) public tokenToVault;
    IEVC public immutable evc;
    address[] private _vaults;
    mapping(address => bool) private _isRegistered;

    event EulerMarketAdded(address indexed token, address indexed vault);

    constructor(address router, address _evc, address owner_) ProtocolGateway(router) Ownable(owner_) {
        evc = IEVC(_evc);
    }

    function addEulerMarket(address vault) external onlyOwner {
        IEulerVault v = IEulerVault(vault);
        address underlying = _getUnderlying(v);
        require(underlying != address(0), "Euler: underlying missing");
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
            uint256 borrowed = borrow(token, ins.user, amount);
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({token: token, amount: borrowed});
        } else if (ins.op == ProtocolTypes.LendingOp.Repay) {
            uint256 refund = repay(token, ins.user, amount);
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({token: token, amount: refund});
        } else if (ins.op == ProtocolTypes.LendingOp.GetBorrowBalance) {
            uint256 bal = _getBorrowBalance(token, ins.user);
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({token: token, amount: bal});
        } else if (ins.op == ProtocolTypes.LendingOp.GetSupplyBalance) {
            uint256 bal = _getSupplyBalance(token, ins.user);
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

        uint256 maxAssets = _maxWithdrawAssets(vault, user);
        require(maxAssets > 0, "Euler: nothing to withdraw");

        uint256 withdrawAmount = amount;
        if (amount == type(uint256).max || amount > maxAssets) {
            withdrawAmount = maxAssets;
        }

        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        vault.withdraw(withdrawAmount, address(this), user);
        uint256 assetsOut = IERC20(token).balanceOf(address(this)) - balanceBefore;
        IERC20(token).safeTransfer(msg.sender, assetsOut);
        return (token, assetsOut);
    }

    function borrow(address token, address user, uint256 amount)
        public
        onlyRouterOrSelf(user)
        nonReentrant
        returns (uint256)
    {
        IEulerVault vault = tokenToVault[token];
        require(address(vault) != address(0), "Euler: vault not found");

        uint256 beforeBal = IERC20(token).balanceOf(address(this));
        evc.callThroughEVC(user, address(vault), abi.encodeWithSelector(vault.borrow.selector, amount, address(this)));
        uint256 afterBal = IERC20(token).balanceOf(address(this));
        uint256 borrowed = afterBal - beforeBal;
        IERC20(token).safeTransfer(msg.sender, borrowed);
        return borrowed;
    }

    function repay(address token, address user, uint256 amount) public onlyRouter nonReentrant returns (uint256 refund) {
        IEulerVault vault = tokenToVault[token];
        require(address(vault) != address(0), "Euler: vault not found");
        uint256 pre = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).forceApprove(address(vault), amount);
        vault.repay(amount, user);
        uint256 post = IERC20(token).balanceOf(address(this));
        uint256 spent = pre + amount - post;
        refund = amount > spent ? amount - spent : 0;
        if (refund > 0) {
            IERC20(token).safeTransfer(msg.sender, refund);
        }
    }

    function authorize(
        ProtocolTypes.LendingInstruction[] calldata instrs,
        address,
        ProtocolTypes.Output[] calldata
    )
        external
        view
        returns (address[] memory targets, bytes[] memory data, ProtocolTypes.Output[] memory produced)
    {
        targets = new address[](instrs.length);
        data = new bytes[](instrs.length);

        address[] memory controllerVaults = new address[](instrs.length);
        address[] memory collateralVaults = new address[](instrs.length);
        uint256 controllerCount;
        uint256 collateralCount;

        uint256 outCount;
        for (uint256 i = 0; i < instrs.length; i++) {
            ProtocolTypes.LendingOp op = instrs[i].op;
            if (
                op == ProtocolTypes.LendingOp.WithdrawCollateral ||
                op == ProtocolTypes.LendingOp.Borrow ||
                op == ProtocolTypes.LendingOp.GetBorrowBalance ||
                op == ProtocolTypes.LendingOp.GetSupplyBalance ||
                op == ProtocolTypes.LendingOp.Repay
            ) {
                outCount++;
            }

            if (op == ProtocolTypes.LendingOp.Borrow) {
                IEulerVault vault = tokenToVault[instrs[i].token];
                address vaultAddr = address(vault);
                if (vaultAddr != address(0) && !_exists(controllerVaults, controllerCount, vaultAddr)) {
                    controllerVaults[controllerCount++] = vaultAddr;
                }
            } else if (op == ProtocolTypes.LendingOp.DepositCollateral) {
                IEulerVault vault = tokenToVault[instrs[i].token];
                address vaultAddr = address(vault);
                if (vaultAddr != address(0) && !_exists(collateralVaults, collateralCount, vaultAddr)) {
                    collateralVaults[collateralCount++] = vaultAddr;
                }
            }
        }
        produced = new ProtocolTypes.Output[](outCount);
        uint256 pIdx;

        for (uint256 i = 0; i < instrs.length; i++) {
            ProtocolTypes.LendingInstruction calldata ins = instrs[i];
            address token = ins.token;
            uint256 amount = ins.amount;

            if (ins.op == ProtocolTypes.LendingOp.WithdrawCollateral) {
                IEulerVault vault = tokenToVault[token];
                uint256 maxAssets = _maxWithdrawAssets(vault, ins.user);
                uint256 outAmount = amount;
                if (amount == type(uint256).max || amount > maxAssets) {
                    outAmount = maxAssets;
                }

                uint256 requiredShares = _previewWithdrawShares(vault, ins.user, outAmount);
                produced[pIdx++] = ProtocolTypes.Output({token: token, amount: outAmount});

                if (requiredShares == 0) continue;

                uint256 cur = vault.allowance(ins.user, address(this));
                if (cur < requiredShares) {
                    targets[i] = address(vault);
                    data[i] = abi.encodeWithSelector(IERC20.approve.selector, address(this), type(uint256).max);
                }
            } else if (ins.op == ProtocolTypes.LendingOp.Borrow) {
                produced[pIdx++] = ProtocolTypes.Output({token: token, amount: amount});
                bytes[] memory calls = new bytes[](2 + controllerCount + collateralCount);
                uint256 cIdx;

                bool needOperator;
                try evc.isOperator(ins.user, address(this)) returns (bool isOp) {
                    needOperator = !isOp;
                } catch {
                    needOperator = true;
                }

                if (needOperator) {
                    calls[cIdx++] = abi.encodeWithSelector(IEVC.setOperator.selector, address(this), true);
                }

                for (uint256 j = 0; j < controllerCount; j++) {
                    address vaultAddr = controllerVaults[j];
                    bool need;
                    try evc.isControllerEnabled(ins.user, vaultAddr) returns (bool enabled) {
                        need = !enabled;
                    } catch {
                        need = true;
                    }
                    if (need) {
                        calls[cIdx++] = abi.encodeWithSelector(IEVC.enableController.selector, vaultAddr);
                    }
                }

                for (uint256 j = 0; j < collateralCount; j++) {
                    address vaultAddr = collateralVaults[j];
                    bool need;
                    try evc.isCollateralEnabled(ins.user, vaultAddr) returns (bool enabledCol) {
                        need = !enabledCol;
                    } catch {
                        need = true;
                    }
                    if (need) {
                        calls[cIdx++] = abi.encodeWithSelector(IEVC.enableCollateral.selector, vaultAddr);
                    }
                }

                if (cIdx > 0) {
                    bytes[] memory trimmed = new bytes[](cIdx);
                    for (uint256 j = 0; j < cIdx; j++) {
                        trimmed[j] = calls[j];
                    }
                    targets[i] = address(evc);
                    data[i] = abi.encodeWithSelector(IEVC.multicall.selector, trimmed);
                }
            } else if (ins.op == ProtocolTypes.LendingOp.GetBorrowBalance) {
                uint256 bal = (_getBorrowBalance(token, ins.user) * 1001) / 1000;
                produced[pIdx++] = ProtocolTypes.Output({token: token, amount: bal});
            } else if (ins.op == ProtocolTypes.LendingOp.GetSupplyBalance) {
                uint256 bal = (_getSupplyBalance(token, ins.user) * 1001) / 1000;
                produced[pIdx++] = ProtocolTypes.Output({token: token, amount: bal});
            } else if (ins.op == ProtocolTypes.LendingOp.Repay) {
                produced[pIdx++] = ProtocolTypes.Output({token: token, amount: 0});
            }
        }
    }

    function deauthorize(ProtocolTypes.LendingInstruction[] calldata instrs, address)
        external
        view
        returns (address[] memory targets, bytes[] memory data)
    {
        targets = new address[](instrs.length);
        data = new bytes[](instrs.length);
        for (uint256 i = 0; i < instrs.length; i++) {
            ProtocolTypes.LendingInstruction calldata ins = instrs[i];
            if (ins.op == ProtocolTypes.LendingOp.WithdrawCollateral) {
                IEulerVault vault = tokenToVault[ins.token];
                if (address(vault) != address(0)) {
                    targets[i] = address(vault);
                    data[i] = abi.encodeWithSelector(IERC20.approve.selector, address(this), 0);
                }
            } else if (ins.op == ProtocolTypes.LendingOp.Borrow) {
                IEulerVault vaultBorrow = tokenToVault[ins.token];
                if (address(vaultBorrow) != address(0)) {
                    bytes[] memory calls = new bytes[](1);
                    calls[0] = abi.encodeWithSelector(IEVC.setOperator.selector, address(this), false);
                    targets[i] = address(evc);
                    data[i] = abi.encodeWithSelector(IEVC.multicall.selector, calls);
                }
            }
        }
    }

    function _exists(address[] memory list, uint256 len, address target) internal pure returns (bool) {
        for (uint256 i = 0; i < len; i++) {
            if (list[i] == target) return true;
        }
        return false;
    }

    function _getUnderlying(IEulerVault vault) internal view returns (address token) {
        try vault.underlyingAsset() returns (address t) {
            return t;
        } catch {}
        try vault.asset() returns (address t) {
            return t;
        } catch {}
        return address(0);
    }

    function _maxWithdrawAssets(IEulerVault vault, address user) internal view returns (uint256) {
        try vault.maxWithdraw(user) returns (uint256 m) {
            return m;
        } catch {}
        uint256 shares = vault.balanceOf(user);
        if (shares == 0) return 0;
        try vault.convertToAssets(shares) returns (uint256 assets) {
            return assets;
        } catch {
            uint256 supply = vault.totalSupply();
            uint256 totalAssets_ = vault.totalAssets();
            if (supply == 0) return 0;
            return (shares * totalAssets_) / supply;
        }
    }

    function _previewWithdrawShares(IEulerVault vault, address user, uint256 amount) internal view returns (uint256) {
        if (address(vault) == address(0)) return 0;
        if (amount == type(uint256).max) {
            return vault.balanceOf(user);
        }
        try vault.convertToShares(amount) returns (uint256 shares) {
            return shares;
        } catch {
            uint256 supply = vault.totalSupply();
            uint256 assets = vault.totalAssets();
            if (assets == 0) return 0;
            return (amount * supply) / assets;
        }
    }

    function _getBorrowBalance(address token, address user) internal view returns (uint256) {
        IEulerVault vault = tokenToVault[token];
        if (address(vault) == address(0)) return 0;
        try vault.debtOf(user) returns (uint256 bal) {
            return bal;
        } catch {
            return 0;
        }
    }

    function _getSupplyBalance(address token, address user) internal view returns (uint256) {
        IEulerVault vault = tokenToVault[token];
        if (address(vault) == address(0)) return 0;
        uint256 shares = vault.balanceOf(user);
        if (shares == 0) return 0;
        try vault.convertToAssets(shares) returns (uint256 assets) {
            return assets;
        } catch {
            uint256 supply = vault.totalSupply();
            uint256 assets = vault.totalAssets();
            if (supply == 0) return 0;
            return (shares * assets) / supply;
        }
    }
}
