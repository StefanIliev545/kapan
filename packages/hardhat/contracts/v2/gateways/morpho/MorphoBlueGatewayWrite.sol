// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { ProtocolGateway } from "../../../gateways/ProtocolGateway.sol";
import { IGateway } from "../../interfaces/IGateway.sol";
import { ProtocolTypes } from "../../interfaces/ProtocolTypes.sol";
import { IMorphoBlue, MarketParams, Market, Position, MorphoLib } from "../../interfaces/morpho/IMorphoBlue.sol";

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MorphoBlueGatewayWrite
 * @notice Gateway for Morpho Blue lending protocol
 * @dev Morpho Blue uses market-based lending where each market is identified by:
 *      - loanToken: The token being borrowed
 *      - collateralToken: The token used as collateral
 *      - oracle: Price oracle address
 *      - irm: Interest rate model address
 *      - lltv: Liquidation loan-to-value ratio
 *
 * Context encoding for LendingInstruction:
 *   - bytes context = abi.encode(MarketParams) for full market params
 *   - The token field should be the collateral token for collateral ops,
 *     or the loan token for borrow/repay ops
 */
contract MorphoBlueGatewayWrite is IGateway, ProtocolGateway, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using MorphoLib for MarketParams;

    /// @notice The Morpho Blue singleton contract
    IMorphoBlue public immutable morpho;

    /// @notice Registered markets by their ID
    mapping(bytes32 => MarketParams) public registeredMarkets;

    /// @notice List of registered market IDs for enumeration
    bytes32[] public marketIds;

    /// @notice Whether a market ID is registered
    mapping(bytes32 => bool) public isMarketRegistered;

    event MarketRegistered(bytes32 indexed marketId, address loanToken, address collateralToken);

    error MarketNotRegistered(bytes32 marketId);
    error InvalidMarketParams();
    error ZeroAddress();

    constructor(
        address router,
        address owner_,
        address morpho_
    ) ProtocolGateway(router) Ownable(owner_) {
        if (morpho_ == address(0)) revert ZeroAddress();
        morpho = IMorphoBlue(morpho_);
    }

    /// @notice Register a market for use with this gateway
    /// @param params The market parameters
    function registerMarket(MarketParams calldata params) external onlyOwner {
        if (params.loanToken == address(0) || params.collateralToken == address(0)) {
            revert InvalidMarketParams();
        }

        bytes32 marketId = params.id();

        if (!isMarketRegistered[marketId]) {
            registeredMarkets[marketId] = params;
            marketIds.push(marketId);
            isMarketRegistered[marketId] = true;
            emit MarketRegistered(marketId, params.loanToken, params.collateralToken);
        }
    }

    /// @notice Get all registered market IDs
    function getAllMarketIds() external view returns (bytes32[] memory) {
        return marketIds;
    }

    /// @notice Get market params by ID
    function getMarketParams(bytes32 marketId) external view returns (MarketParams memory) {
        if (!isMarketRegistered[marketId]) revert MarketNotRegistered(marketId);
        return registeredMarkets[marketId];
    }

    function processLendingInstruction(
        ProtocolTypes.Output[] calldata inputs,
        bytes calldata data
    ) external onlyRouter returns (ProtocolTypes.Output[] memory) {
        ProtocolTypes.LendingInstruction memory ins = abi.decode(data, (ProtocolTypes.LendingInstruction));
        MarketParams memory params = _decodeMarketParams(ins.context);

        // Resolve amount from input if referenced
        uint256 amount = ins.input.index < inputs.length ? inputs[ins.input.index].amount : ins.amount;

        return _dispatch(ins.op, params, amount, ins.user);
    }

    function _dispatch(
        ProtocolTypes.LendingOp op,
        MarketParams memory params,
        uint256 amount,
        address user
    ) internal returns (ProtocolTypes.Output[] memory) {
        // Deposit operations - no output
        if (op == ProtocolTypes.LendingOp.Deposit) {
            _supply(params, amount, user);
            return _noOutput();
        }
        if (op == ProtocolTypes.LendingOp.DepositCollateral) {
            _supplyCollateral(params, amount, user);
            return _noOutput();
        }

        // Collateral operations - output collateral token
        if (op == ProtocolTypes.LendingOp.WithdrawCollateral) {
            return _output(params.collateralToken, _withdrawCollateral(params, amount, user));
        }
        if (op == ProtocolTypes.LendingOp.GetSupplyBalance) {
            return _output(params.collateralToken, _getCollateralBalance(params, user));
        }

        // Loan operations - output loan token
        if (op == ProtocolTypes.LendingOp.Borrow) {
            return _output(params.loanToken, _borrow(params, amount, user));
        }
        if (op == ProtocolTypes.LendingOp.Repay) {
            return _output(params.loanToken, _repay(params, amount, user));
        }
        if (op == ProtocolTypes.LendingOp.GetBorrowBalance) {
            return _output(params.loanToken, _getBorrowBalance(params, user));
        }

        revert("MorphoBlue: unknown op");
    }

    function _noOutput() internal pure returns (ProtocolTypes.Output[] memory) {
        return new ProtocolTypes.Output[](0);
    }

    function _output(address token, uint256 amount) internal pure returns (ProtocolTypes.Output[] memory outputs) {
        outputs = new ProtocolTypes.Output[](1);
        outputs[0] = ProtocolTypes.Output({ token: token, amount: amount });
    }

    // ============ Internal Write Functions ============

    function _supply(MarketParams memory params, uint256 amount, address onBehalfOf) internal {
        IERC20(params.loanToken).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(params.loanToken).approve(address(morpho), 0);
        IERC20(params.loanToken).approve(address(morpho), amount);

        morpho.supply(params, amount, 0, onBehalfOf, "");
    }

    function _supplyCollateral(MarketParams memory params, uint256 amount, address onBehalfOf) internal {
        IERC20(params.collateralToken).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(params.collateralToken).approve(address(morpho), 0);
        IERC20(params.collateralToken).approve(address(morpho), amount);

        morpho.supplyCollateral(params, amount, onBehalfOf, "");
    }

    function _withdrawCollateral(
        MarketParams memory params,
        uint256 amount,
        address user
    ) internal returns (uint256) {
        bytes32 marketId = params.id();
        Position memory pos = morpho.position(marketId, user);

        // Clamp to available collateral
        if (amount > pos.collateral) {
            amount = pos.collateral;
        }

        // Withdraw to router (msg.sender)
        morpho.withdrawCollateral(params, amount, user, msg.sender);

        return amount;
    }

    function _borrow(MarketParams memory params, uint256 amount, address user) internal returns (uint256) {
        // Borrow to this contract, then forward to router
        (uint256 borrowed, ) = morpho.borrow(params, amount, 0, user, address(this));
        IERC20(params.loanToken).safeTransfer(msg.sender, borrowed);
        return borrowed;
    }

    function _repay(MarketParams memory params, uint256 amount, address user) internal returns (uint256 refund) {
        IERC20 loanToken = IERC20(params.loanToken);
        uint256 pre = loanToken.balanceOf(address(this));

        loanToken.safeTransferFrom(msg.sender, address(this), amount);
        loanToken.approve(address(morpho), 0);
        loanToken.approve(address(morpho), amount);

        // Get user's actual debt to decide repay strategy
        bytes32 marketId = params.id();
        Position memory pos = morpho.position(marketId, user);
        
        uint256 repaid;
        if (pos.borrowShares > 0) {
            // Calculate current debt in assets
            Market memory mkt = morpho.market(marketId);
            uint256 debtAssets = mkt.totalBorrowShares > 0
                ? (uint256(pos.borrowShares) * uint256(mkt.totalBorrowAssets) + uint256(mkt.totalBorrowShares) - 1) / uint256(mkt.totalBorrowShares)
                : 0;

            if (amount >= debtAssets) {
                // Full repay: use shares to avoid overflow/rounding issues
                (repaid, ) = morpho.repay(params, 0, pos.borrowShares, user, "");
            } else {
                // Partial repay: use assets
                (repaid, ) = morpho.repay(params, amount, 0, user, "");
            }
        }

        uint256 post = loanToken.balanceOf(address(this));
        refund = post > pre ? post - pre : 0;

        if (refund > 0) {
            loanToken.safeTransfer(msg.sender, refund);
        }
    }

    // ============ View Functions ============

    function _getBorrowBalance(MarketParams memory params, address user) internal returns (uint256) {
        // IMPORTANT: Accrue interest first to get accurate debt including pending interest
        // Morpho Blue lazily accrues interest - position() returns stale values without this
        morpho.accrueInterest(params);

        return _getBorrowBalanceView(params, user);
    }

    /// @dev View version of _getBorrowBalance for use in authorize() - may be slightly stale
    function _getBorrowBalanceView(MarketParams memory params, address user) internal view returns (uint256) {
        bytes32 marketId = params.id();
        Position memory pos = morpho.position(marketId, user);

        if (pos.borrowShares == 0) return 0;

        // Convert shares to assets using market state
        // borrowAssets = borrowShares * totalBorrowAssets / totalBorrowShares
        // Round UP with extra buffer to ensure full debt repayment
        Market memory mkt = morpho.market(marketId);
        if (mkt.totalBorrowShares == 0) return 0;

        uint256 numerator = uint256(pos.borrowShares) * uint256(mkt.totalBorrowAssets);
        uint256 denominator = uint256(mkt.totalBorrowShares);
        // Round up: (a + b - 1) / b, then add 1 extra wei for double-rounding safety
        return ((numerator + denominator - 1) / denominator) + 1;
    }

    function _getCollateralBalance(MarketParams memory params, address user) internal view returns (uint256) {
        bytes32 marketId = params.id();
        Position memory pos = morpho.position(marketId, user);
        return pos.collateral;
    }

    // ============ Authorization ============

    function authorize(
        ProtocolTypes.LendingInstruction[] calldata instrs,
        address caller,
        ProtocolTypes.Output[] calldata inputs
    ) external view returns (address[] memory targets, bytes[] memory data, ProtocolTypes.Output[] memory produced) {
        targets = new address[](instrs.length);
        data = new bytes[](instrs.length);

        // Count outputs
        uint256 outCount = 0;
        for (uint256 i = 0; i < instrs.length; i++) {
            ProtocolTypes.LendingOp op = instrs[i].op;
            if (
                op == ProtocolTypes.LendingOp.WithdrawCollateral ||
                op == ProtocolTypes.LendingOp.Borrow ||
                op == ProtocolTypes.LendingOp.Repay ||
                op == ProtocolTypes.LendingOp.GetBorrowBalance ||
                op == ProtocolTypes.LendingOp.GetSupplyBalance
            ) {
                outCount++;
            }
        }
        produced = new ProtocolTypes.Output[](outCount);
        uint256 pIdx = 0;

        // Check if caller has authorized this gateway on Morpho
        bool isAuth = morpho.isAuthorized(caller, address(this));
        bool authEmitted = false; // Only emit setAuthorization once

        for (uint256 i = 0; i < instrs.length; i++) {
            ProtocolTypes.LendingInstruction calldata ins = instrs[i];
            MarketParams memory params = _decodeMarketParams(ins.context);

            address token = ins.token;
            uint256 amount = ins.amount;
            if (ins.input.index < inputs.length) {
                token = inputs[ins.input.index].token;
                amount = inputs[ins.input.index].amount;
            }

            if (ins.op == ProtocolTypes.LendingOp.WithdrawCollateral) {
                produced[pIdx] = ProtocolTypes.Output({ token: params.collateralToken, amount: amount });
                pIdx++;

                if (isAuth || authEmitted) {
                    targets[i] = address(0);
                    data[i] = "";
                } else {
                    targets[i] = address(morpho);
                    data[i] = abi.encodeWithSelector(IMorphoBlue.setAuthorization.selector, address(this), true);
                    authEmitted = true;
                }
            } else if (ins.op == ProtocolTypes.LendingOp.Borrow) {
                produced[pIdx] = ProtocolTypes.Output({ token: params.loanToken, amount: amount });
                pIdx++;

                if (isAuth || authEmitted) {
                    targets[i] = address(0);
                    data[i] = "";
                } else {
                    targets[i] = address(morpho);
                    data[i] = abi.encodeWithSelector(IMorphoBlue.setAuthorization.selector, address(this), true);
                    authEmitted = true;
                }
            } else if (ins.op == ProtocolTypes.LendingOp.GetBorrowBalance) {
                uint256 bal = _getBorrowBalanceView(params, ins.user);
                bal = (bal * 1001) / 1000; // Buffer
                produced[pIdx] = ProtocolTypes.Output({ token: params.loanToken, amount: bal });
                pIdx++;
                targets[i] = address(0);
                data[i] = "";
            } else if (ins.op == ProtocolTypes.LendingOp.GetSupplyBalance) {
                uint256 bal = _getCollateralBalance(params, ins.user);
                bal = (bal * 1001) / 1000; // Buffer
                produced[pIdx] = ProtocolTypes.Output({ token: params.collateralToken, amount: bal });
                pIdx++;
                targets[i] = address(0);
                data[i] = "";
            } else if (ins.op == ProtocolTypes.LendingOp.Repay) {
                produced[pIdx] = ProtocolTypes.Output({ token: params.loanToken, amount: 0 });
                pIdx++;
                targets[i] = address(0);
                data[i] = "";
            } else {
                // Deposit / DepositCollateral - no auth needed, no output
                targets[i] = address(0);
                data[i] = "";
            }
        }
    }

    function deauthorize(
        ProtocolTypes.LendingInstruction[] calldata instrs,
        address /*caller*/,
        ProtocolTypes.Output[] calldata /*inputs*/
    ) external view override returns (address[] memory targets, bytes[] memory data) {
        targets = new address[](instrs.length);
        data = new bytes[](instrs.length);

        bool needsDeauth = false;
        for (uint256 i = 0; i < instrs.length; i++) {
            ProtocolTypes.LendingOp op = instrs[i].op;
            if (op == ProtocolTypes.LendingOp.WithdrawCollateral || op == ProtocolTypes.LendingOp.Borrow) {
                needsDeauth = true;
                break;
            }
        }

        for (uint256 i = 0; i < instrs.length; i++) {
            ProtocolTypes.LendingOp op = instrs[i].op;
            if (needsDeauth && (op == ProtocolTypes.LendingOp.WithdrawCollateral || op == ProtocolTypes.LendingOp.Borrow)) {
                // Only need to deauth once, put it on first sensitive op
                targets[i] = address(morpho);
                data[i] = abi.encodeWithSelector(IMorphoBlue.setAuthorization.selector, address(this), false);
                needsDeauth = false; // Only emit once
            } else {
                targets[i] = address(0);
                data[i] = "";
            }
        }
    }

    // ============ Helpers ============

    function _decodeMarketParams(bytes memory ctx) internal pure returns (MarketParams memory params) {
        if (ctx.length >= 160) {
            // Full MarketParams: 5 * 32 bytes = 160
            params = abi.decode(ctx, (MarketParams));
        } else {
            revert("MorphoBlue: invalid context - expected MarketParams");
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

