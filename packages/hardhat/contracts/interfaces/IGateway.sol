//SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

interface IGateway {
    function deposit(address token, address user, uint256 amount) external;
    function withdraw(address token, address user, uint256 amount) external;
    function borrow(address token, address user, uint256 amount) external;
    function repay(address token, address user, uint256 amount) external;


    function getBalance(address token, address user) external view returns (uint256);
    function getBorrowBalance(address token, address user) external view returns (uint256);
    function getBorrowRate(address token) external view returns (uint256, bool);
    function getSupplyRate(address token) external view returns (uint256, bool);
    function getLtv(address token, address user) external view returns (uint256);
    function getPossibleCollaterals(address token, address user) external view returns (
        address[] memory collateralAddresses,
        uint256[] memory balances,
        string[] memory symbols,
        uint8[] memory decimals
    );
}