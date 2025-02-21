//SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

interface IGateway {
    function deposit(address token, address user, uint256 amount) external;
    
    /**
     * @notice Borrow tokens from the protocol
     * @dev Can be called by Router or directly by the user
     * @param token The token to borrow
     * @param user The user to borrow for
     * @param amount The amount to borrow
     */
    function borrow(address token, address user, uint256 amount) external;
    function repay(address token, address user, uint256 amount) external;

    function depositCollateral(address market, address collateral, uint256 amount, address receiver) external;
    function withdrawCollateral(address market, address collateral, address user, uint256 amount) external returns (address);
    

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

    struct Collateral {
        address token;
        uint256 amount;
    }    
    function getEncodedCollateralApprovals(address token, Collateral[] calldata collaterals) external view returns (address[] memory target, bytes[] memory data);
    function getEncodedDebtApproval(address token, uint256 amount) external view returns (address[] memory target, bytes[] memory data);
}