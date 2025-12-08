// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Minimal interface for the Euler Vault Connector (EVC) used to proxy calls in a user's context.
interface IEVC {
    function callThroughEVC(address account, address target, bytes calldata data) external returns (bytes memory result);

    function isOperator(address account, address operator) external view returns (bool);

    function isControllerEnabled(address account, address controller) external view returns (bool);

    function isCollateralEnabled(address account, address collateral) external view returns (bool);

    function setOperator(address operator, bool approved) external;

    function enableController(address controller) external;

    function enableCollateral(address collateral) external;

    function multicall(bytes[] calldata data) external returns (bytes[] memory results);
}
