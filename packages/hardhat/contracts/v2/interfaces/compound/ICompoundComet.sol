// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface ICompoundComet {
    function baseToken() external view returns (address);
    function allow(address manager, bool isAllowed) external;

    // Supply/withdraw APIs
    function supplyTo(address dst, address asset, uint amount) external;
    function withdrawFrom(address src, address to, address asset, uint amount) external;

    // Views
    function balanceOf(address owner) external view returns (uint256); // base position
    function borrowBalanceOf(address account) external view returns (uint256);
    function collateralBalanceOf(address account, address asset) external view returns (uint128);
}


