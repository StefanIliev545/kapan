// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IGPv2Settlement } from "../interfaces/cow/IGPv2Settlement.sol";

/// @title MockGPv2Settlement
/// @notice Mock implementation of GPv2Settlement for testing
contract MockGPv2Settlement is IGPv2Settlement {
    
    bytes32 public override domainSeparator;
    address public override vaultRelayer;
    
    constructor(address _vaultRelayer) {
        vaultRelayer = _vaultRelayer;
        domainSeparator = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("Gnosis Protocol"),
            keccak256("v2"),
            block.chainid,
            address(this)
        ));
    }
    
    function setVaultRelayer(address _vaultRelayer) external {
        vaultRelayer = _vaultRelayer;
    }
}
