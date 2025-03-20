// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.10;

interface OracleInterface {
    function getPrice(address asset) external view returns (uint256);
}

interface ResilientOracleInterface is OracleInterface {
    function getUnderlyingPrice(address vToken) external view returns (uint256);
}