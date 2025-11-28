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

import "hardhat/console.sol";

contract KapanRouter is Ownable, ReentrancyGuard, FlashLoanConsumerBase {
    using SafeERC20 for IERC20;

    bytes32 constant INSTRUCTION_STACK = keccak256("KapanRouter:instructionStack");
    bytes32 constant OUTPUTS_SLOT = keccak256("KapanRouter:outputs");
    mapping(string => IGateway) public gateways;

    constructor(address owner) Ownable(owner) {}

    function addGateway(string calldata protocolName, address gateway) external onlyOwner {
        if (address(gateways[protocolName]) == gateway) {
            return;
        }
        require(address(gateways[protocolName]) == address(0), "Gateway already exists");
        gateways[protocolName] = IGateway(gateway);
    }

    function setBalancerV2(address provider) external onlyOwner {
        _setBalancerV2(provider);
    }

    function setBalancerV3(address vault) external onlyOwner {
        _setBalancerV3(vault);
    }

    function setAaveV3(address pool) external onlyOwner {
        _setAaveV3(pool);
    }

    function setUniswapV3Enabled(address factoryOrSentinel) external onlyOwner {
        _setUniswapV3Enabled(factoryOrSentinel);
    }

    enum RouterInstructionType {
        FlashLoan,
        PullToken,
        PushToken,
        ToOutput,
        Approve
    }
    enum FlashLoanProvider {
        BalancerV2,
        BalancerV3,
        AaveV3,
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

    function processProtocolInstructions(ProtocolTypes.ProtocolInstruction[] calldata instructions) external {
        verifyInstructionAuthorization(instructions);
        convertToStack(instructions);
        runStack();
        deleteOutputs();
    }

    function deleteOutputs() internal {
        // Reset the output slot to empty
        TBytes.set(OUTPUTS_SLOT, bytes(""));
    }

    function verifyInstructionAuthorization(ProtocolTypes.ProtocolInstruction[] calldata instructions) internal view {
        for (uint256 i = 0; i < instructions.length; i++) {
            ProtocolTypes.ProtocolInstruction calldata instruction = instructions[i];
            // Skip router instructions (they have their own authorization)
            if (keccak256(abi.encode(instruction.protocolName)) != keccak256(abi.encode("router"))) {
                ProtocolTypes.LendingInstruction memory lendingInstr = abi.decode(
                    instruction.data,
                    (ProtocolTypes.LendingInstruction)
                );
                if (
                    lendingInstr.op == ProtocolTypes.LendingOp.Borrow ||
                    lendingInstr.op == ProtocolTypes.LendingOp.WithdrawCollateral
                ) {
                    require(lendingInstr.user == msg.sender, "Not authorized: sender must match user");
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
            console.log("KapanRouter: Processing %s", instruction.protocolName);
            if (keccak256(abi.encode(instruction.protocolName)) == keccak256(abi.encode("router"))) {
                bool halt = processRouterInstruction(instruction);
                if (halt) {
                    return;
                }
            } else {
                IGateway gw = gateways[instruction.protocolName];
                if (address(gw) == address(0)) {
                    revert("Gateway not found");
                }
                ProtocolTypes.Output[] memory inputs = _getOutputs();
                console.log("KapanRouter: Calling gateway %s", instruction.protocolName);
                ProtocolTypes.Output[] memory produced = gw.processLendingInstruction(inputs, instruction.data);
                console.log("KapanRouter: Gateway returned. Produced: %s", produced.length);
                if (produced.length > 0) {
                    _appendOutputs(produced);
                }
            }

            if (isEmpty) {
                console.log("KapanRouter: Stack empty, breaking");
                break;
            }
            (instruction, isEmpty) = popStack();
        }
    }

    function processRouterInstruction(
        ProtocolTypes.ProtocolInstruction memory instruction
    ) internal returns (bool halt) {
        RouterInstruction memory routerInstruction = abi.decode(instruction.data, (RouterInstruction));
        if (routerInstruction.instructionType == RouterInstructionType.FlashLoan) {
            // instruction.data encodes: (RouterInstruction, FlashLoanProvider, InputPtr, address pool)
            // pool is only used for UniswapV3, otherwise address(0)
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
            require(inputPtr.index < inputs.length, "Approve: bad index");
            address target;
            if (keccak256(abi.encode(targetProtocol)) == keccak256(abi.encode("router"))) {
                target = address(this);
            } else {
                target = address(gateways[targetProtocol]);
            }
            require(target != address(0), "Approve: target not found");

            address tokenToApprove = inputs[inputPtr.index].token;
            uint256 amountToApprove = inputs[inputPtr.index].amount;

            IERC20(tokenToApprove).approve(target, 0);
            IERC20(tokenToApprove).approve(target, amountToApprove);
            // Always produce an output (even if empty) to ensure consistent indexing
            ProtocolTypes.Output[] memory out = new ProtocolTypes.Output[](1);
            out[0] = ProtocolTypes.Output({ token: address(0), amount: 0 });
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
        require(inputPtr.index < inputs.length, "FlashLoan: bad index");
        ProtocolTypes.Output memory input = inputs[inputPtr.index];
        require(input.token != address(0), "FlashLoan: zero token");
        require(input.amount > 0, "FlashLoan: zero amount");

        // Route to the appropriate provider
        if (provider == FlashLoanProvider.BalancerV2) {
            _requestBalancerV2(input.token, input.amount, bytes(""));
        } else if (provider == FlashLoanProvider.BalancerV3) {
            _requestBalancerV3(input.token, input.amount);
        } else if (provider == FlashLoanProvider.AaveV3) {
            _requestAaveV3(input.token, input.amount, bytes(""));
        } else if (provider == FlashLoanProvider.UniswapV3) {
            require(pool != address(0), "FlashLoan: UniswapV3 requires pool address");
            _requestUniswapV3(pool, input.token, input.amount, bytes(""));
        } else {
            revert("FlashLoan: unsupported provider");
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
        require(inputPtr.index < inputs.length, "PushToken: bad index");
        ProtocolTypes.Output memory output = inputs[inputPtr.index];
        require(output.token != address(0), "PushToken: zero token");
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
        require(routerInstruction.user == msg.sender, "Not authorized");
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

        // Results
        address[] memory tmpTargets = new address[](instructions.length);
        bytes[] memory tmpData = new bytes[](instructions.length);
        uint256 k;

        for (uint256 i = 0; i < instructions.length; i++) {
            ProtocolTypes.ProtocolInstruction calldata pi = instructions[i];

            // Router step
            if (keccak256(abi.encode(pi.protocolName)) == keccak256(abi.encode("router"))) {
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

            if (t.length > 0 && t[0] != address(0) && d[0].length > 0) {
                tmpTargets[k] = t[0];
                tmpData[k] = d[0];
            } else {
                tmpTargets[k] = address(0);
                tmpData[k] = bytes("");
            }

            // Update simulation state
            if (produced.length > 0) {
                outputs = _concatOutputsMemory(outputs, produced);
            }

            k++;
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
            if (keccak256(abi.encode(pi.protocolName)) == keccak256(abi.encode("router"))) {
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
        console.log("KapanRouter: Appending outputs");
        ProtocolTypes.Output[] memory cur = _getOutputs();
        ProtocolTypes.Output[] memory merged = new ProtocolTypes.Output[](cur.length + produced.length);
        for (uint256 i = 0; i < cur.length; i++) {
            merged[i] = cur[i];
        }
        for (uint256 j = 0; j < produced.length; j++) {
            merged[cur.length + j] = produced[j];
        }
        TBytes.set(OUTPUTS_SLOT, abi.encode(merged));
        console.log("KapanRouter: Outputs appended. New size: %s", merged.length);
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
