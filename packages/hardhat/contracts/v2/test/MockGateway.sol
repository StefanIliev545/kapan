// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ProtocolTypes} from "../interfaces/ProtocolTypes.sol";
import {IGateway} from "../interfaces/IGateway.sol";

contract MockGateway is IGateway {
    event Instruction(bytes data);

    function processLendingInstruction(ProtocolTypes.Output[] calldata /*inputs*/, bytes calldata data)
        external
        returns (ProtocolTypes.Output[] memory outputs)
    {
        emit Instruction(data);
        outputs = new ProtocolTypes.Output[](0);
    }
}


