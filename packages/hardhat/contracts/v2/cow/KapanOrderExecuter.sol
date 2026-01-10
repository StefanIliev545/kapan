// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";


interface IOrderStorage {
    struct Order {
        bytes32 orderHash; // todo rest of KapanOrder (With the GPL stuff from CoW)
    }
    function getOrder(bytes32 orderHash) external view returns (Order memory);
}

contract KapanOrderExecuter is Ownable {
    
    constructor(
        address _owner,
        address _router,
        address _orderStorage
    ) Ownable(_owner) {}

    function executeOrder(bytes32 orderHash) external onlyOwner {
        // TODO: Implement order execution
    }
}