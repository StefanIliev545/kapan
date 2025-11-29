// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MockPoolAddressesProvider {
    address public pool;

    constructor(address _pool) {
        pool = _pool;
    }

    function getPool() external view returns (address) {
        return pool;
    }

    function setPool(address _pool) external {
        pool = _pool;
    }
}
