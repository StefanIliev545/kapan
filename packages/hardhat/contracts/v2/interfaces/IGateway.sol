// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ProtocolTypes} from "./ProtocolTypes.sol";

interface IGateway {
    function processLendingInstruction(ProtocolTypes.Output[] calldata inputs, bytes calldata data)
        external
        returns (ProtocolTypes.Output[] memory outputs);

    /// @notice Return user-side authorization calls for the given lending instructions.
    ///         One element per input (or (address(0), bytes("")) if none needed).
    ///         Also returns the produced outputs from the simulation of these instructions.
    function authorize(
        ProtocolTypes.LendingInstruction[] calldata instrs,
        address caller,
        ProtocolTypes.Output[] calldata inputs
    ) external view returns (
        address[] memory targets,
        bytes[] memory data,
        ProtocolTypes.Output[] memory produced
    );

    /// @notice Return user-side deauthorization calls for the given lending instructions.
    ///         Used to revoke permissions after execution.
    function deauthorize(
        ProtocolTypes.LendingInstruction[] calldata instrs,
        address caller
    ) external view returns (address[] memory targets, bytes[] memory data);
}


