// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { ProtocolGateway } from "../../../gateways/ProtocolGateway.sol";
import { IGateway } from "../../interfaces/IGateway.sol";
import { ProtocolTypes } from "../../interfaces/ProtocolTypes.sol";
import { PendleAdapter } from "./PendleAdapter.sol";

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract PendleGateway is IGateway, ProtocolGateway, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    PendleAdapter public adapter;

    constructor(address router, address owner_) ProtocolGateway(router) Ownable(owner_) {}

    function setAdapter(address _adapter) external onlyOwner {
        adapter = PendleAdapter(_adapter);
    }

    function processLendingInstruction(
        ProtocolTypes.Output[] calldata inputs,
        bytes calldata data
    ) external override returns (ProtocolTypes.Output[] memory outputs) {
        ProtocolTypes.LendingInstruction memory ins = abi.decode(data, (ProtocolTypes.LendingInstruction));

        // Both Swap and SwapExactOut use the same logic - Pendle's router handles both
        // The Pendle API provides appropriate calldata for each swap type
        if (ins.op == ProtocolTypes.LendingOp.Swap || ins.op == ProtocolTypes.LendingOp.SwapExactOut) {
            address tokenIn = ins.token;
            uint256 amountIn = ins.amount;

            // Resolve input pointer if present
            if (ins.input.index < inputs.length) {
                tokenIn = inputs[ins.input.index].token;
                amountIn = inputs[ins.input.index].amount;
            }

            require(address(adapter) != address(0), "Pendle: Adapter not set");
            require(tokenIn != address(0), "Pendle: Zero token");
            require(amountIn > 0, "Pendle: Zero amount");

            // Decode swap payload from context
            // context should contain: (address tokenOut, uint256 minAmountOut, bytes memory pendleData)
            (address tokenOut, uint256 minAmountOut, bytes memory pendleData) = abi.decode(
                ins.context,
                (address, uint256, bytes)
            );

            // Transfer tokens to adapter
            IERC20(tokenIn).safeTransferFrom(msg.sender, address(adapter), amountIn);

            // Execute swap
            (uint256 amountOut, uint256 amountRefund) = adapter.executeSwap(
                tokenIn,
                tokenOut,
                amountIn,
                minAmountOut,
                pendleData
            );

            // Return outputs: [TokenOut, TokenInRefund]
            outputs = new ProtocolTypes.Output[](2);
            outputs[0] = ProtocolTypes.Output({ token: tokenOut, amount: amountOut });
            outputs[1] = ProtocolTypes.Output({ token: tokenIn, amount: amountRefund });

            // Transfer tokens to Router (msg.sender) so it can handle PushToken/etc
            if (amountOut > 0) {
                IERC20(tokenOut).safeTransfer(msg.sender, amountOut);
            }
            if (amountRefund > 0) {
                IERC20(tokenIn).safeTransfer(msg.sender, amountRefund);
            }
        } else {
            revert("Pendle: Unsupported Op");
        }
    }

    function authorize(
        ProtocolTypes.LendingInstruction[] calldata instrs,
        address /*caller*/,
        ProtocolTypes.Output[] calldata inputs
    )
        external
        pure
        override
        returns (address[] memory targets, bytes[] memory data, ProtocolTypes.Output[] memory produced)
    {
        targets = new address[](instrs.length);
        data = new bytes[](instrs.length);

        uint256 outCount = 0;
        for (uint256 i = 0; i < instrs.length; i++) {
            if (instrs[i].op == ProtocolTypes.LendingOp.Swap || instrs[i].op == ProtocolTypes.LendingOp.SwapExactOut) {
                outCount += 2;
            }
        }
        produced = new ProtocolTypes.Output[](outCount);
        uint256 pIdx = 0;

        for (uint256 i = 0; i < instrs.length; i++) {
            ProtocolTypes.LendingInstruction calldata ins = instrs[i];

            if (ins.op == ProtocolTypes.LendingOp.Swap || ins.op == ProtocolTypes.LendingOp.SwapExactOut) {
                targets[i] = address(0);
                data[i] = bytes("");

                (address tokenOut, uint256 minAmountOut, ) = abi.decode(ins.context, (address, uint256, bytes));

                produced[pIdx] = ProtocolTypes.Output({ token: tokenOut, amount: minAmountOut });
                pIdx++;

                address tokenIn = ins.token;
                if (ins.input.index < inputs.length) {
                    tokenIn = inputs[ins.input.index].token;
                }
                produced[pIdx] = ProtocolTypes.Output({ token: tokenIn, amount: 0 });
                pIdx++;
            } else {
                targets[i] = address(0);
                data[i] = bytes("");
            }
        }
    }

    function deauthorize(
        ProtocolTypes.LendingInstruction[] calldata instrs,
        address /*caller*/,
        ProtocolTypes.Output[] calldata /*inputs*/
    ) external pure override returns (address[] memory targets, bytes[] memory data) {
        targets = new address[](instrs.length);
        data = new bytes[](instrs.length);
        for (uint256 i = 0; i < instrs.length; i++) {
            targets[i] = address(0);
            data[i] = bytes("");
        }
    }
}
