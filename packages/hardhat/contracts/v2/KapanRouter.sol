// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TBytes} from "./libraries/TBytes.sol";
import {IGateway} from "./interfaces/IGateway.sol";
import {ProtocolTypes} from "./interfaces/ProtocolTypes.sol";
import {FlashLoanConsumerBase} from "./flashloans/FlashLoanConsumerBase.sol";


contract KapanRouter is Ownable, ReentrancyGuard, FlashLoanConsumerBase {
    using SafeERC20 for IERC20;

    bytes32 constant INSTRUCTION_STACK = keccak256("KapanRouter:instructionStack");
    bytes32 constant OUTPUTS_SLOT = keccak256("KapanRouter:outputs");
    bytes32 constant FLASHLOAN_DATA_SLOT = keccak256("KapanRouter:flashloanData");
    mapping(string => IGateway) public gateways;

    constructor(address owner) Ownable(owner) {
    }


    function addGateway(string calldata protocolName, address gateway) external onlyOwner {
        require(address(gateways[protocolName]) == address(0), "Gateway already exists");
        gateways[protocolName] = IGateway(gateway);
    }

    function setBalancerV2(address provider) external onlyOwner { _setBalancerV2(provider); }
    function setBalancerV3(address vault) external onlyOwner { _setBalancerV3(vault); }

    enum RouterInstructionType { FlashLoanV2, FlashLoanV3, PullToken, PushToken, ToOutput, Approve }
    struct RouterInstruction {
        uint256 amount;
        address token;
        address user;
        RouterInstructionType instructionType;
    }

    function convertToStack(ProtocolTypes.ProtocolInstruction[] calldata instructions) internal {
        ProtocolTypes.ProtocolInstruction[] memory reversed = new ProtocolTypes.ProtocolInstruction[](instructions.length);

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
        assembly { mstore(reversed, sub(len, 1)) }
        TBytes.set(INSTRUCTION_STACK, abi.encode(reversed));
        isEmpty = (len - 1 == 0);
    }

    function processProtocolInstructions(ProtocolTypes.ProtocolInstruction[] calldata instructions) external {
        convertToStack(instructions);
        runStack();
    }

    function runStack() internal {
        (ProtocolTypes.ProtocolInstruction memory instruction, bool isEmpty) = popStack();
        if (bytes(instruction.protocolName).length == 0) return;
        while (true) {
            if (keccak256(abi.encode(instruction.protocolName)) == keccak256(abi.encode("router"))) {
                bool halt = processRouterInstruction(instruction);
                if (halt) {
                    return;
                }
            } else {
                ProtocolTypes.Output[] memory inputs = _getOutputs();
                ProtocolTypes.Output[] memory produced = gateways[instruction.protocolName].processLendingInstruction(inputs, instruction.data);
                if (produced.length > 0) { _appendOutputs(produced); }
            }
            if (isEmpty) break;
            (instruction, isEmpty) = popStack();
        }
    }

    function processRouterInstruction(ProtocolTypes.ProtocolInstruction memory instruction) internal returns (bool halt) {
        RouterInstruction memory routerInstruction = abi.decode(instruction.data, (RouterInstruction));
        if (routerInstruction.instructionType == RouterInstructionType.FlashLoanV2) {
            processFlashLoanV2(routerInstruction);
            return true; // halt to wait for callback
        } else if (routerInstruction.instructionType == RouterInstructionType.FlashLoanV3) {
            processFlashLoanV3(routerInstruction);
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
            (, string memory targetProtocol, ProtocolTypes.InputPtr memory inputPtr) = abi.decode(instruction.data, (RouterInstruction, string, ProtocolTypes.InputPtr));
            ProtocolTypes.Output[] memory inputs = _getOutputs();
            require(inputPtr.index < inputs.length, "Approve: bad index");
            address target;
            if (keccak256(abi.encode(targetProtocol)) == keccak256(abi.encode("router"))) {
                target = address(this);
            } else {
                target = address(gateways[targetProtocol]);
            }
            require(target != address(0), "Approve: target not found");
            IERC20(inputs[inputPtr.index].token).approve(target, 0);
            IERC20(inputs[inputPtr.index].token).approve(target, inputs[inputPtr.index].amount);
            // Always produce an output (even if empty) to ensure consistent indexing
            ProtocolTypes.Output[] memory out = new ProtocolTypes.Output[](1);
            out[0] = ProtocolTypes.Output({ token: address(0), amount: 0 });
            _appendOutputs(out);
        }
        return false;
    }

    function processFlashLoanV2(RouterInstruction memory routerInstruction) internal {
        // Store flash loan details for callback to create UTXO
        TBytes.set(FLASHLOAN_DATA_SLOT, abi.encode(routerInstruction.token, routerInstruction.amount));
        _requestBalancerV2(routerInstruction.token, routerInstruction.amount, bytes(""));
    }

    function processFlashLoanV3(RouterInstruction memory routerInstruction) internal {
        // Store flash loan details for callback to create UTXO
        TBytes.set(FLASHLOAN_DATA_SLOT, abi.encode(routerInstruction.token, routerInstruction.amount));
        _requestBalancerV3(routerInstruction.token, routerInstruction.amount);
    }

    function processPullToken(RouterInstruction memory routerInstruction) internal authorize(routerInstruction) {
        IERC20(routerInstruction.token).safeTransferFrom(msg.sender, address(this), routerInstruction.amount);
        ProtocolTypes.Output[] memory out = new ProtocolTypes.Output[](1);
        out[0] = ProtocolTypes.Output({ token: routerInstruction.token, amount: routerInstruction.amount });
        _appendOutputs(out);
    }

    function processPushToken(ProtocolTypes.ProtocolInstruction memory instruction) internal {
        // instruction.data encodes: (RouterInstruction, ProtocolTypes.InputPtr input)
        (, ProtocolTypes.InputPtr memory inputPtr) = abi.decode(instruction.data, (RouterInstruction, ProtocolTypes.InputPtr));
        ProtocolTypes.Output[] memory inputs = _getOutputs();
        require(inputPtr.index < inputs.length, "PushToken: bad index");
        ProtocolTypes.Output memory output = inputs[inputPtr.index];
        require(output.token != address(0), "PushToken: zero token");
        require(output.amount > 0, "PushToken: zero amount");
        // Extract user from RouterInstruction in data
        RouterInstruction memory routerInstruction;
        (routerInstruction, ) = abi.decode(instruction.data, (RouterInstruction, ProtocolTypes.InputPtr));
        IERC20(output.token).safeTransfer(routerInstruction.user, output.amount);
        // Consume the UTXO by clearing it (set to zero)
        // Note: We don't remove it from the array to maintain index consistency
        inputs[inputPtr.index] = ProtocolTypes.Output({ token: address(0), amount: 0 });
        TBytes.set(OUTPUTS_SLOT, abi.encode(inputs));
    }

    modifier authorize(RouterInstruction memory routerInstruction) {
        require(routerInstruction.user == msg.sender, "Not authorized");
        _;
    }

    function _afterFlashLoan(bytes calldata /*userData*/) internal override {
        // Create UTXO from flash loan
        bytes memory flashData = TBytes.get(FLASHLOAN_DATA_SLOT);
        if (flashData.length > 0) {
            (address token, uint256 amount) = abi.decode(flashData, (address, uint256));
            ProtocolTypes.Output[] memory out = new ProtocolTypes.Output[](1);
            out[0] = ProtocolTypes.Output({ token: token, amount: amount });
            _appendOutputs(out);
            // Clear flash loan data
            TBytes.set(FLASHLOAN_DATA_SLOT, bytes(""));
        }
        runStack();
    }

    // --------- Router-side authorize encoder ---------
    // Returns user-side approval calls required for router instructions
    function authorizeRouter(RouterInstruction[] calldata instrs)
        external
        view
        returns (address[] memory targets, bytes[] memory data)
    {
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

    function _getOutputs() internal view returns (ProtocolTypes.Output[] memory out) {
        bytes memory raw = TBytes.get(OUTPUTS_SLOT);
        if (raw.length == 0) return new ProtocolTypes.Output[](0);
        return abi.decode(raw, (ProtocolTypes.Output[]));
    }

    function _appendOutputs(ProtocolTypes.Output[] memory produced) internal {
        ProtocolTypes.Output[] memory cur = _getOutputs();
        ProtocolTypes.Output[] memory merged = new ProtocolTypes.Output[](cur.length + produced.length);
        for (uint256 i = 0; i < cur.length; i++) { merged[i] = cur[i]; }
        for (uint256 j = 0; j < produced.length; j++) { merged[cur.length + j] = produced[j]; }
        TBytes.set(OUTPUTS_SLOT, abi.encode(merged));
    }
}