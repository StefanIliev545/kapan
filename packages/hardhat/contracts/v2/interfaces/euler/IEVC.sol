// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title IEVC
/// @notice Interface for the Ethereum Vault Connector (EVC)
/// @dev The EVC mediates between vaults in the Euler V2 protocol
interface IEVC {
    /// @notice Batch operation item
    struct BatchItem {
        address targetContract;
        address onBehalfOfAccount;
        uint256 value;
        bytes data;
    }

    /// @notice Execute a batch of operations
    /// @param items Array of batch items to execute
    function batch(BatchItem[] calldata items) external payable;

    /// @notice Enable a vault as collateral for an account
    /// @param account The account to enable collateral for
    /// @param vault The vault to enable as collateral
    function enableCollateral(address account, address vault) external;

    /// @notice Disable a vault as collateral for an account
    /// @param account The account to disable collateral for
    /// @param vault The vault to disable as collateral
    function disableCollateral(address account, address vault) external;

    /// @notice Enable a vault as controller for an account (allows borrowing)
    /// @param account The account to enable controller for
    /// @param vault The vault to enable as controller
    function enableController(address account, address vault) external;

    /// @notice Disable controller for an account
    /// @dev Will revert if account has outstanding debt
    /// @param account The account to disable controller for
    function disableController(address account) external;

    /// @notice Check if a vault is enabled as collateral for an account
    /// @param account The account to check
    /// @param vault The vault to check
    /// @return True if the vault is enabled as collateral
    function isCollateralEnabled(address account, address vault) external view returns (bool);

    /// @notice Check if a vault is enabled as controller for an account
    /// @param account The account to check
    /// @param vault The vault to check
    /// @return True if the vault is enabled as controller
    function isControllerEnabled(address account, address vault) external view returns (bool);

    /// @notice Get all collateral vaults for an account
    /// @param account The account to query
    /// @return Array of vault addresses enabled as collateral
    function getCollaterals(address account) external view returns (address[] memory);

    /// @notice Get all controller vaults for an account
    /// @param account The account to query
    /// @return Array of vault addresses enabled as controller
    function getControllers(address account) external view returns (address[] memory);

    /// @notice Set or revoke an operator for an account
    /// @param account The account to set operator for
    /// @param operator The operator address
    /// @param authorized True to authorize, false to revoke
    function setAccountOperator(address account, address operator, bool authorized) external;

    /// @notice Check if an operator is authorized for an account
    /// @param account The account to check
    /// @param operator The operator to check
    /// @return True if the operator is authorized
    function isAccountOperatorAuthorized(address account, address operator) external view returns (bool);

    /// @notice Get the owner of an account (handles sub-accounts)
    /// @param account The account address
    /// @return The owner address
    function getAccountOwner(address account) external view returns (address);
}
