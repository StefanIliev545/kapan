// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { TBytes } from "./libraries/TBytes.sol";
import { IGateway } from "./interfaces/IGateway.sol";
import { ProtocolTypes } from "./interfaces/ProtocolTypes.sol";
import { FlashLoanConsumerBase } from "./flashloans/FlashLoanConsumerBase.sol";

// Custom errors
error GatewayAlreadyExists();
error GatewayNotFound();
error NotAuthorized();
error BadIndex();
error ZeroToken();
error ZeroAmount();
error NoValue();
error FractionTooLarge();
error TokenMismatch();
error Underflow();
error FlashLoanRequiresTransientStack();
error UnsupportedFlashLoanProvider();
error UniswapV3RequiresPoolAddress();
error AavePoolNotRegistered();
error ZeroLendPoolNotRegistered();

contract KapanRouter is Ownable, ReentrancyGuard, FlashLoanConsumerBase {
    using SafeERC20 for IERC20;

    bytes32 constant INSTRUCTION_STACK = keccak256("KapanRouter:instructionStack");
    bytes32 constant OUTPUTS_SLOT = keccak256("KapanRouter:outputs");
    bytes32 constant ROUTER_KEY = keccak256(abi.encode("router"));
    mapping(string => IGateway) public gateways;

    constructor(address owner) Ownable(owner) {}

    function addGateway(string calldata protocolName, address gateway) external onlyOwner {
        if (address(gateways[protocolName]) == gateway) {
            return;
        }
        if (address(gateways[protocolName]) != address(0)) revert GatewayAlreadyExists();
        gateways[protocolName] = IGateway(gateway);
    }

    function setBalancerV2(address provider) external onlyOwner {
        _setBalancerV2(provider);
    }

    function setBalancerV3(address vault) external onlyOwner {
        _setBalancerV3(vault);
    }

    /// @notice Set the Aave V3 pool address.
    function setAavePool(address pool) external onlyOwner {
        _addAaveCompatiblePool("aave", pool);
    }

    /// @notice Set the ZeroLend pool address.
    function setZeroLendPool(address pool) external onlyOwner {
        _addAaveCompatiblePool("zerolend", pool);
    }

    function setUniswapV3Enabled(address factoryOrSentinel) external onlyOwner {
        _setUniswapV3Enabled(factoryOrSentinel);
    }

    enum RouterInstructionType {
        FlashLoan,
        PullToken,
        PushToken,
        ToOutput,
        Approve,
        Split,
        Add,
        Subtract
    }
    enum FlashLoanProvider {
        BalancerV2,
        BalancerV3,
        Aave,
        ZeroLend,
        UniswapV3
    }
    struct RouterInstruction {
        uint256 amount;
        address token;
        address user;
        RouterInstructionType instructionType;
    }

    function convertToStack(ProtocolTypes.ProtocolInstruction[] calldata instructions) internal {
        ProtocolTypes.ProtocolInstruction[] memory reversed = new ProtocolTypes.ProtocolInstruction[](
            instructions.length
        );

        // Iterate in reverse order to build the stack (top is last)
        for (uint256 i = 0; i < instructions.length; i++) {
            reversed[i] = instructions[instructions.length - 1 - i];
        }

        TBytes.set(INSTRUCTION_STACK, abi.encode(reversed));
    }

    function popStack() internal returns (ProtocolTypes.ProtocolInstruction memory instruction, bool isEmpty) {
        bytes memory raw = TBytes.get(INSTRUCTION_STACK);
        if (raw.length == 0) {
            return (instruction, true);
        }
        ProtocolTypes.ProtocolInstruction[] memory reversed = abi.decode(raw, (ProtocolTypes.ProtocolInstruction[]));
        uint256 len = reversed.length;
        if (len == 0) {
            return (instruction, true);
        }
        instruction = reversed[len - 1];
        assembly {
            mstore(reversed, sub(len, 1))
        }
        TBytes.set(INSTRUCTION_STACK, abi.encode(reversed));
        isEmpty = (len - 1 == 0);
    }

    function processProtocolInstructions(ProtocolTypes.ProtocolInstruction[] calldata instructions) external nonReentrant {
        verifyInstructionAuthorization(instructions);
        (bool hasFlash, uint256 flashIndex) = _findFlashInstruction(instructions);
        if (hasFlash) {
            _executeUntilFlash(instructions, flashIndex);
        } else {
            _executeAllInMemory(instructions);
        }
        deleteOutputs();
    }

    function deleteOutputs() internal {
        // Reset the output slot to empty
        TBytes.set(OUTPUTS_SLOT, bytes(""));
    }

    function _findFlashInstruction(
        ProtocolTypes.ProtocolInstruction[] calldata instructions
    ) internal pure returns (bool hasFlash, uint256 index) {
        for (uint256 i = 0; i < instructions.length; i++) {
            ProtocolTypes.ProtocolInstruction calldata instruction = instructions[i];
            if (keccak256(abi.encode(instruction.protocolName)) != ROUTER_KEY) {
                continue;
            }
            if (instruction.data.length == 0) {
                continue;
            }
            RouterInstruction memory routerInstruction = abi.decode(instruction.data, (RouterInstruction));
            if (routerInstruction.instructionType == RouterInstructionType.FlashLoan) {
                return (true, i);
            }
        }
    }

    function _executeAllInMemory(ProtocolTypes.ProtocolInstruction[] calldata instructions) internal {
        ProtocolTypes.Output[] memory outputs = new ProtocolTypes.Output[](0);
        for (uint256 i = 0; i < instructions.length; i++) {
            ProtocolTypes.ProtocolInstruction calldata instruction = instructions[i];
            if (keccak256(abi.encode(instruction.protocolName)) == ROUTER_KEY) {
                outputs = _processRouterInstructionInMemory(instruction, outputs);
            } else {
                outputs = _processGatewayInstructionInMemory(instruction, outputs);
            }
        }
    }

    function _executeUntilFlash(
        ProtocolTypes.ProtocolInstruction[] calldata instructions,
        uint256 flashIndex
    ) internal {
        ProtocolTypes.Output[] memory outputs = new ProtocolTypes.Output[](0);
        for (uint256 i = 0; i < flashIndex; i++) {
            ProtocolTypes.ProtocolInstruction calldata instruction = instructions[i];
            if (keccak256(abi.encode(instruction.protocolName)) == ROUTER_KEY) {
                outputs = _processRouterInstructionInMemory(instruction, outputs);
            } else {
                outputs = _processGatewayInstructionInMemory(instruction, outputs);
            }
        }

        uint256 remaining = instructions.length - flashIndex - 1;
        ProtocolTypes.ProtocolInstruction[] memory reversed = new ProtocolTypes.ProtocolInstruction[](remaining);
        for (uint256 i = 0; i < remaining; i++) {
            reversed[i] = instructions[instructions.length - 1 - i];
        }
        TBytes.set(INSTRUCTION_STACK, abi.encode(reversed));
        TBytes.set(OUTPUTS_SLOT, abi.encode(outputs));

        (, FlashLoanProvider provider, ProtocolTypes.InputPtr memory inputPtr, address pool) = abi.decode(
            instructions[flashIndex].data,
            (RouterInstruction, FlashLoanProvider, ProtocolTypes.InputPtr, address)
        );

        processFlashLoan(provider, inputPtr, pool);
    }

    function verifyInstructionAuthorization(ProtocolTypes.ProtocolInstruction[] calldata instructions) internal view {
        for (uint256 i = 0; i < instructions.length; i++) {
            ProtocolTypes.ProtocolInstruction calldata instruction = instructions[i];
            // Skip router instructions (they have their own authorization)
            if (keccak256(abi.encode(instruction.protocolName)) != ROUTER_KEY) {
                ProtocolTypes.LendingInstruction memory lendingInstr = abi.decode(
                    instruction.data,
                    (ProtocolTypes.LendingInstruction)
                );
                if (
                    lendingInstr.op == ProtocolTypes.LendingOp.Borrow ||
                    lendingInstr.op == ProtocolTypes.LendingOp.WithdrawCollateral
                ) {
                    if (lendingInstr.user != msg.sender) revert NotAuthorized();
                }
            }
        }
    }

    function runStack() internal {
        (ProtocolTypes.ProtocolInstruction memory instruction, bool isEmpty) = popStack();
        if (bytes(instruction.protocolName).length == 0) {
            return;
        }
        while (true) {
            if (keccak256(abi.encode(instruction.protocolName)) == ROUTER_KEY) {
                bool halt = processRouterInstruction(instruction);
                if (halt) {
                    return;
                }
            } else {
                IGateway gw = gateways[instruction.protocolName];
                if (address(gw) == address(0)) revert GatewayNotFound();
                ProtocolTypes.Output[] memory inputs = _getOutputs();
                ProtocolTypes.Output[] memory produced = gw.processLendingInstruction(inputs, instruction.data);
                if (produced.length > 0) {
                    _appendOutputs(produced);
                }
            }

            if (isEmpty) {
                break;
            }
            (instruction, isEmpty) = popStack();
        }
    }

    function _processRouterInstructionInMemory(
        ProtocolTypes.ProtocolInstruction calldata instruction,
        ProtocolTypes.Output[] memory outputs
    ) internal returns (ProtocolTypes.Output[] memory) {
        RouterInstruction memory routerInstruction = abi.decode(instruction.data, (RouterInstruction));

        if (routerInstruction.instructionType == RouterInstructionType.FlashLoan) {
            revert FlashLoanRequiresTransientStack();
        } else if (routerInstruction.instructionType == RouterInstructionType.PullToken) {
            if (routerInstruction.user != msg.sender) revert NotAuthorized();
            IERC20(routerInstruction.token).safeTransferFrom(msg.sender, address(this), routerInstruction.amount);
            outputs = _appendOutputMemory(outputs, ProtocolTypes.Output({ token: routerInstruction.token, amount: routerInstruction.amount }));
        } else if (routerInstruction.instructionType == RouterInstructionType.PushToken) {
            (, ProtocolTypes.InputPtr memory inputPtr) = abi.decode(
                instruction.data,
                (RouterInstruction, ProtocolTypes.InputPtr)
            );
            if (inputPtr.index >= outputs.length) revert BadIndex();
            ProtocolTypes.Output memory output = outputs[inputPtr.index];
            if (output.token == address(0)) revert ZeroToken();
            if (output.amount != 0) {
                IERC20(output.token).safeTransfer(routerInstruction.user, output.amount);
            }
            outputs[inputPtr.index] = ProtocolTypes.Output({ token: address(0), amount: 0 });
        } else if (routerInstruction.instructionType == RouterInstructionType.ToOutput) {
            outputs = _appendOutputMemory(outputs, ProtocolTypes.Output({ token: routerInstruction.token, amount: routerInstruction.amount }));
        } else if (routerInstruction.instructionType == RouterInstructionType.Approve) {
            (, string memory targetProtocol, ProtocolTypes.InputPtr memory inputPtr) = abi.decode(
                instruction.data,
                (RouterInstruction, string, ProtocolTypes.InputPtr)
            );
            if (inputPtr.index >= outputs.length) revert BadIndex();
            address target;
            if (keccak256(abi.encode(targetProtocol)) == ROUTER_KEY) {
                target = address(this);
            } else {
                target = address(gateways[targetProtocol]);
            }
            if (target == address(0)) revert GatewayNotFound();

            address tokenToApprove = outputs[inputPtr.index].token;
            uint256 amountToApprove = outputs[inputPtr.index].amount;

            IERC20(tokenToApprove).approve(target, 0);
            IERC20(tokenToApprove).approve(target, amountToApprove);

            outputs = _appendOutputMemory(outputs, ProtocolTypes.Output({ token: address(0), amount: 0 }));
        } else if (routerInstruction.instructionType == RouterInstructionType.Split) {
            (, ProtocolTypes.InputPtr memory inputPtr, uint256 bp) = abi.decode(
                instruction.data,
                (RouterInstruction, ProtocolTypes.InputPtr, uint256)
            );
            if (inputPtr.index >= outputs.length) revert BadIndex();
            ProtocolTypes.Output memory orig = outputs[inputPtr.index];
            if (orig.token == address(0) || orig.amount == 0) revert NoValue();
            if (bp > 10000) revert FractionTooLarge();

            uint256 feeAmount = (orig.amount * bp + 10000 - 1) / 10000;
            if (feeAmount > orig.amount) feeAmount = orig.amount;
            uint256 remainder = orig.amount - feeAmount;

            outputs[inputPtr.index] = ProtocolTypes.Output({ token: address(0), amount: 0 });
            outputs = _appendOutputMemory(outputs, ProtocolTypes.Output({ token: orig.token, amount: feeAmount }));
            outputs = _appendOutputMemory(outputs, ProtocolTypes.Output({ token: orig.token, amount: remainder }));
        } else if (routerInstruction.instructionType == RouterInstructionType.Add) {
            (, ProtocolTypes.InputPtr memory ptrA, ProtocolTypes.InputPtr memory ptrB) = abi.decode(
                instruction.data,
                (RouterInstruction, ProtocolTypes.InputPtr, ProtocolTypes.InputPtr)
            );
            if (ptrA.index >= outputs.length || ptrB.index >= outputs.length) revert BadIndex();
            ProtocolTypes.Output memory outA = outputs[ptrA.index];
            ProtocolTypes.Output memory outB = outputs[ptrB.index];
            if (outA.token == address(0) || outB.token == address(0)) revert ZeroToken();
            if (outA.token != outB.token) revert TokenMismatch();
            uint256 total = outA.amount + outB.amount;
            outputs[ptrA.index] = ProtocolTypes.Output({ token: address(0), amount: 0 });
            outputs[ptrB.index] = ProtocolTypes.Output({ token: address(0), amount: 0 });
            outputs = _appendOutputMemory(outputs, ProtocolTypes.Output({ token: outA.token, amount: total }));
        } else if (routerInstruction.instructionType == RouterInstructionType.Subtract) {
            (, ProtocolTypes.InputPtr memory ptrA, ProtocolTypes.InputPtr memory ptrB) = abi.decode(
                instruction.data,
                (RouterInstruction, ProtocolTypes.InputPtr, ProtocolTypes.InputPtr)
            );
            if (ptrA.index >= outputs.length || ptrB.index >= outputs.length) revert BadIndex();
            ProtocolTypes.Output memory outA = outputs[ptrA.index];
            ProtocolTypes.Output memory outB = outputs[ptrB.index];
            if (outA.token == address(0) || outB.token == address(0)) revert ZeroToken();
            if (outA.token != outB.token) revert TokenMismatch();
            if (outA.amount < outB.amount) revert Underflow();
            uint256 diff = outA.amount - outB.amount;
            outputs[ptrA.index] = ProtocolTypes.Output({ token: address(0), amount: 0 });
            outputs[ptrB.index] = ProtocolTypes.Output({ token: address(0), amount: 0 });
            outputs = _appendOutputMemory(outputs, ProtocolTypes.Output({ token: outA.token, amount: diff }));
        }

        return outputs;
    }

    function _processGatewayInstructionInMemory(
        ProtocolTypes.ProtocolInstruction calldata instruction,
        ProtocolTypes.Output[] memory outputs
    ) internal returns (ProtocolTypes.Output[] memory) {
        IGateway gw = gateways[instruction.protocolName];
        if (address(gw) == address(0)) revert GatewayNotFound();
        ProtocolTypes.Output[] memory produced = gw.processLendingInstruction(outputs, instruction.data);
        if (produced.length > 0) {
            outputs = _concatOutputsMemory(outputs, produced);
        }
        return outputs;
    }

    function processRouterInstruction(
        ProtocolTypes.ProtocolInstruction memory instruction
    ) internal returns (bool halt) {
        RouterInstruction memory routerInstruction = abi.decode(instruction.data, (RouterInstruction));
        if (routerInstruction.instructionType == RouterInstructionType.FlashLoan) {
            // instruction.data encodes: (RouterInstruction, FlashLoanProvider, InputPtr, address pool)
            // pool is only used for UniswapV3 (the actual pool address)
            (, FlashLoanProvider provider, ProtocolTypes.InputPtr memory inputPtr, address pool) = abi.decode(
                instruction.data,
                (RouterInstruction, FlashLoanProvider, ProtocolTypes.InputPtr, address)
            );
            processFlashLoan(provider, inputPtr, pool);
            return true; // halt to wait for callback
        } else if (routerInstruction.instructionType == RouterInstructionType.PullToken) {
            processPullToken(routerInstruction);
        } else if (routerInstruction.instructionType == RouterInstructionType.PushToken) {
            processPushToken(instruction);
        } else if (routerInstruction.instructionType == RouterInstructionType.ToOutput) {
            ProtocolTypes.Output[] memory out = new ProtocolTypes.Output[](1);
            out[0] = ProtocolTypes.Output({ token: routerInstruction.token, amount: routerInstruction.amount });
            _appendOutputs(out);
        } else if (routerInstruction.instructionType == RouterInstructionType.Approve) {
            // instruction.data encodes: (RouterInstruction, string targetProtocol, InputPtr input)
            (, string memory targetProtocol, ProtocolTypes.InputPtr memory inputPtr) = abi.decode(
                instruction.data,
                (RouterInstruction, string, ProtocolTypes.InputPtr)
            );
            ProtocolTypes.Output[] memory inputs = _getOutputs();
            if (inputPtr.index >= inputs.length) revert BadIndex();
            address target;
            if (keccak256(abi.encode(targetProtocol)) == ROUTER_KEY) {
                target = address(this);
            } else {
                target = address(gateways[targetProtocol]);
            }
            if (target == address(0)) revert GatewayNotFound();

            address tokenToApprove = inputs[inputPtr.index].token;
            uint256 amountToApprove = inputs[inputPtr.index].amount;

            IERC20(tokenToApprove).approve(target, 0);
            IERC20(tokenToApprove).approve(target, amountToApprove);
            // Always produce an output (even if empty) to ensure consistent indexing
            ProtocolTypes.Output[] memory out = new ProtocolTypes.Output[](1);
            out[0] = ProtocolTypes.Output({ token: address(0), amount: 0 });
            _appendOutputs(out);
        } else if (routerInstruction.instructionType == RouterInstructionType.Split) {
            // Decode extra params: input pointer and basisPoints (e.g. 30 = 0.3%)
            (, ProtocolTypes.InputPtr memory inputPtr, uint256 bp) = abi.decode(
                instruction.data,
                (RouterInstruction, ProtocolTypes.InputPtr, uint256)
            );
            ProtocolTypes.Output[] memory inputs = _getOutputs();
            if (inputPtr.index >= inputs.length) revert BadIndex();
            ProtocolTypes.Output memory orig = inputs[inputPtr.index];
            if (orig.token == address(0) || orig.amount == 0) revert NoValue();
            if (bp > 10000) revert FractionTooLarge();
            // Calculate fee = (orig.amount * bp) / 10000 (round up to ensure coverage)
            uint256 feeAmount = (orig.amount * bp + 10000 - 1) / 10000;
            if (feeAmount > orig.amount) feeAmount = orig.amount; // cap at 100%
            uint256 remainder = orig.amount - feeAmount;
            // Produce two outputs: fee portion and remainder portion
            ProtocolTypes.Output[] memory out = new ProtocolTypes.Output[](2);
            out[0] = ProtocolTypes.Output({ token: orig.token, amount: feeAmount });
            out[1] = ProtocolTypes.Output({ token: orig.token, amount: remainder });
            // Consume the original output by clearing it
            inputs[inputPtr.index] = ProtocolTypes.Output({ token: address(0), amount: 0 });
            TBytes.set(OUTPUTS_SLOT, abi.encode(inputs));
            _appendOutputs(out);
        } else if (routerInstruction.instructionType == RouterInstructionType.Add) {
            // Decode extra params: two input pointers
            (, ProtocolTypes.InputPtr memory ptrA, ProtocolTypes.InputPtr memory ptrB) = abi.decode(
                instruction.data,
                (RouterInstruction, ProtocolTypes.InputPtr, ProtocolTypes.InputPtr)
            );
            ProtocolTypes.Output[] memory inputs = _getOutputs();
            if (ptrA.index >= inputs.length || ptrB.index >= inputs.length) revert BadIndex();
            ProtocolTypes.Output memory outA = inputs[ptrA.index];
            ProtocolTypes.Output memory outB = inputs[ptrB.index];
            if (outA.token == address(0) || outB.token == address(0)) revert ZeroToken();
            if (outA.token != outB.token) revert TokenMismatch();
            uint256 total = outA.amount + outB.amount;
            ProtocolTypes.Output[] memory out = new ProtocolTypes.Output[](1);
            out[0] = ProtocolTypes.Output({ token: outA.token, amount: total });
            // Clear the original outputs
            inputs[ptrA.index] = ProtocolTypes.Output({ token: address(0), amount: 0 });
            inputs[ptrB.index] = ProtocolTypes.Output({ token: address(0), amount: 0 });
            TBytes.set(OUTPUTS_SLOT, abi.encode(inputs));
            _appendOutputs(out);
        } else if (routerInstruction.instructionType == RouterInstructionType.Subtract) {
            // Decode extra params: two input pointers (minuend - subtrahend)
            (, ProtocolTypes.InputPtr memory ptrA, ProtocolTypes.InputPtr memory ptrB) = abi.decode(
                instruction.data,
                (RouterInstruction, ProtocolTypes.InputPtr, ProtocolTypes.InputPtr)
            );
            ProtocolTypes.Output[] memory inputs = _getOutputs();
            if (ptrA.index >= inputs.length || ptrB.index >= inputs.length) revert BadIndex();
            ProtocolTypes.Output memory outA = inputs[ptrA.index];
            ProtocolTypes.Output memory outB = inputs[ptrB.index];
            if (outA.token == address(0) || outB.token == address(0)) revert ZeroToken();
            if (outA.token != outB.token) revert TokenMismatch();
            if (outA.amount < outB.amount) revert Underflow();
            uint256 diff = outA.amount - outB.amount;
            ProtocolTypes.Output[] memory out = new ProtocolTypes.Output[](1);
            out[0] = ProtocolTypes.Output({ token: outA.token, amount: diff });
            // Clear the original outputs
            inputs[ptrA.index] = ProtocolTypes.Output({ token: address(0), amount: 0 });
            inputs[ptrB.index] = ProtocolTypes.Output({ token: address(0), amount: 0 });
            TBytes.set(OUTPUTS_SLOT, abi.encode(inputs));
            _appendOutputs(out);
        }
        return false;
    }

    function processFlashLoan(
        FlashLoanProvider provider,
        ProtocolTypes.InputPtr memory inputPtr,
        address pool
    ) internal {
        // Read the amount and token from the output stack using InputPtr
        ProtocolTypes.Output[] memory inputs = _getOutputs();
        if (inputPtr.index >= inputs.length) revert BadIndex();
        ProtocolTypes.Output memory input = inputs[inputPtr.index];
        if (input.token == address(0)) revert ZeroToken();
        if (input.amount == 0) revert ZeroAmount();

        // Route to the appropriate provider - enum directly maps to the pool
        if (provider == FlashLoanProvider.BalancerV2) {
            _requestBalancerV2(input.token, input.amount, bytes(""));
        } else if (provider == FlashLoanProvider.BalancerV3) {
            _requestBalancerV3(input.token, input.amount);
        } else if (provider == FlashLoanProvider.Aave) {
            _requestAaveCompatible("aave", input.token, input.amount, bytes(""));
        } else if (provider == FlashLoanProvider.ZeroLend) {
            _requestAaveCompatible("zerolend", input.token, input.amount, bytes(""));
        } else if (provider == FlashLoanProvider.UniswapV3) {
            if (pool == address(0)) revert UniswapV3RequiresPoolAddress();
            _requestUniswapV3(pool, input.token, input.amount, bytes(""));
        } else {
            revert UnsupportedFlashLoanProvider();
        }
    }

    function processPullToken(RouterInstruction memory routerInstruction) internal authorize(routerInstruction) {
        IERC20(routerInstruction.token).safeTransferFrom(msg.sender, address(this), routerInstruction.amount);
        ProtocolTypes.Output[] memory out = new ProtocolTypes.Output[](1);
        out[0] = ProtocolTypes.Output({ token: routerInstruction.token, amount: routerInstruction.amount });
        _appendOutputs(out);
    }

    function processPushToken(ProtocolTypes.ProtocolInstruction memory instruction) internal {
        // instruction.data encodes: (RouterInstruction, ProtocolTypes.InputPtr input)
    (, ProtocolTypes.InputPtr memory inputPtr) = abi.decode(
            instruction.data,
            (RouterInstruction, ProtocolTypes.InputPtr)
        );
        ProtocolTypes.Output[] memory inputs = _getOutputs();
        if (inputPtr.index >= inputs.length) revert BadIndex();
        ProtocolTypes.Output memory output = inputs[inputPtr.index];
        if (output.token == address(0)) revert ZeroToken();
        // Extract user from RouterInstruction in data
        if (output.amount != 0) {
            RouterInstruction memory routerInstruction;
            (routerInstruction, ) = abi.decode(instruction.data, (RouterInstruction, ProtocolTypes.InputPtr));
            IERC20(output.token).safeTransfer(routerInstruction.user, output.amount);
        }
        // Consume the UTXO by clearing it (set to zero)
        inputs[inputPtr.index] = ProtocolTypes.Output({ token: address(0), amount: 0 });
        TBytes.set(OUTPUTS_SLOT, abi.encode(inputs));
    }

    modifier authorize(RouterInstruction memory routerInstruction) {
        if (routerInstruction.user != msg.sender) revert NotAuthorized();
        _;
    }

    function _afterFlashLoan(address token, uint256 repaymentAmount, bytes memory /*userData*/) internal override {
        // Create UTXO from flash loan with the repayment amount (principal + fee)
        // This ensures refinancing can borrow exactly what's needed to repay
        ProtocolTypes.Output[] memory out = new ProtocolTypes.Output[](1);
        out[0] = ProtocolTypes.Output({ token: token, amount: repaymentAmount });
        _appendOutputs(out);
        runStack();
    }

    // --------- Router-side authorize encoder ---------
    function authorizeRouter(
        RouterInstruction[] calldata instrs
    ) external view returns (address[] memory targets, bytes[] memory data) {
        uint256 count;
        for (uint256 i = 0; i < instrs.length; i++) {
            if (instrs[i].instructionType == RouterInstructionType.PullToken) count++;
        }
        targets = new address[](count);
        data = new bytes[](count);
        uint256 k;
        for (uint256 i = 0; i < instrs.length; i++) {
            RouterInstruction calldata r = instrs[i];
            if (r.instructionType == RouterInstructionType.PullToken) {
                targets[k] = r.token;
                data[k] = abi.encodeWithSelector(IERC20.approve.selector, address(this), r.amount);
                k++;
            }
        }
    }

    // --------- Aggregate authorization for ProtocolInstructions ---------
    function authorizeInstructions(
        ProtocolTypes.ProtocolInstruction[] calldata instructions,
        address caller
    ) external view returns (address[] memory targets, bytes[] memory data) {
        // Simulation state (outputs)
        ProtocolTypes.Output[] memory outputs = new ProtocolTypes.Output[](0);

        // Results - allocate extra space since gateways can return multiple auths per instruction
        // Each instruction could need: approval + enterMarkets + delegate approval = 3 max
        address[] memory tmpTargets = new address[](instructions.length * 3);
        bytes[] memory tmpData = new bytes[](instructions.length * 3);
        uint256 k;

        for (uint256 i = 0; i < instructions.length; i++) {
            ProtocolTypes.ProtocolInstruction calldata pi = instructions[i];

            // Router step
            if (keccak256(abi.encode(pi.protocolName)) == ROUTER_KEY) {
                RouterInstruction memory r = abi.decode(pi.data, (RouterInstruction));

                // Default no auth
                tmpTargets[k] = address(0);
                tmpData[k] = bytes("");

                if (r.instructionType == RouterInstructionType.PullToken) {
                    if (r.user == caller) {
                        uint256 current = IERC20(r.token).allowance(caller, address(this));
                        if (current < r.amount) {
                            tmpTargets[k] = r.token;
                            tmpData[k] = abi.encodeWithSelector(IERC20.approve.selector, address(this), r.amount);
                        }
                    }
                    outputs = _appendOutputMemory(outputs, ProtocolTypes.Output({ token: r.token, amount: r.amount }));
                } else if (r.instructionType == RouterInstructionType.PushToken) {
                    (, ProtocolTypes.InputPtr memory inputPtr) = abi.decode(
                        pi.data,
                        (RouterInstruction, ProtocolTypes.InputPtr)
                    );
                    if (inputPtr.index < outputs.length) {
                        outputs[inputPtr.index] = ProtocolTypes.Output({ token: address(0), amount: 0 });
                    }
                } else if (r.instructionType == RouterInstructionType.ToOutput) {
                    outputs = _appendOutputMemory(outputs, ProtocolTypes.Output({ token: r.token, amount: r.amount }));
                } else if (r.instructionType == RouterInstructionType.Approve) {
                    outputs = _appendOutputMemory(outputs, ProtocolTypes.Output({ token: address(0), amount: 0 }));
                } else if (r.instructionType == RouterInstructionType.FlashLoan) {
                    // Simulate flashloan output WITH BUFFER for fees
                    (, , ProtocolTypes.InputPtr memory inputPtr, ) = abi.decode(
                        pi.data,
                        (RouterInstruction, FlashLoanProvider, ProtocolTypes.InputPtr, address)
                    );
                    if (inputPtr.index < outputs.length) {
                        ProtocolTypes.Output memory loanOut = outputs[inputPtr.index];
                        // 0.1% Buffer for Flash Loan Fee simulation
                        // This ensures Repay instructions downstream request enough allowance
                        loanOut.amount = (loanOut.amount * 1001) / 1000;
                        outputs = _appendOutputMemory(outputs, loanOut);
                    } else {
                        outputs = _appendOutputMemory(outputs, ProtocolTypes.Output({ token: address(0), amount: 0 }));
                    }
                } else if (r.instructionType == RouterInstructionType.Split) {
                    // Simulate Split: takes one output and produces two (fee + remainder)
                    (, ProtocolTypes.InputPtr memory inputPtr, uint256 bp) = abi.decode(
                        pi.data,
                        (RouterInstruction, ProtocolTypes.InputPtr, uint256)
                    );
                    if (inputPtr.index < outputs.length) {
                        ProtocolTypes.Output memory orig = outputs[inputPtr.index];
                        uint256 feeAmount = (orig.amount * bp + 10000 - 1) / 10000;
                        if (feeAmount > orig.amount) feeAmount = orig.amount;
                        uint256 remainder = orig.amount - feeAmount;
                        // Clear the original
                        outputs[inputPtr.index] = ProtocolTypes.Output({ token: address(0), amount: 0 });
                        // Append fee and remainder
                        outputs = _appendOutputMemory(outputs, ProtocolTypes.Output({ token: orig.token, amount: feeAmount }));
                        outputs = _appendOutputMemory(outputs, ProtocolTypes.Output({ token: orig.token, amount: remainder }));
                    } else {
                        // Bad index, append two empty outputs for consistent indexing
                        outputs = _appendOutputMemory(outputs, ProtocolTypes.Output({ token: address(0), amount: 0 }));
                        outputs = _appendOutputMemory(outputs, ProtocolTypes.Output({ token: address(0), amount: 0 }));
                    }
                } else if (r.instructionType == RouterInstructionType.Add) {
                    // Simulate Add: takes two outputs and produces one (sum)
                    (, ProtocolTypes.InputPtr memory ptrA, ProtocolTypes.InputPtr memory ptrB) = abi.decode(
                        pi.data,
                        (RouterInstruction, ProtocolTypes.InputPtr, ProtocolTypes.InputPtr)
                    );
                    if (ptrA.index < outputs.length && ptrB.index < outputs.length) {
                        ProtocolTypes.Output memory outA = outputs[ptrA.index];
                        ProtocolTypes.Output memory outB = outputs[ptrB.index];
                        uint256 total = outA.amount + outB.amount;
                        // Clear the originals
                        outputs[ptrA.index] = ProtocolTypes.Output({ token: address(0), amount: 0 });
                        outputs[ptrB.index] = ProtocolTypes.Output({ token: address(0), amount: 0 });
                        // Append sum
                        outputs = _appendOutputMemory(outputs, ProtocolTypes.Output({ token: outA.token, amount: total }));
                    } else {
                        outputs = _appendOutputMemory(outputs, ProtocolTypes.Output({ token: address(0), amount: 0 }));
                    }
                } else if (r.instructionType == RouterInstructionType.Subtract) {
                    // Simulate Subtract: takes two outputs and produces one (difference)
                    (, ProtocolTypes.InputPtr memory ptrA, ProtocolTypes.InputPtr memory ptrB) = abi.decode(
                        pi.data,
                        (RouterInstruction, ProtocolTypes.InputPtr, ProtocolTypes.InputPtr)
                    );
                    if (ptrA.index < outputs.length && ptrB.index < outputs.length) {
                        ProtocolTypes.Output memory outA = outputs[ptrA.index];
                        ProtocolTypes.Output memory outB = outputs[ptrB.index];
                        uint256 diff = outA.amount >= outB.amount ? outA.amount - outB.amount : 0;
                        // Clear the originals
                        outputs[ptrA.index] = ProtocolTypes.Output({ token: address(0), amount: 0 });
                        outputs[ptrB.index] = ProtocolTypes.Output({ token: address(0), amount: 0 });
                        // Append difference
                        outputs = _appendOutputMemory(outputs, ProtocolTypes.Output({ token: outA.token, amount: diff }));
                    } else {
                        outputs = _appendOutputMemory(outputs, ProtocolTypes.Output({ token: address(0), amount: 0 }));
                    }
                }

                k++;
                continue;
            }

            // Protocol step
            IGateway gw = gateways[pi.protocolName];

            if (address(gw) == address(0)) {
                tmpTargets[k] = address(0);
                tmpData[k] = bytes("");
                k++;
                continue;
            }

            ProtocolTypes.LendingInstruction memory li = abi.decode(pi.data, (ProtocolTypes.LendingInstruction));

            ProtocolTypes.LendingInstruction[] memory one = new ProtocolTypes.LendingInstruction[](1);
            one[0] = li;

            // Call authorize with simulation inputs
            (address[] memory t, bytes[] memory d, ProtocolTypes.Output[] memory produced) = gw.authorize(
                one,
                caller,
                outputs
            );

            // Handle ALL authorization calls from the gateway (not just the first)
            for (uint256 j = 0; j < t.length; j++) {
                if (t[j] != address(0) && d[j].length > 0) {
                    tmpTargets[k] = t[j];
                    tmpData[k] = d[j];
                    k++;
                }
            }

            // Update simulation state
            if (produced.length > 0) {
                outputs = _concatOutputsMemory(outputs, produced);
            }
        }

        // Compact
        targets = new address[](k);
        data = new bytes[](k);
        for (uint256 i = 0; i < k; i++) {
            targets[i] = tmpTargets[i];
            data[i] = tmpData[i];
        }
    }

    function deauthorizeInstructions(
        ProtocolTypes.ProtocolInstruction[] calldata instructions,
        address caller
    ) external view returns (address[] memory targets, bytes[] memory data) {
        // We must track outputs even in deauth to resolve token addresses from indices
        ProtocolTypes.Output[] memory outputs = new ProtocolTypes.Output[](0);

        // Estimate max size (Gateways might return multiple revokes per instruction)
        address[] memory tmpTargets = new address[](instructions.length * 3);
        bytes[] memory tmpData = new bytes[](instructions.length * 3);
        uint256 k;

        for (uint256 i = 0; i < instructions.length; i++) {
            ProtocolTypes.ProtocolInstruction calldata pi = instructions[i];

            // --- ROUTER INSTRUCTIONS ---
            if (keccak256(abi.encode(pi.protocolName)) == ROUTER_KEY) {
                RouterInstruction memory r = abi.decode(pi.data, (RouterInstruction));

                if (r.instructionType == RouterInstructionType.PullToken) {
                    if (r.user == caller) {
                        // Revoke: Approve 0 to Router
                        tmpTargets[k] = r.token;
                        tmpData[k] = abi.encodeWithSelector(IERC20.approve.selector, address(this), 0);
                    } else {
                        tmpTargets[k] = address(0);
                        tmpData[k] = bytes("");
                    }
                    // Update state for downstream instructions
                    outputs = _appendOutputMemory(outputs, ProtocolTypes.Output({ token: r.token, amount: r.amount }));
                } else if (r.instructionType == RouterInstructionType.PushToken) {
                    (, ProtocolTypes.InputPtr memory inputPtr) = abi.decode(
                        pi.data,
                        (RouterInstruction, ProtocolTypes.InputPtr)
                    );
                    if (inputPtr.index < outputs.length)
                        outputs[inputPtr.index] = ProtocolTypes.Output({ token: address(0), amount: 0 });
                    tmpTargets[k] = address(0);
                    tmpData[k] = bytes("");
                } else if (r.instructionType == RouterInstructionType.ToOutput) {
                    outputs = _appendOutputMemory(outputs, ProtocolTypes.Output({ token: r.token, amount: r.amount }));
                    tmpTargets[k] = address(0);
                    tmpData[k] = bytes("");
                } else if (r.instructionType == RouterInstructionType.Approve) {
                    outputs = _appendOutputMemory(outputs, ProtocolTypes.Output({ token: address(0), amount: 0 }));
                    tmpTargets[k] = address(0);
                    tmpData[k] = bytes("");
                } else if (r.instructionType == RouterInstructionType.FlashLoan) {
                    // Simulate flashloan output for indexing consistency
                    (, , ProtocolTypes.InputPtr memory inputPtr, ) = abi.decode(
                        pi.data,
                        (RouterInstruction, FlashLoanProvider, ProtocolTypes.InputPtr, address)
                    );
                    if (inputPtr.index < outputs.length) {
                        outputs = _appendOutputMemory(outputs, outputs[inputPtr.index]);
                    } else {
                        outputs = _appendOutputMemory(outputs, ProtocolTypes.Output({ token: address(0), amount: 0 }));
                    }
                    tmpTargets[k] = address(0);
                    tmpData[k] = bytes("");
                } else if (r.instructionType == RouterInstructionType.Split) {
                    // Simulate Split output for indexing consistency (no revocation needed)
                    (, ProtocolTypes.InputPtr memory inputPtr, uint256 bp) = abi.decode(
                        pi.data,
                        (RouterInstruction, ProtocolTypes.InputPtr, uint256)
                    );
                    if (inputPtr.index < outputs.length) {
                        ProtocolTypes.Output memory orig = outputs[inputPtr.index];
                        uint256 feeAmount = (orig.amount * bp + 10000 - 1) / 10000;
                        if (feeAmount > orig.amount) feeAmount = orig.amount;
                        uint256 remainder = orig.amount - feeAmount;
                        outputs[inputPtr.index] = ProtocolTypes.Output({ token: address(0), amount: 0 });
                        outputs = _appendOutputMemory(outputs, ProtocolTypes.Output({ token: orig.token, amount: feeAmount }));
                        outputs = _appendOutputMemory(outputs, ProtocolTypes.Output({ token: orig.token, amount: remainder }));
                    } else {
                        outputs = _appendOutputMemory(outputs, ProtocolTypes.Output({ token: address(0), amount: 0 }));
                        outputs = _appendOutputMemory(outputs, ProtocolTypes.Output({ token: address(0), amount: 0 }));
                    }
                    tmpTargets[k] = address(0);
                    tmpData[k] = bytes("");
                } else if (r.instructionType == RouterInstructionType.Add) {
                    // Simulate Add output for indexing consistency (no revocation needed)
                    (, ProtocolTypes.InputPtr memory ptrA, ProtocolTypes.InputPtr memory ptrB) = abi.decode(
                        pi.data,
                        (RouterInstruction, ProtocolTypes.InputPtr, ProtocolTypes.InputPtr)
                    );
                    if (ptrA.index < outputs.length && ptrB.index < outputs.length) {
                        ProtocolTypes.Output memory outA = outputs[ptrA.index];
                        ProtocolTypes.Output memory outB = outputs[ptrB.index];
                        uint256 total = outA.amount + outB.amount;
                        outputs[ptrA.index] = ProtocolTypes.Output({ token: address(0), amount: 0 });
                        outputs[ptrB.index] = ProtocolTypes.Output({ token: address(0), amount: 0 });
                        outputs = _appendOutputMemory(outputs, ProtocolTypes.Output({ token: outA.token, amount: total }));
                    } else {
                        outputs = _appendOutputMemory(outputs, ProtocolTypes.Output({ token: address(0), amount: 0 }));
                    }
                    tmpTargets[k] = address(0);
                    tmpData[k] = bytes("");
                } else if (r.instructionType == RouterInstructionType.Subtract) {
                    // Simulate Subtract output for indexing consistency (no revocation needed)
                    (, ProtocolTypes.InputPtr memory ptrA, ProtocolTypes.InputPtr memory ptrB) = abi.decode(
                        pi.data,
                        (RouterInstruction, ProtocolTypes.InputPtr, ProtocolTypes.InputPtr)
                    );
                    if (ptrA.index < outputs.length && ptrB.index < outputs.length) {
                        ProtocolTypes.Output memory outA = outputs[ptrA.index];
                        ProtocolTypes.Output memory outB = outputs[ptrB.index];
                        uint256 diff = outA.amount >= outB.amount ? outA.amount - outB.amount : 0;
                        outputs[ptrA.index] = ProtocolTypes.Output({ token: address(0), amount: 0 });
                        outputs[ptrB.index] = ProtocolTypes.Output({ token: address(0), amount: 0 });
                        outputs = _appendOutputMemory(outputs, ProtocolTypes.Output({ token: outA.token, amount: diff }));
                    } else {
                        outputs = _appendOutputMemory(outputs, ProtocolTypes.Output({ token: address(0), amount: 0 }));
                    }
                    tmpTargets[k] = address(0);
                    tmpData[k] = bytes("");
                }
                k++;
                continue;
            }

            // --- GATEWAY INSTRUCTIONS ---
            IGateway gw = gateways[pi.protocolName];
            if (address(gw) == address(0)) {
                tmpTargets[k] = address(0);
                tmpData[k] = bytes("");
                k++;
                continue;
            }

            ProtocolTypes.LendingInstruction[] memory one = new ProtocolTypes.LendingInstruction[](1);
            one[0] = abi.decode(pi.data, (ProtocolTypes.LendingInstruction));

            // 1. Get Revocation Call(s)
            (address[] memory t, bytes[] memory d) = gw.deauthorize(one, caller, outputs);

            for (uint j = 0; j < t.length; j++) {
                if (t[j] != address(0)) {
                    tmpTargets[k] = t[j];
                    tmpData[k] = d[j];
                } else {
                    tmpTargets[k] = address(0);
                    tmpData[k] = bytes("");
                }
                k++;
            }

            // 2. Update Simulation State (using authorize view)
            // We ignore the targets returned here, we only want 'produced' outputs
            (, , ProtocolTypes.Output[] memory produced) = gw.authorize(one, caller, outputs);
            if (produced.length > 0) outputs = _concatOutputsMemory(outputs, produced);
        }

        // Compact results to remove empty slots
        uint256 actualCount = 0;
        for (uint i = 0; i < k; i++) {
            if (tmpTargets[i] != address(0)) actualCount++;
        }
        targets = new address[](actualCount);
        data = new bytes[](actualCount);
        uint256 idx = 0;
        for (uint i = 0; i < k; i++) {
            if (tmpTargets[i] != address(0)) {
                targets[idx] = tmpTargets[i];
                data[idx] = tmpData[i];
                idx++;
            }
        }
    }

    function _getOutputs() internal view returns (ProtocolTypes.Output[] memory out) {
        bytes memory raw = TBytes.get(OUTPUTS_SLOT);
        if (raw.length == 0) return new ProtocolTypes.Output[](0);
        return abi.decode(raw, (ProtocolTypes.Output[]));
    }

    function _appendOutputs(ProtocolTypes.Output[] memory produced) internal {
        ProtocolTypes.Output[] memory cur = _getOutputs();
        ProtocolTypes.Output[] memory merged = new ProtocolTypes.Output[](cur.length + produced.length);
        for (uint256 i = 0; i < cur.length; i++) {
            merged[i] = cur[i];
        }
        for (uint256 j = 0; j < produced.length; j++) {
            merged[cur.length + j] = produced[j];
        }
        TBytes.set(OUTPUTS_SLOT, abi.encode(merged));
    }

    function _appendOutputMemory(
        ProtocolTypes.Output[] memory current,
        ProtocolTypes.Output memory item
    ) internal pure returns (ProtocolTypes.Output[] memory) {
        ProtocolTypes.Output[] memory next = new ProtocolTypes.Output[](current.length + 1);
        for (uint i = 0; i < current.length; i++) next[i] = current[i];
        next[current.length] = item;
        return next;
    }

    function _concatOutputsMemory(
        ProtocolTypes.Output[] memory current,
        ProtocolTypes.Output[] memory items
    ) internal pure returns (ProtocolTypes.Output[] memory) {
        ProtocolTypes.Output[] memory next = new ProtocolTypes.Output[](current.length + items.length);
        for (uint i = 0; i < current.length; i++) next[i] = current[i];
        for (uint j = 0; j < items.length; j++) next[current.length + j] = items[j];
        return next;
    }
}
