// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { ProtocolGateway } from "../../../gateways/ProtocolGateway.sol";
import { IGateway } from "../../interfaces/IGateway.sol";
import { ProtocolTypes } from "../../interfaces/ProtocolTypes.sol";
import { KyberAdapter } from "./KyberAdapter.sol";

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract KyberGateway is IGateway, ProtocolGateway, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    KyberAdapter public adapter;

    constructor(address router, address owner_) ProtocolGateway(router) Ownable(owner_) {}

    function setAdapter(address _adapter) external onlyOwner {
        adapter = KyberAdapter(_adapter);
    }

    function processLendingInstruction(
        ProtocolTypes.Output[] calldata inputs,
        bytes calldata data
    ) external onlyRouter override returns (ProtocolTypes.Output[] memory outputs) {
        ProtocolTypes.LendingInstruction memory ins = abi.decode(data, (ProtocolTypes.LendingInstruction));

        if (ins.op == ProtocolTypes.LendingOp.Swap) {
            address tokenIn = ins.token;
            uint256 amountIn = ins.amount;

            // Resolve input pointer if present
            if (ins.input.index < inputs.length) {
                tokenIn = inputs[ins.input.index].token;
                amountIn = inputs[ins.input.index].amount;
            }

            require(address(adapter) != address(0), "Kyber: Adapter not set");
            require(tokenIn != address(0), "Kyber: Zero token");
            require(amountIn > 0, "Kyber: Zero amount");

            // Decode swap payload from context
            // context should contain: (address tokenOut, uint256 minAmountOut, bytes memory swapData)
            (address tokenOut, uint256 minAmountOut, bytes memory swapData) = abi.decode(
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
                swapData
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
        } else if (ins.op == ProtocolTypes.LendingOp.SwapExactOut) {
            address tokenIn = ins.token;
            uint256 maxAmountIn = ins.amount;

            // Resolve input pointer if present
            if (ins.input.index < inputs.length) {
                tokenIn = inputs[ins.input.index].token;
                maxAmountIn = inputs[ins.input.index].amount;
            }

            require(address(adapter) != address(0), "Kyber: Adapter not set");
            require(tokenIn != address(0), "Kyber: Zero token");
            require(maxAmountIn > 0, "Kyber: Zero max amount");

            // Decode swap context: (address tokenOut, uint256 exactAmountOut, bytes memory swapData)
            (address tokenOut, uint256 amountOut, bytes memory swapData) = abi.decode(
                ins.context,
                (address, uint256, bytes)
            );

            // Transfer up to maxAmountIn of tokenIn from Router to the KyberAdapter
            IERC20(tokenIn).safeTransferFrom(msg.sender, address(adapter), maxAmountIn);

            // Execute the swap via the adapter
            (uint256 outputReceived, uint256 refundAmount) = adapter.executeSwap(
                tokenIn,
                tokenOut,
                maxAmountIn,
                amountOut, // minimum amountOut we expect
                swapData
            );

            // Prepare outputs: [TokenOut, TokenInRefund]
            outputs = new ProtocolTypes.Output[](2);
            outputs[0] = ProtocolTypes.Output({ token: tokenOut, amount: outputReceived });
            outputs[1] = ProtocolTypes.Output({ token: tokenIn, amount: refundAmount });

            // Transfer results back to the Router
            if (outputReceived > 0) {
                IERC20(tokenOut).safeTransfer(msg.sender, outputReceived);
            }
            if (refundAmount > 0) {
                IERC20(tokenIn).safeTransfer(msg.sender, refundAmount);
            }
        } else {
            revert("Kyber: Unsupported Op");
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

        // Count outputs (Swaps produce 2 outputs)
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

            if (ins.op == ProtocolTypes.LendingOp.Swap) {
                // No User approvals needed for KyberGateway (Router routes tokens)
                targets[i] = address(0);
                data[i] = bytes("");

                // Simulate output
                (address tokenOut, uint256 minAmountOut, ) = abi.decode(ins.context, (address, uint256, bytes));

                // Output 1: Token Out (Simulated as minAmountOut)
                produced[pIdx] = ProtocolTypes.Output({ token: tokenOut, amount: minAmountOut });
                pIdx++;

                // Output 2: Refund (Simulated as 0 for safety/conservatism in downstream checks)
                address tokenIn = ins.token;
                if (ins.input.index < inputs.length) {
                    tokenIn = inputs[ins.input.index].token;
                }
                produced[pIdx] = ProtocolTypes.Output({ token: tokenIn, amount: 0 });
                pIdx++;
            } else if (ins.op == ProtocolTypes.LendingOp.SwapExactOut) {
                targets[i] = address(0);
                data[i] = bytes("");

                (address tokenOut, uint256 exactOut, ) = abi.decode(ins.context, (address, uint256, bytes));
                // Output 1: the desired tokenOut, simulate the full exactOut amount as output
                produced[pIdx] = ProtocolTypes.Output({ token: tokenOut, amount: exactOut });
                pIdx++;

                // Output 2: refund of tokenIn (if any), conservatively assume 0
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
        // Swaps are atomic, no deauthorization needed
        targets = new address[](instrs.length);
        data = new bytes[](instrs.length);
        for (uint256 i = 0; i < instrs.length; i++) {
            targets[i] = address(0);
            data[i] = bytes("");
        }
    }
}
