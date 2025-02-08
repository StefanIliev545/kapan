// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

interface ICompoundComet {
    function balanceOf(address owner) external view returns (uint256);
    function borrowBalanceOf(address account) external view returns (uint256);
    function getSupplyRate(uint utilization) external view returns (uint64);
    function getBorrowRate(uint utilization) external view returns (uint64);
    function getUtilization() external view returns (uint);
    function baseToken() external view returns (address);
}
