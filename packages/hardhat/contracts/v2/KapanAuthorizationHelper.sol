// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ProtocolTypes } from "./interfaces/ProtocolTypes.sol";
import { IGateway } from "./interfaces/IGateway.sol";

/// @title KapanAuthorizationHelper
/// @notice Standalone contract to generate authorization/deauthorization calls for KapanRouter
/// @dev Separated from KapanRouter to stay under contract size limits
contract KapanAuthorizationHelper is Ownable {
    bytes32 constant ROUTER_KEY = keccak256(abi.encode("router"));
    
    error Unauthorized();

    // Router instruction types (must match KapanRouter)
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

    // Flash loan providers (must match KapanRouter)
    enum FlashLoanProvider {
        BalancerV2,
        BalancerV3,
        Aave,
        ZeroLend,
        UniswapV3,
        Morpho
    }

    struct RouterInstruction {
        uint256 amount;
        address token;
        address user;
        RouterInstructionType instructionType;
    }

    /// @dev Struct to hold authorization processing state
    struct AuthState {
        address[] tmpTargets;
        bytes[] tmpData;
        ProtocolTypes.Output[] outputs;
        uint256 k;
    }

    address public immutable router;
    mapping(string => IGateway) public gateways;

    constructor(address _router, address _owner) Ownable(_owner) {
        router = _router;
    }

    /// @notice Sync a gateway registration from the router
    /// @dev Only callable by owner or router
    function syncGateway(string calldata protocolName, address gateway) external {
        if (msg.sender != owner() && msg.sender != router) revert Unauthorized();
        gateways[protocolName] = IGateway(gateway);
    }

    /// @notice Generate authorization calls for a sequence of instructions
    function authorizeInstructions(
        ProtocolTypes.ProtocolInstruction[] calldata instructions,
        address caller
    ) external view returns (address[] memory targets, bytes[] memory data) {
        AuthState memory state;
        state.tmpTargets = new address[](instructions.length * 3);
        state.tmpData = new bytes[](instructions.length * 3);
        state.outputs = new ProtocolTypes.Output[](0);

        for (uint256 i = 0; i < instructions.length; i++) {
            state = _processAuthInstruction(instructions[i], caller, state, true);
        }

        return _compactAuthResults(state);
    }

    /// @notice Generate deauthorization calls for a sequence of instructions
    function deauthorizeInstructions(
        ProtocolTypes.ProtocolInstruction[] calldata instructions,
        address caller
    ) external view returns (address[] memory targets, bytes[] memory data) {
        AuthState memory state;
        state.tmpTargets = new address[](instructions.length * 3);
        state.tmpData = new bytes[](instructions.length * 3);
        state.outputs = new ProtocolTypes.Output[](0);

        for (uint256 i = 0; i < instructions.length; i++) {
            state = _processAuthInstruction(instructions[i], caller, state, false);
        }

        return _compactAuthResults(state);
    }

    function _processAuthInstruction(
        ProtocolTypes.ProtocolInstruction calldata pi,
        address caller,
        AuthState memory state,
        bool isAuth
    ) private view returns (AuthState memory) {
        if (keccak256(abi.encode(pi.protocolName)) == ROUTER_KEY) {
            return _processRouterAuth(pi, caller, state, isAuth);
        } else {
            return _processGatewayAuth(pi, caller, state, isAuth);
        }
    }

    function _processRouterAuth(
        ProtocolTypes.ProtocolInstruction calldata pi,
        address caller,
        AuthState memory state,
        bool isAuth
    ) private view returns (AuthState memory) {
        RouterInstruction memory r = abi.decode(pi.data, (RouterInstruction));
        
        if (r.instructionType == RouterInstructionType.PullToken) {
            if (isAuth) {
                (state.tmpTargets[state.k], state.tmpData[state.k]) = _getAuthForPullToken(pi.data, caller);
            } else {
                (state.tmpTargets[state.k], state.tmpData[state.k]) = _getDeauthForPullToken(pi.data, caller);
            }
        } else {
            state.tmpTargets[state.k] = address(0);
            state.tmpData[state.k] = bytes("");
        }
        state.k++;
        
        state.outputs = _simulateRouterInstruction(pi, state.outputs);
        return state;
    }

    function _processGatewayAuth(
        ProtocolTypes.ProtocolInstruction calldata pi,
        address caller,
        AuthState memory state,
        bool isAuth
    ) private view returns (AuthState memory) {
        IGateway gw = gateways[pi.protocolName];
        if (address(gw) == address(0)) {
            state.tmpTargets[state.k] = address(0);
            state.tmpData[state.k] = bytes("");
            state.k++;
            return state;
        }

        ProtocolTypes.LendingInstruction[] memory one = new ProtocolTypes.LendingInstruction[](1);
        one[0] = abi.decode(pi.data, (ProtocolTypes.LendingInstruction));

        if (isAuth) {
            state = _handleGatewayAuthorize(gw, one, caller, state);
        } else {
            state = _handleGatewayDeauthorize(gw, one, caller, state);
        }
        return state;
    }

    function _handleGatewayAuthorize(
        IGateway gw,
        ProtocolTypes.LendingInstruction[] memory one,
        address caller,
        AuthState memory state
    ) private view returns (AuthState memory) {
        (address[] memory t, bytes[] memory d, ProtocolTypes.Output[] memory produced) = 
            gw.authorize(one, caller, state.outputs);

        for (uint256 j = 0; j < t.length; j++) {
            if (t[j] != address(0) && d[j].length > 0) {
                state.tmpTargets[state.k] = t[j];
                state.tmpData[state.k] = d[j];
                state.k++;
            }
        }

        if (produced.length > 0) {
            state.outputs = _concatOutputs(state.outputs, produced);
        }
        return state;
    }

    function _handleGatewayDeauthorize(
        IGateway gw,
        ProtocolTypes.LendingInstruction[] memory one,
        address caller,
        AuthState memory state
    ) private view returns (AuthState memory) {
        (address[] memory t, bytes[] memory d) = gw.deauthorize(one, caller, state.outputs);
        
        for (uint256 j = 0; j < t.length; j++) {
            state.tmpTargets[state.k] = t[j] != address(0) ? t[j] : address(0);
            state.tmpData[state.k] = t[j] != address(0) ? d[j] : bytes("");
            state.k++;
        }

        // Update simulation state using authorize
        (, , ProtocolTypes.Output[] memory produced) = gw.authorize(one, caller, state.outputs);
        if (produced.length > 0) {
            state.outputs = _concatOutputs(state.outputs, produced);
        }
        return state;
    }

    function _compactAuthResults(AuthState memory state) 
        private pure returns (address[] memory targets, bytes[] memory data) 
    {
        targets = new address[](state.k);
        data = new bytes[](state.k);
        for (uint256 i = 0; i < state.k; i++) {
            targets[i] = state.tmpTargets[i];
            data[i] = state.tmpData[i];
        }
    }

    // ============ Router Instruction Helpers ============

    function _getAuthForPullToken(
        bytes calldata data,
        address caller
    ) private view returns (address target, bytes memory callData) {
        RouterInstruction memory r = abi.decode(data, (RouterInstruction));
        if (r.user == caller) {
            uint256 current = IERC20(r.token).allowance(caller, router);
            if (current < r.amount) {
                return (r.token, abi.encodeWithSelector(IERC20.approve.selector, router, r.amount));
            }
        }
        return (address(0), bytes(""));
    }

    function _getDeauthForPullToken(
        bytes calldata data,
        address caller
    ) private view returns (address target, bytes memory callData) {
        RouterInstruction memory r = abi.decode(data, (RouterInstruction));
        if (r.user == caller) {
            return (r.token, abi.encodeWithSelector(IERC20.approve.selector, router, 0));
        }
        return (address(0), bytes(""));
    }

    function _simulateRouterInstruction(
        ProtocolTypes.ProtocolInstruction calldata pi,
        ProtocolTypes.Output[] memory outputs
    ) private pure returns (ProtocolTypes.Output[] memory) {
        RouterInstruction memory r = abi.decode(pi.data, (RouterInstruction));

        if (r.instructionType == RouterInstructionType.PullToken) {
            return _appendOutput(outputs, ProtocolTypes.Output({ token: r.token, amount: r.amount }));
        } else if (r.instructionType == RouterInstructionType.PushToken) {
            return _handlePushToken(pi.data, outputs);
        } else if (r.instructionType == RouterInstructionType.ToOutput) {
            return _appendOutput(outputs, ProtocolTypes.Output({ token: r.token, amount: r.amount }));
        } else if (r.instructionType == RouterInstructionType.Approve) {
            return _appendOutput(outputs, ProtocolTypes.Output({ token: address(0), amount: 0 }));
        } else if (r.instructionType == RouterInstructionType.FlashLoan) {
            return _handleFlashLoan(pi.data, outputs);
        } else if (r.instructionType == RouterInstructionType.Split) {
            return _handleSplit(pi.data, outputs);
        } else if (r.instructionType == RouterInstructionType.Add) {
            return _handleAdd(pi.data, outputs);
        } else if (r.instructionType == RouterInstructionType.Subtract) {
            return _handleSubtract(pi.data, outputs);
        }
        return outputs;
    }

    function _handlePushToken(
        bytes calldata data,
        ProtocolTypes.Output[] memory outputs
    ) private pure returns (ProtocolTypes.Output[] memory) {
        (, ProtocolTypes.InputPtr memory inputPtr) = abi.decode(data, (RouterInstruction, ProtocolTypes.InputPtr));
        if (inputPtr.index < outputs.length) {
            outputs[inputPtr.index] = ProtocolTypes.Output({ token: address(0), amount: 0 });
        }
        return outputs;
    }

    function _handleFlashLoan(
        bytes calldata data,
        ProtocolTypes.Output[] memory outputs
    ) private pure returns (ProtocolTypes.Output[] memory) {
        (, , ProtocolTypes.InputPtr memory inputPtr, ) = abi.decode(
            data,
            (RouterInstruction, FlashLoanProvider, ProtocolTypes.InputPtr, address)
        );
        if (inputPtr.index < outputs.length) {
            ProtocolTypes.Output memory loanOut = outputs[inputPtr.index];
            // 0.1% buffer for flash loan fees
            loanOut.amount = (loanOut.amount * 1001) / 1000;
            return _appendOutput(outputs, loanOut);
        }
        return _appendOutput(outputs, ProtocolTypes.Output({ token: address(0), amount: 0 }));
    }

    function _handleSplit(
        bytes calldata data,
        ProtocolTypes.Output[] memory outputs
    ) private pure returns (ProtocolTypes.Output[] memory) {
        (, ProtocolTypes.InputPtr memory inputPtr, uint256 bp) = abi.decode(
            data,
            (RouterInstruction, ProtocolTypes.InputPtr, uint256)
        );
        if (inputPtr.index < outputs.length) {
            ProtocolTypes.Output memory orig = outputs[inputPtr.index];
            uint256 feeAmount = (orig.amount * bp + 10000 - 1) / 10000;
            if (feeAmount > orig.amount) feeAmount = orig.amount;
            uint256 remainder = orig.amount - feeAmount;
            outputs[inputPtr.index] = ProtocolTypes.Output({ token: address(0), amount: 0 });
            outputs = _appendOutput(outputs, ProtocolTypes.Output({ token: orig.token, amount: feeAmount }));
            return _appendOutput(outputs, ProtocolTypes.Output({ token: orig.token, amount: remainder }));
        }
        outputs = _appendOutput(outputs, ProtocolTypes.Output({ token: address(0), amount: 0 }));
        return _appendOutput(outputs, ProtocolTypes.Output({ token: address(0), amount: 0 }));
    }

    function _handleAdd(
        bytes calldata data,
        ProtocolTypes.Output[] memory outputs
    ) private pure returns (ProtocolTypes.Output[] memory) {
        (, ProtocolTypes.InputPtr memory ptrA, ProtocolTypes.InputPtr memory ptrB) = abi.decode(
            data,
            (RouterInstruction, ProtocolTypes.InputPtr, ProtocolTypes.InputPtr)
        );
        if (ptrA.index < outputs.length && ptrB.index < outputs.length) {
            ProtocolTypes.Output memory outA = outputs[ptrA.index];
            ProtocolTypes.Output memory outB = outputs[ptrB.index];
            uint256 total = outA.amount + outB.amount;
            outputs[ptrA.index] = ProtocolTypes.Output({ token: address(0), amount: 0 });
            outputs[ptrB.index] = ProtocolTypes.Output({ token: address(0), amount: 0 });
            return _appendOutput(outputs, ProtocolTypes.Output({ token: outA.token, amount: total }));
        }
        return _appendOutput(outputs, ProtocolTypes.Output({ token: address(0), amount: 0 }));
    }

    function _handleSubtract(
        bytes calldata data,
        ProtocolTypes.Output[] memory outputs
    ) private pure returns (ProtocolTypes.Output[] memory) {
        (, ProtocolTypes.InputPtr memory ptrA, ProtocolTypes.InputPtr memory ptrB) = abi.decode(
            data,
            (RouterInstruction, ProtocolTypes.InputPtr, ProtocolTypes.InputPtr)
        );
        if (ptrA.index < outputs.length && ptrB.index < outputs.length) {
            ProtocolTypes.Output memory outA = outputs[ptrA.index];
            ProtocolTypes.Output memory outB = outputs[ptrB.index];
            uint256 diff = outA.amount >= outB.amount ? outA.amount - outB.amount : 0;
            outputs[ptrA.index] = ProtocolTypes.Output({ token: address(0), amount: 0 });
            outputs[ptrB.index] = ProtocolTypes.Output({ token: address(0), amount: 0 });
            return _appendOutput(outputs, ProtocolTypes.Output({ token: outA.token, amount: diff }));
        }
        return _appendOutput(outputs, ProtocolTypes.Output({ token: address(0), amount: 0 }));
    }

    function _appendOutput(
        ProtocolTypes.Output[] memory current,
        ProtocolTypes.Output memory item
    ) private pure returns (ProtocolTypes.Output[] memory) {
        ProtocolTypes.Output[] memory next = new ProtocolTypes.Output[](current.length + 1);
        for (uint i = 0; i < current.length; i++) next[i] = current[i];
        next[current.length] = item;
        return next;
    }

    function _concatOutputs(
        ProtocolTypes.Output[] memory current,
        ProtocolTypes.Output[] memory items
    ) private pure returns (ProtocolTypes.Output[] memory) {
        ProtocolTypes.Output[] memory next = new ProtocolTypes.Output[](current.length + items.length);
        for (uint i = 0; i < current.length; i++) next[i] = current[i];
        for (uint j = 0; j < items.length; j++) next[current.length + j] = items[j];
        return next;
    }
}
