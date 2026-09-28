// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.30;

import { ProtocolGateway } from "../../../gateways/ProtocolGateway.sol";
import { IGateway } from "../../interfaces/IGateway.sol";
import { ProtocolTypes } from "../../interfaces/ProtocolTypes.sol";
import { IMidnight, Market, Offer } from "../../interfaces/midnight/IMidnight.sol";
import { MidnightTypes as T } from "./MidnightTypes.sol";
import { MidnightRiskLib } from "./MidnightRiskLib.sol";
import { TickLib } from "./vendor/TickLib.sol";
import { IdLib } from "./vendor/IdLib.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Midnight adapter for the existing lending instruction ABI and UTXO conventions.
/// Borrow requests exact net loan-token proceeds, NOT face debt. Repay uses face debt.
/// No taker callbacks or arbitrary calls: swaps remain in the existing router/aggregator flow.
contract MorphoMidnightGatewayWrite is IGateway, ProtocolGateway, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IMidnight public immutable midnight;
    mapping(address publisher => mapping(bytes32 key => bytes encodedTakes)) public executionPlans;

    error InvalidContext();
    error WrongToken();
    error UnsupportedOperation();
    error InvalidBounds();
    error InsufficientOffers();
    error RateLimit();
    error HealthLimit();
    error UnexpectedAmount();
    event ExecutionPlanUpdated(address indexed publisher, bytes32 indexed key, bytes32 planHash);
    event TradeExecuted(address indexed user, bytes32 indexed marketId, bool borrow, uint256 assets, uint256 units);

    constructor(address router, address midnight_) ProtocolGateway(router) {
        require(midnight_ != address(0), "midnight=0");
        midnight = IMidnight(midnight_);
    }

    /// @notice Publishers can replace only their own plans. Plans confer no user authorization.
    /// User-signed instruction bytes retain all market, price, size and deadline constraints.
    function setExecutionPlan(bytes32 key, T.Take[] calldata takes) external {
        if (takes.length > T.MAX_TAKES) revert InvalidContext();
        bytes memory encoded = abi.encode(takes);
        executionPlans[msg.sender][key] = encoded;
        emit ExecutionPlanUpdated(msg.sender, key, keccak256(encoded));
    }

    function processLendingInstruction(
        ProtocolTypes.Output[] calldata inputs,
        bytes calldata data
    ) external onlyRouter nonReentrant returns (ProtocolTypes.Output[] memory) {
        ProtocolTypes.LendingInstruction memory ins = abi.decode(data, (ProtocolTypes.LendingInstruction));
        (bytes32 id, uint256 index, bytes memory tradeData) = abi.decode(ins.context, (bytes32, uint256, bytes));
        Market memory market = _market(id);
        address token = _token(ins.op, market, index);
        if (ins.token != token) revert WrongToken();
        uint256 amount = ins.amount;
        if (ins.input.index < inputs.length) {
            if (inputs[ins.input.index].token != token) revert WrongToken();
            amount = inputs[ins.input.index].amount;
        }

        if (ins.op == ProtocolTypes.LendingOp.GetBorrowBalance) return _output(token, midnight.debt(id, ins.user));
        if (ins.op == ProtocolTypes.LendingOp.GetSupplyBalance)
            return _output(token, _balance(market, id, index, ins.user));
        if (ins.op == ProtocolTypes.LendingOp.WithdrawCollateral) {
            amount = Math.min(amount, _balance(market, id, index, ins.user));
            if (amount != 0) {
                if (index == T.CREDIT) midnight.withdraw(market, amount, ins.user, ROUTER);
                else midnight.withdrawCollateral(market, index, amount, ins.user, ROUTER);
            }
            return _output(token, amount);
        }
        if (ins.op == ProtocolTypes.LendingOp.Borrow) {
            if (amount == 0) return _output(token, 0);
            uint256 received = _trade(market, id, ins.user, amount, tradeData, true);
            IERC20(token).safeTransfer(ROUTER, received);
            return _output(token, received);
        }
        if (ins.op == ProtocolTypes.LendingOp.Repay) {
            uint256 repaid = Math.min(amount, midnight.debt(id, ins.user));
            // Pull the whole input so the refund output represents actual returned tokens.
            _pull(token, amount);
            if (repaid != 0) {
                IERC20(token).forceApprove(address(midnight), repaid);
                midnight.repay(market, repaid, ins.user, address(0), "");
                IERC20(token).forceApprove(address(midnight), 0);
            }
            uint256 refund = amount - repaid;
            if (refund != 0) IERC20(token).safeTransfer(ROUTER, refund);
            return _output(token, refund);
        }
        if (ins.op == ProtocolTypes.LendingOp.DepositCollateral) {
            _pull(token, amount);
            if (amount != 0) {
                IERC20(token).forceApprove(address(midnight), amount);
                midnight.supplyCollateral(market, index, amount, ins.user);
                IERC20(token).forceApprove(address(midnight), 0);
            }
            return new ProtocolTypes.Output[](0);
        }
        if (ins.op == ProtocolTypes.LendingOp.Deposit) {
            _pull(token, amount);
            IERC20(token).forceApprove(address(midnight), amount);
            uint256 spent = _trade(market, id, ins.user, amount, tradeData, false);
            IERC20(token).forceApprove(address(midnight), 0);
            // Deposit creates no UTXO; refund unused budget directly to the instruction owner.
            if (spent < amount) IERC20(token).safeTransfer(ins.user, amount - spent);
            return new ProtocolTypes.Output[](0);
        }
        revert UnsupportedOperation();
    }

    function _trade(
        Market memory market,
        bytes32 id,
        address user,
        uint256 target,
        bytes memory data,
        bool borrow
    ) internal returns (uint256 assets) {
        T.Trade memory bounds = abi.decode(data, (T.Trade));
        if (
            block.timestamp > bounds.deadline ||
            block.timestamp >= market.maturity ||
            bounds.maxUnits == 0 ||
            bounds.maxUnits > type(uint128).max ||
            bounds.priceLimit == 0 ||
            (!borrow && bounds.minUnits == 0)
        ) {
            revert InvalidBounds();
        }
        T.Take[] memory takes = bounds.takes;
        if (bounds.planProvider != address(0)) {
            if (takes.length != 0) revert InvalidContext();
            bytes memory plan = executionPlans[bounds.planProvider][bounds.planKey];
            if (plan.length == 0) revert InsufficientOffers();
            takes = abi.decode(plan, (T.Take[]));
        }
        if (takes.length == 0 || takes.length > T.MAX_TAKES) revert InsufficientOffers();
        uint256 units;
        for (uint256 i; i < takes.length && assets < target && units < bounds.maxUnits; ++i) {
            T.Take memory t = takes[i];
            if (IdLib.toId(t.offer.market) != id || t.offer.buy != borrow) revert InvalidContext();
            if (t.offer.maker == user || block.timestamp < t.offer.start || block.timestamp > t.offer.expiry) continue;
            uint256 price = TickLib.tickToPrice(t.offer.tick);
            uint256 fee = midnight.settlementFee(id, market.maturity - block.timestamp);
            if (borrow && fee >= price) continue;
            uint256 netPrice = borrow ? price - fee : price + fee;
            if ((borrow && netPrice < bounds.priceLimit) || (!borrow && netPrice > bounds.priceLimit)) continue;
            uint256 fill = borrow
                ? Math.mulDiv(target - assets, 1e18, netPrice, Math.Rounding.Ceil)
                : Math.mulDiv(target - assets, 1e18, netPrice);
            fill = Math.min(fill, Math.min(t.maxUnits, bounds.maxUnits - units));
            fill = Math.min(fill, _availableUnits(t.offer, price));
            if (fill == 0 || Math.mulDiv(fill, netPrice, 1e18) == 0) continue;
            // Expired signatures, changed funding and consumed offers can fail; try the next fallback.
            uint256 beforeBalance = IERC20(market.loanToken).balanceOf(address(this));
            try
                midnight.take(t.offer, t.ratifierData, fill, user, borrow ? address(this) : address(0), address(0), "")
            returns (uint256 buyerAssets, uint256 sellerAssets) {
                uint256 actual = borrow ? sellerAssets : buyerAssets;
                uint256 afterBalance = IERC20(market.loanToken).balanceOf(address(this));
                if (borrow ? afterBalance != beforeBalance + actual : beforeBalance != afterBalance + actual) {
                    revert UnexpectedAmount();
                }
                assets += actual;
                units += fill;
            } catch {}
        }
        if (borrow) {
            if (assets != target) revert InsufficientOffers();
            if (assets < Math.mulDiv(units, bounds.priceLimit, 1e18, Math.Rounding.Ceil)) revert RateLimit();
            if (bounds.maxApr != type(uint256).max) {
                uint256 termInterest = Math.mulDiv(bounds.maxApr, market.maturity - block.timestamp, 365 days);
                if (units > assets + Math.mulDiv(assets, termInterest, 1e18)) revert RateLimit();
            }
            (, uint256 capacity) = MidnightRiskLib.collateralValue(midnight, market, id, user);
            uint256 debt = midnight.debt(id, user);
            uint256 healthFloor = Math.max(bounds.minHealthFactor, 1e18);
            if (capacity < Math.mulDiv(debt, healthFloor, 1e18, Math.Rounding.Ceil)) revert HealthLimit();
        } else if (units < bounds.minUnits || assets > target) revert InsufficientOffers();
        emit TradeExecuted(user, id, borrow, assets, units);
    }

    function _availableUnits(Offer memory offer, uint256 price) internal view returns (uint256) {
        if ((offer.maxAssets == 0) == (offer.maxUnits == 0) || price == 0) return 0;
        uint256 used = midnight.consumed(offer.maker, offer.group);
        if (offer.maxUnits != 0) return used >= offer.maxUnits ? 0 : offer.maxUnits - used;
        if (used >= offer.maxAssets) return 0;
        uint256 remaining = offer.maxAssets - used;
        // Buy offers floor buyerAssets; sell offers ceil sellerAssets. Both caps use offer price.
        return
            offer.buy
                ? Math.mulDiv(remaining + 1, 1e18, price, Math.Rounding.Ceil) - 1
                : Math.mulDiv(remaining, 1e18, price);
    }

    function _pull(address token, uint256 amount) internal {
        if (amount == 0) return;
        uint256 beforeBalance = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(ROUTER, address(this), amount);
        if (IERC20(token).balanceOf(address(this)) != beforeBalance + amount) revert UnexpectedAmount();
    }

    function _market(bytes32 id) internal view returns (Market memory market) {
        market = midnight.toMarket(id);
        if (market.midnight != address(midnight) || market.chainId != block.chainid || IdLib.toId(market) != id) {
            revert InvalidContext();
        }
    }

    function _token(ProtocolTypes.LendingOp op, Market memory market, uint256 index) internal pure returns (address) {
        if (
            op == ProtocolTypes.LendingOp.Deposit ||
            op == ProtocolTypes.LendingOp.Borrow ||
            op == ProtocolTypes.LendingOp.Repay ||
            op == ProtocolTypes.LendingOp.GetBorrowBalance
        ) return market.loanToken;
        if (
            op == ProtocolTypes.LendingOp.DepositCollateral ||
            op == ProtocolTypes.LendingOp.WithdrawCollateral ||
            op == ProtocolTypes.LendingOp.GetSupplyBalance
        ) {
            if (index == T.CREDIT && op != ProtocolTypes.LendingOp.DepositCollateral) return market.loanToken;
            if (index >= market.collateralParams.length) revert InvalidContext();
            return market.collateralParams[index].token;
        }
        revert UnsupportedOperation();
    }

    function _balance(Market memory market, bytes32 id, uint256 index, address user) internal view returns (uint256) {
        if (index != T.CREDIT) return midnight.collateral(id, user, index);
        (uint128 credit, , ) = midnight.updatePositionView(market, id, user);
        return credit;
    }

    function _output(address token, uint256 amount) internal pure returns (ProtocolTypes.Output[] memory out) {
        out = new ProtocolTypes.Output[](1);
        out[0] = ProtocolTypes.Output(token, amount);
    }

    function authorize(
        ProtocolTypes.LendingInstruction[] calldata instrs,
        address caller,
        ProtocolTypes.Output[] calldata inputs
    ) external view returns (address[] memory targets, bytes[] memory data, ProtocolTypes.Output[] memory produced) {
        targets = new address[](instrs.length);
        data = new bytes[](instrs.length);
        produced = new ProtocolTypes.Output[](instrs.length);
        bool needsAuth = !midnight.isAuthorized(caller, address(this));
        uint256 count;
        for (uint256 i; i < instrs.length; ++i) {
            ProtocolTypes.LendingInstruction calldata ins = instrs[i];
            if (ins.user != caller) revert InvalidContext();
            (bytes32 id, uint256 index, ) = abi.decode(ins.context, (bytes32, uint256, bytes));
            Market memory market = _market(id);
            address token = _token(ins.op, market, index);
            if (ins.token != token) revert WrongToken();
            uint256 amount = ins.amount;
            if (ins.input.index < inputs.length) {
                if (inputs[ins.input.index].token != token) revert WrongToken();
                amount = inputs[ins.input.index].amount;
            }
            bool readOnly = ins.op == ProtocolTypes.LendingOp.GetBorrowBalance ||
                ins.op == ProtocolTypes.LendingOp.GetSupplyBalance;
            if (needsAuth && !readOnly) {
                targets[i] = address(midnight);
                data[i] = abi.encodeCall(IMidnight.setIsAuthorized, (address(this), true, caller));
                needsAuth = false;
            }
            if (ins.op == ProtocolTypes.LendingOp.GetBorrowBalance) amount = midnight.debt(id, caller);
            if (ins.op == ProtocolTypes.LendingOp.GetSupplyBalance) amount = _balance(market, id, index, caller);
            if (ins.op == ProtocolTypes.LendingOp.Repay) amount = 0;
            if (ins.op != ProtocolTypes.LendingOp.Deposit && ins.op != ProtocolTypes.LendingOp.DepositCollateral) {
                produced[count++] = ProtocolTypes.Output(token, amount);
            }
        }
        assembly ("memory-safe") {
            mstore(produced, count)
        }
    }

    function deauthorize(
        ProtocolTypes.LendingInstruction[] calldata instrs,
        address caller,
        ProtocolTypes.Output[] calldata
    ) external view returns (address[] memory targets, bytes[] memory data) {
        targets = new address[](instrs.length);
        data = new bytes[](instrs.length);
        for (uint256 i; i < instrs.length; ++i) {
            if (instrs[i].user != caller) revert InvalidContext();
            if (
                instrs[i].op != ProtocolTypes.LendingOp.GetBorrowBalance &&
                instrs[i].op != ProtocolTypes.LendingOp.GetSupplyBalance
            ) {
                targets[i] = address(midnight);
                data[i] = abi.encodeCall(IMidnight.setIsAuthorized, (address(this), false, caller));
                break;
            }
        }
    }
}
