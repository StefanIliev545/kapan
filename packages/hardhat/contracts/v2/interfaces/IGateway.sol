// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ProtocolTypes} from "./ProtocolTypes.sol";

interface IGateway {
    function processLendingInstruction(ProtocolTypes.Output[] calldata inputs, bytes calldata data)
        external
        returns (ProtocolTypes.Output[] memory outputs);
}


