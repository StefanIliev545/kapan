// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ProtocolGateway} from "../../../gateways/ProtocolGateway.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IGateway} from "../../interfaces/IGateway.sol";
import {ProtocolTypes} from "../../interfaces/ProtocolTypes.sol";

interface IMorpho {
    struct MarketParams {
        address loanToken;
        address collateralToken;
        address oracle;
        address irm;
        uint256 lltv;
    }

    function idToMarketParams(bytes32 marketId) external view returns (MarketParams memory);
    
    // User operation functions
    function supply(MarketParams calldata marketParams, uint256 assets, uint256 shares, address onBehalf, bytes calldata data)
        external
        returns (uint256 assetsSupplied, uint256 sharesSupplied);
    
    function supplyCollateral(MarketParams calldata marketParams, uint256 assets, address onBehalf, bytes calldata data) external;
    
    function withdraw(MarketParams calldata marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver)
        external
        returns (uint256 assetsWithdrawn, uint256 sharesWithdrawn);
    
    function withdrawCollateral(MarketParams calldata marketParams, uint256 assets, address onBehalf, address receiver) external;
    
    function borrow(MarketParams calldata marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver)
        external
        returns (uint256 assetsBorrowed, uint256 sharesBorrowed);
    
    function repay(MarketParams calldata marketParams, uint256 assets, uint256 shares, address onBehalf, bytes calldata data)
        external
        returns (uint256 assetsRepaid, uint256 sharesRepaid);
    
    // View functions
    function supplyShares(bytes32 marketId, address user) external view returns (uint256);
    function borrowShares(bytes32 marketId, address user) external view returns (uint256);
    function collateral(bytes32 marketId, address user) external view returns (uint256);
    function totalSupplyAssets(bytes32 marketId) external view returns (uint256);
    function totalSupplyShares(bytes32 marketId) external view returns (uint256);
    function totalBorrowAssets(bytes32 marketId) external view returns (uint256);
    function totalBorrowShares(bytes32 marketId) external view returns (uint256);
}

/**
 * @title MorphoBlueWrite
 * @notice Write gateway for Morpho Blue protocol
 * @dev Handles all write operations: deposit, withdraw, borrow, repay
 * Context format: abi.encode(address morpho, bytes32 marketId)
 */
contract MorphoBlueWrite is IGateway, ProtocolGateway, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Custom errors
    error MorphoBlueWrite__InvalidContext();
    error MorphoBlueWrite__InvalidAsset();
    error MorphoBlueWrite__ZeroAmount();

    constructor(address router) ProtocolGateway(router) {}

    function processLendingInstruction(ProtocolTypes.Output[] calldata inputs, bytes calldata data)
        external
        returns (ProtocolTypes.Output[] memory outputs)
    {
        ProtocolTypes.LendingInstruction memory instr = abi.decode(data, (ProtocolTypes.LendingInstruction));
        
        // Decode context: expect context = abi.encode(address morpho, bytes32 marketId)
        if (instr.context.length != 64) {
            revert MorphoBlueWrite__InvalidContext();
        }
        (address morphoAddr, bytes32 marketId) = abi.decode(instr.context, (address, bytes32));
        IMorpho morpho = IMorpho(morphoAddr);
        
        // Get market parameters
        IMorpho.MarketParams memory marketParams = morpho.idToMarketParams(marketId);
        address loanToken = marketParams.loanToken;
        address collateralToken = marketParams.collateralToken;
        
        address token = instr.token;
        uint256 amount = instr.amount;
        if (instr.input.index < inputs.length) {
            token = inputs[instr.input.index].token;
            amount = inputs[instr.input.index].amount;
        }
        
        // Validate token belongs to this market
        bool isLoanAsset = (token == loanToken);
        bool isCollAsset = (token == collateralToken);
        if (!isLoanAsset && !isCollAsset) {
            revert MorphoBlueWrite__InvalidAsset();
        }
        
        if (instr.op == ProtocolTypes.LendingOp.Deposit || instr.op == ProtocolTypes.LendingOp.DepositCollateral) {
            if (isLoanAsset) {
                deposit(morpho, marketParams, token, instr.user, amount);
            } else {
                depositCollateral(morpho, marketParams, token, instr.user, amount);
            }
            outputs = new ProtocolTypes.Output[](0);
        } else if (instr.op == ProtocolTypes.LendingOp.WithdrawCollateral) {
            (address u, uint256 amt) = withdraw(morpho, marketParams, token, instr.user, amount, isLoanAsset);
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({ token: u, amount: amt });
        } else if (instr.op == ProtocolTypes.LendingOp.Borrow) {
            if (!isLoanAsset) {
                revert MorphoBlueWrite__InvalidAsset();
            }
            borrow(morpho, marketParams, token, instr.user, amount);
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({ token: token, amount: amount });
        } else if (instr.op == ProtocolTypes.LendingOp.Repay) {
            if (!isLoanAsset) {
                revert MorphoBlueWrite__InvalidAsset();
            }
            uint256 refund = repay(morpho, marketParams, token, instr.user, amount);
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({ token: token, amount: refund });
        } else if (instr.op == ProtocolTypes.LendingOp.GetBorrowBalance) {
            uint256 bal = _getBorrowBalance(morpho, marketId, token, instr.user);
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({ token: token, amount: bal });
        } else if (instr.op == ProtocolTypes.LendingOp.GetSupplyBalance) {
            uint256 bal = _getSupplyBalance(morpho, marketId, token, instr.user);
            outputs = new ProtocolTypes.Output[](1);
            outputs[0] = ProtocolTypes.Output({ token: token, amount: bal });
        } else {
            revert("Unknown op");
        }
    }

    function deposit(IMorpho morpho, IMorpho.MarketParams memory marketParams, address token, address onBehalfOf, uint256 amount) internal {
        if (amount == 0) {
            revert MorphoBlueWrite__ZeroAmount();
        }
        
        // Transfer tokens from router to this contract
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        
        // Ensure allowance
        _ensureAllowance(token, address(morpho), amount);
        
        // Supply loan token (lending)
        morpho.supply(marketParams, amount, 0, onBehalfOf, bytes(""));
    }

    function depositCollateral(IMorpho morpho, IMorpho.MarketParams memory marketParams, address token, address onBehalfOf, uint256 amount) internal {
        if (amount == 0) {
            revert MorphoBlueWrite__ZeroAmount();
        }
        
        // Transfer tokens from router to this contract
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        
        // Ensure allowance
        _ensureAllowance(token, address(morpho), amount);
        
        // Supply collateral
        morpho.supplyCollateral(marketParams, amount, onBehalfOf, bytes(""));
    }

    function withdraw(IMorpho morpho, IMorpho.MarketParams memory marketParams, address token, address user, uint256 amount, bool isLoanAsset) internal returns (address, uint256) {
        if (isLoanAsset) {
            // Withdrawing loan token (supplied liquidity)
            (uint256 assetsOut, ) = morpho.withdraw(marketParams, amount, 0, user, address(this));
            IERC20(token).safeTransfer(msg.sender, assetsOut);
            return (token, assetsOut);
        } else {
            // Withdrawing collateral token
            morpho.withdrawCollateral(marketParams, amount, user, address(this));
            IERC20(token).safeTransfer(msg.sender, amount);
            return (token, amount);
        }
    }

    function borrow(IMorpho morpho, IMorpho.MarketParams memory marketParams, address token, address user, uint256 amount) internal {
        if (amount == 0) {
            revert MorphoBlueWrite__ZeroAmount();
        }
        
        // Borrow loanToken to this contract
        (uint256 assetsBorrowed, ) = morpho.borrow(marketParams, amount, 0, user, address(this));
        
        // Transfer borrowed tokens to router
        IERC20(token).safeTransfer(msg.sender, assetsBorrowed);
    }

    function repay(IMorpho morpho, IMorpho.MarketParams memory marketParams, address token, address user, uint256 amount) internal returns (uint256 refund) {
        if (amount == 0) {
            revert MorphoBlueWrite__ZeroAmount();
        }
        
        // Transfer tokens from router to this contract
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        
        // Ensure allowance
        _ensureAllowance(token, address(morpho), amount);
        
        // Repay
        (uint256 repaidAssets, ) = morpho.repay(marketParams, amount, 0, user, bytes(""));
        
        // Calculate refund if any
        refund = amount > repaidAssets ? amount - repaidAssets : 0;
        if (refund > 0) {
            IERC20(token).safeTransfer(msg.sender, refund);
        }
    }

    function _ensureAllowance(address token, address spender, uint256 amount) internal {
        IERC20 assetToken = IERC20(token);
        uint256 currentAllowance = assetToken.allowance(address(this), spender);
        if (currentAllowance < amount) {
            if (currentAllowance > 0) {
                assetToken.approve(spender, 0);
            }
            assetToken.approve(spender, type(uint256).max);
        }
    }

    function authorize(ProtocolTypes.LendingInstruction[] calldata instrs, address /* caller */)
        external
        pure
        returns (address[] memory targets, bytes[] memory data)
    {
        targets = new address[](instrs.length);
        data = new bytes[](instrs.length);

        for (uint256 i = 0; i < instrs.length; i++) {
            // Morpho Blue doesn't require special approvals - standard ERC20 approvals are handled by router
            // All operations (deposit, withdraw, borrow, repay) work with standard token approvals
            targets[i] = address(0);
            data[i] = bytes("");
        }
    }

    function _getBorrowBalance(IMorpho morpho, bytes32 marketId, address /* token */, address user) internal view returns (uint256) {
        uint256 totalBorrowAssets = morpho.totalBorrowAssets(marketId);
        uint256 totalBorrowShares = morpho.totalBorrowShares(marketId);
        uint256 userBorrowShares = morpho.borrowShares(marketId, user);
        
        if (totalBorrowShares == 0) {
            return 0;
        }
        
        return (userBorrowShares * totalBorrowAssets) / totalBorrowShares;
    }

    function _getSupplyBalance(IMorpho morpho, bytes32 marketId, address /* token */, address user) internal view returns (uint256) {
        uint256 totalSupplyAssets = morpho.totalSupplyAssets(marketId);
        uint256 totalSupplyShares = morpho.totalSupplyShares(marketId);
        uint256 userSupplyShares = morpho.supplyShares(marketId, user);
        
        if (totalSupplyShares == 0) {
            return 0;
        }
        
        return (userSupplyShares * totalSupplyAssets) / totalSupplyShares;
    }
}

