// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {KapanRouter} from "../KapanRouter.sol";
import {ProtocolTypes} from "../interfaces/ProtocolTypes.sol";

contract TestKapanRouter is KapanRouter {
    constructor(address owner) KapanRouter(owner) {}

    function seedStackForTest(ProtocolTypes.ProtocolInstruction[] calldata instructions) external onlyOwner {
        convertToStack(instructions);
    }
}


