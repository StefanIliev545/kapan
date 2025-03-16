// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "../interfaces/IGateway.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./ProtocolGateway.sol";

// Import local interface definitions instead of Venus Protocol package
import "../interfaces/venus/ComptrollerInterface.sol";
import "../interfaces/venus/VTokenInterface.sol";

import "hardhat/console.sol";

contract VenusGateway is IGateway, ProtocolGateway, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    ComptrollerInterface public comptroller;
    
    constructor(address _comptroller, address router) 
        ProtocolGateway(router)
        Ownable(msg.sender)
    {
        comptroller = ComptrollerInterface(_comptroller);
    }
    
    /**
     * @notice Updates the comptroller address
     * @param _comptroller The new comptroller address
     */
    function setComptroller(address _comptroller) external onlyOwner {
        comptroller = ComptrollerInterface(_comptroller);
    }
    
    /**
     * @notice Find the vToken for a given underlying token address
     * @dev Iterates through all markets to find the matching vToken
     * @param underlyingToken The underlying token address
     * @return The vToken address
     */
    function getVTokenForUnderlying(address underlyingToken) public view returns (address) {
        address[] memory vTokenAddresses = this.getAllMarkets();
        
        for (uint i = 0; i < vTokenAddresses.length; i++) {
            address vTokenAddress = vTokenAddresses[i];
            
            try VTokenInterface(vTokenAddress).underlying() returns (address underlying) {
                if (underlying == underlyingToken) {
                    return vTokenAddress;
                }
            } catch {
                // Skip if there's an error (e.g., for vBNB which might not have an underlying() function)
                continue;
            }
        }
        
        revert("VenusGateway: vToken not found for underlying token");
    }
    
    /**
     * @notice Get all markets a user has entered
     * @param account The account to check
     * @return A list of vToken addresses the account has entered
     */
    function getAssetsIn(address account) external view returns (address[] memory) {
        VTokenInterface[] memory vTokens = comptroller.getAssetsIn(account);
        address[] memory vTokenAddresses = new address[](vTokens.length);
        
        for (uint i = 0; i < vTokens.length; i++) {
            vTokenAddresses[i] = address(vTokens[i]);
        }
        
        return vTokenAddresses;
    }
    
    /**
     * @notice Check if an account has entered a specific market
     * @param account The account to check
     * @param vToken The vToken market to check
     * @return True if the account has entered the market
     */
    function checkMembership(address account, address vToken) external view returns (bool) {
        return comptroller.checkMembership(account, vToken);
    }
    
    /**
     * @notice Get all available markets in Venus protocol
     * @return A list of all vToken addresses
     */
    function getAllMarkets() external view returns (address[] memory) {
        VTokenInterface[] memory vTokens = comptroller.getAllMarkets();
        address[] memory vTokenAddresses = new address[](vTokens.length);
        
        for (uint i = 0; i < vTokens.length; i++) {
            vTokenAddresses[i] = address(vTokens[i]);
        }
        
        return vTokenAddresses;
    }
    
    /**
     * @notice Gets account liquidity information
     * @param account The address to check
     * @return error Error code (0=success, otherwise a failure)
     * @return liquidity The USD value borrowable by the account
     * @return shortfall The USD value of collateral needed to meet obligations
     */
    function getAccountLiquidity(address account) public view returns (uint, uint, uint) {
        return comptroller.getAccountLiquidity(account);
    }
    
    /**
     * @notice Supply assets to the Venus protocol (implements IGateway.deposit)
     * @param token The underlying token to supply
     * @param user The account to supply for
     * @param amount The amount to supply
     */
    function deposit(address token, address user, uint256 amount) external override onlyRouter nonReentrant {
        address vTokenAddress = getVTokenForUnderlying(token);
        
        // Transfer tokens from the user to this contract
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        
        // Approve vToken contract to take the tokens
        IERC20(token).approve(vTokenAddress, amount);
        
        // Mint vTokens (supply to Venus) on behalf of the user
        uint result = VTokenInterface(vTokenAddress).mint(amount);
        require(result == 0, "VenusGateway: deposit failed");
        
        // Transfer vTokens to the user
        uint vTokenBalance = VTokenInterface(vTokenAddress).balanceOf(address(this));
        require(vTokenBalance > 0, "VenusGateway: no vTokens minted");
        
        VTokenInterface(vTokenAddress).transfer(user, vTokenBalance);
    }
    
    /**
     * @notice Borrow tokens from the Venus protocol
     * @param token The underlying token to borrow
     * @param user The account to borrow for
     * @param amount The amount to borrow
     */
    function borrow(address token, address user, uint256 amount) external override onlyRouterOrSelf(user) nonReentrant {
        address vTokenAddress = getVTokenForUnderlying(token);
        
        // User must have entered the market already to borrow
        // The borrowed tokens will go directly to the user
        console.log("borrowing", token, user, amount);
        uint result = VTokenInterface(vTokenAddress).borrowBehalf(user, amount);
        require(result == 0, "VenusGateway: borrow failed");
        
        console.log("borrowed", token, user, amount);
        // Transfer borrowed tokens to the user
        IERC20(token).safeTransfer(user, amount);
    }
    
    /**
     * @notice Repay borrowed tokens to the Venus protocol
     * @param token The underlying token to repay
     * @param user The account whose debt to repay
     * @param amount The amount to repay
     */
    function repay(address token, address user, uint256 amount) external override onlyRouter nonReentrant {
        address vTokenAddress = getVTokenForUnderlying(token);
        
        // Transfer tokens from msg.sender to this contract
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        
        // Approve vToken contract to take the tokens
        IERC20(token).approve(vTokenAddress, amount);
        
        // Repay borrow on behalf of the user
        uint result = VTokenInterface(vTokenAddress).repayBorrowBehalf(user, amount);
        require(result == 0, "VenusGateway: repay failed");
    }
    
    /**
     * @notice Get the supply balance of a token for a user
     * @param token The underlying token
     * @param user The account to check
     * @return The user's supply balance
     */
    function getBalance(address token, address user) external view override returns (uint256) {
        address vTokenAddress = getVTokenForUnderlying(token);
        
        // Get vToken balance
        uint vTokenBalance = VTokenInterface(vTokenAddress).balanceOf(user);
        
        // Convert to underlying amount using exchange rate
        uint exchangeRate = VTokenInterface(vTokenAddress).exchangeRateStored();
        
        // Calculate underlying value (simplified)
        // In production, be careful about precision
        return (vTokenBalance * exchangeRate) / 1e18;
    }
    
    /**
     * @notice Get the borrow balance of a token for a user
     * @param token The underlying token
     * @param user The account to check
     * @return The user's borrow balance
     */
    function getBorrowBalance(address token, address user) external view override returns (uint256) {
        address vTokenAddress = getVTokenForUnderlying(token);
        return VTokenInterface(vTokenAddress).borrowBalanceStored(user);
    }
    
    /**
     * @notice Get the current borrow rate for a token
     * @param token The underlying token
     * @return The borrow rate and a boolean indicating success
     */
    function getBorrowRate(address token) external view override returns (uint256, bool) {
        address vTokenAddress = getVTokenForUnderlying(token);
        uint borrowRate = VTokenInterface(vTokenAddress).borrowRatePerBlock();
        return (borrowRate, true);
    }
    
    /**
     * @notice Get the current supply rate for a token
     * @param token The underlying token
     * @return The supply rate and a boolean indicating success
     */
    function getSupplyRate(address token) external view override returns (uint256, bool) {
        address vTokenAddress = getVTokenForUnderlying(token);
        uint supplyRate = VTokenInterface(vTokenAddress).supplyRatePerBlock();
        return (supplyRate, true);
    }
    
    /**
     * @notice Generate encoded call data for the user to approve this contract as a delegate for borrowing
     * @return target The comptroller address
     * @return data The encoded call data for updateDelegate function
     */
    function getEncodedDelegateApproval() external view returns (address target, bytes memory data) {
        // Encode the updateDelegate function call to approve this contract
        target = address(comptroller);
        data = abi.encodeWithSelector(
            comptroller.updateDelegate.selector,
            address(this),  // delegate address (this gateway)
            true            // allowBorrows = true
        );
        
        return (target, data);
    }
    
    /**
     * @notice Get basic details for all Venus markets
     * @dev This function returns arrays of basic information about all Venus markets
     * @return vTokens Array of vToken addresses
     * @return tokens Array of underlying token addresses
     * @return symbols Array of token symbols
     * @return names Array of token names
     * @return decimals Array of token decimals
     */
    function getAllVenusMarkets() external view returns (
        address[] memory vTokens,
        address[] memory tokens,
        string[] memory symbols,
        string[] memory names,
        uint8[] memory decimals
    ) {
        // Get all markets from the comptroller
        vTokens = this.getAllMarkets();
        uint256 marketsCount = vTokens.length;
        
        // Initialize arrays
        tokens = new address[](marketsCount);
        symbols = new string[](marketsCount);
        names = new string[](marketsCount);
        decimals = new uint8[](marketsCount);
        
        // Populate arrays with basic token information
        for (uint i = 0; i < marketsCount; i++) {
            address vTokenAddress = vTokens[i];
            VTokenInterface vToken = VTokenInterface(vTokenAddress);
            
            // Get underlying token address directly
            try vToken.underlying() returns (address underlyingToken) {
                tokens[i] = underlyingToken;
                
                // Get token metadata
                IERC20Metadata underlying = IERC20Metadata(underlyingToken);
                
                // Try to get symbol from underlying, fallback to vToken
                try underlying.symbol() returns (string memory s) {
                    symbols[i] = s;
                } catch {
                    symbols[i] = vToken.symbol();
                }
                
                // Try to get name from underlying, fallback to vToken
                try underlying.name() returns (string memory n) {
                    names[i] = n;
                } catch {
                    names[i] = vToken.name();
                }
                
                // Try to get decimals from underlying, fallback to vToken
                try underlying.decimals() returns (uint8 d) {
                    decimals[i] = d;
                } catch {
                    decimals[i] = vToken.decimals();
                }
            } catch {
                // For tokens like vBNB that might not have an underlying() function
                tokens[i] = address(0);
                symbols[i] = vToken.symbol();
                names[i] = vToken.name();
                decimals[i] = vToken.decimals();
            }
        }
        
        return (vTokens, tokens, symbols, names, decimals);
    }
    
    /**
     * @notice Get market rates and prices for Venus markets
     * @param vTokens Array of vToken addresses to query
     * @return prices Array of token prices (8 decimals precision)
     * @return supplyRates Array of supply rates per block
     * @return borrowRates Array of borrow rates per block
     */
    function getMarketRates(address[] calldata vTokens) external view returns (
        uint256[] memory prices,
        uint256[] memory supplyRates,
        uint256[] memory borrowRates
    ) {
        uint256 marketsCount = vTokens.length;
        
        // Initialize arrays
        prices = new uint256[](marketsCount);
        supplyRates = new uint256[](marketsCount);
        borrowRates = new uint256[](marketsCount);
        
        // Populate arrays with rate information
        for (uint i = 0; i < marketsCount; i++) {
            address vTokenAddress = vTokens[i];
            VTokenInterface vToken = VTokenInterface(vTokenAddress);
            
            // Get rates
            supplyRates[i] = vToken.supplyRatePerBlock();
            borrowRates[i] = vToken.borrowRatePerBlock();
            
            // Default price to 1 USD (8 decimals precision)
            // This should be replaced with actual price oracle implementation
            prices[i] = 1e8;
        }
        
        return (prices, supplyRates, borrowRates);
    }
    
    /**
     * @notice Get user balances for Venus markets
     * @param vTokens Array of vToken addresses to query
     * @param account The user account to check balances for
     * @return balances Array of user supply balances (in underlying token)
     * @return borrowBalances Array of user borrow balances
     */
    function getUserBalances(address[] calldata vTokens, address account) external view returns (
        uint256[] memory balances,
        uint256[] memory borrowBalances
    ) {
        require(account != address(0), "VenusGateway: zero address not allowed");
        
        uint256 marketsCount = vTokens.length;
        
        // Initialize arrays
        balances = new uint256[](marketsCount);
        borrowBalances = new uint256[](marketsCount);
        
        // Populate arrays with user balance information
        for (uint i = 0; i < marketsCount; i++) {
            address vTokenAddress = vTokens[i];
            VTokenInterface vToken = VTokenInterface(vTokenAddress);
            
            // Get user balances
            try vToken.balanceOf(account) returns (uint256 b) {
                // Convert vToken balance to underlying using exchange rate
                uint256 exchangeRate = vToken.exchangeRateStored();
                balances[i] = (b * exchangeRate) / 1e18;
            } catch {
                balances[i] = 0;
            }
            
            try vToken.borrowBalanceStored(account) returns (uint256 bb) {
                borrowBalances[i] = bb;
            } catch {
                borrowBalances[i] = 0;
            }
        }
        
        return (balances, borrowBalances);
    }
    
    /**
     * @notice Check which markets are being used as collateral by a user
     * @param vTokens Array of vToken addresses to check
     * @param account The user account to check
     * @return isCollateral Array of booleans indicating if token is used as collateral
     */
    function getCollateralStatus(address[] calldata vTokens, address account) external view returns (
        bool[] memory isCollateral
    ) {
        require(account != address(0), "VenusGateway: zero address not allowed");
        
        uint256 marketsCount = vTokens.length;
        isCollateral = new bool[](marketsCount);
        
        // Get the list of markets the user has entered (used as collateral)
        address[] memory enteredMarkets = this.getAssetsIn(account);
        
        // Check each market if it's being used as collateral
        for (uint i = 0; i < marketsCount; i++) {
            address vTokenAddress = vTokens[i];
            
            // Linear search through entered markets
            for (uint j = 0; j < enteredMarkets.length; j++) {
                if (enteredMarkets[j] == vTokenAddress) {
                    isCollateral[i] = true;
                    break;
                }
            }
        }
        
        return isCollateral;
    }
    
    /**
     * @notice Get possible collaterals for a borrowing position
     * @dev In Venus, any supported market can potentially be collateral
     * @param token The underlying token (not used in Venus implementation)
     * @param user The user address to check balances for
     * @return collateralAddresses Array of possible collateral token addresses
     * @return balances Array of user balances for each collateral
     * @return symbols Array of token symbols
     * @return decimals Array of token decimals
     */
    function getPossibleCollaterals(address token, address user) external view override returns (
        address[] memory collateralAddresses,
        uint256[] memory balances,
        string[] memory symbols,
        uint8[] memory decimals
    ) {
        // Get all Venus markets information
        (
            address[] memory vTokens, 
            address[] memory tokens, 
            string[] memory tokenSymbols, 
            string[] memory names, 
            uint8[] memory tokenDecimals
        ) = this.getAllVenusMarkets();
        
        // Create arrays for return values
        collateralAddresses = new address[](tokens.length);
        symbols = new string[](tokens.length);
        decimals = new uint8[](tokens.length);
        
        // If user address is provided, get their balances
        if (user != address(0)) {
            // Get user balances for all markets
            (uint256[] memory userBalances, ) = this.getUserBalances(vTokens, user);
            balances = userBalances;
        } else {
            // If no user is provided, return zero balances
            balances = new uint256[](tokens.length);
        }
        
        // Copy token information to return arrays
        for (uint i = 0; i < tokens.length; i++) {
            collateralAddresses[i] = tokens[i];
            symbols[i] = tokenSymbols[i];
            decimals[i] = tokenDecimals[i];
        }
        
        return (collateralAddresses, balances, symbols, decimals);
    }
    
    /**
     * @notice Check if a collateral is supported for a market
     * @dev In Venus, any market can be used as collateral for any other market
     * @param market The market token address
     * @param collateral The collateral token address
     * @return isSupported True if the collateral is supported for the market
     */
    function isCollateralSupported(address market, address collateral) external view override returns (bool isSupported) {
        // Get all Venus markets information
        (
            ,  // vTokens (not needed)
            address[] memory tokens, 
            ,  // symbols (not needed)
            ,  // names (not needed)
            // decimals (not needed)
        ) = this.getAllVenusMarkets();
        
        // First check that both market and collateral are valid tokens in Venus
        bool marketFound = false;
        bool collateralFound = false;
        
        for (uint i = 0; i < tokens.length; i++) {
            if (tokens[i] == market) {
                marketFound = true;
            }
            if (tokens[i] == collateral) {
                collateralFound = true;
            }
            
            // Early exit if both are found
            if (marketFound && collateralFound) {
                break;
            }
        }
        
        // In Venus, any valid token can be collateral for any other valid token
        return marketFound && collateralFound;
    }
    
    /**
     * @notice Get all supported collaterals for a market
     * @dev In Venus, all markets can be used as collateral for any other market
     * @param market The market token address
     * @return collateralAddresses Array of collateral token addresses supported for this market
     */
    function getSupportedCollaterals(address market) external view override returns (address[] memory collateralAddresses) {
        // Get all Venus markets information
        (
            ,  // vTokens (not needed)
            address[] memory tokens, 
            ,  // symbols (not needed)
            ,  // names (not needed)
            // decimals (not needed)
        ) = this.getAllVenusMarkets();
        
        // Check if market is a valid token in Venus
        bool marketFound = false;
        for (uint i = 0; i < tokens.length; i++) {
            if (tokens[i] == market) {
                marketFound = true;
                break;
            }
        }
        
        // If market is not found, return empty array
        if (!marketFound) {
            return new address[](0);
        }
        
        // In Venus, all tokens can be collateral for any other token
        // So we return all tokens except the market itself
        collateralAddresses = new address[](tokens.length - 1);
        
        uint index = 0;
        for (uint i = 0; i < tokens.length; i++) {
            // Skip the market token itself
            if (tokens[i] != market) {
                collateralAddresses[index] = tokens[i];
                index++;
            }
        }
        
        return collateralAddresses;
    }
    
    /**
     * @notice Get the loan-to-value ratio for a user's position with a specific token
     * @dev In Venus, the LTV is controlled by the Comptroller and is protocol-wide
     * @param token The token to check LTV for
     * @param user The user address
     * @return ltv The loan-to-value ratio (percentage multiplied by 1e18)
     */
    function getLtv(address token, address user) external view override returns (uint256) {
        // For Venus, LTV is typically around 50-75% depending on the asset
        // We would ideally get this from the Comptroller's collateralFactors for the specific vToken
        
        // Get the vToken address for this token
        address vTokenAddress;
        try this.getVTokenForUnderlying(token) returns (address vToken) {
            vTokenAddress = vToken;
        } catch {
            // If token is not found in Venus, return 0 LTV
            return 0;
        }
        
        // In a real implementation, we would get the collateral factor from Comptroller:
        // (, uint collateralFactorMantissa) = comptroller.markets(vTokenAddress);
        
        // For simplicity, we'll return a default LTV of 75% (expressed as 0.75 * 1e18)
        // In a production environment, this should be replaced with the actual collateral factor
        return 75 * 1e16; // 75% * 1e18 = 75 * 1e16
    }
    
    // Other IGateway methods follow with similar implementation patterns
    // The implementation would depend on the specific IGateway interface requirements
    // and would leverage the Venus Protocol's functionality

    // Placeholder implementations for the remaining IGateway interface methods
    function depositCollateral(address market, address collateral, uint256 amount, address receiver) external override onlyRouter nonReentrant {
        revert("depositCollateral: not implemented");
    }
    
    function withdrawCollateral(address market, address collateral, address user, uint256 amount) external override onlyRouterOrSelf(user) nonReentrant returns (address) {
        revert("withdrawCollateral: not implemented");
    }
    
    /**
     * @notice Generate encoded call data for approving collateral usage
     * @dev For Venus, this involves approving token transfers to vToken contracts
     * @param token The token to borrow (not used in this implementation)
     * @param collaterals The collaterals to approve
     * @return target Array of target contract addresses
     * @return data Array of encoded function call data
     */
    function getEncodedCollateralApprovals(address token, Collateral[] calldata collaterals) external view override returns (address[] memory target, bytes[] memory data) {
        // In Venus, to use collateral, users need to approve the token transfer to vToken contracts
        
        // Create arrays for the target addresses and calldata
        target = new address[](collaterals.length);
        data = new bytes[](collaterals.length);
        
        for (uint i = 0; i < collaterals.length; i++) {
            // Get vToken address for this collateral
            address vTokenAddress;
            try this.getVTokenForUnderlying(collaterals[i].token) returns (address vToken) {
                vTokenAddress = vToken;
            } catch {
                // Skip if token is not found in Venus
                continue;
            }
            
            // Target is the underlying token
            target[i] = collaterals[i].token;
            
            // Encode the approve function call - approve the vToken contract to spend the tokens
            // Use type(uint256).max for unlimited approval
            data[i] = abi.encodeWithSelector(
                IERC20.approve.selector,
                vTokenAddress,
                type(uint256).max
            );
        }
        
        return (target, data);
    }
    
    /**
     * @notice Generate encoded call data for approving debt operations
     * @dev For Venus, this involves entering the market for the token's vToken
     * @param token The token to borrow
     * @param amount The amount to borrow (not used in this implementation)
     * @return target Array of target contract addresses
     * @return data Array of encoded function call data
     */
    function getEncodedDebtApproval(address token, uint256 amount) external view override returns (address[] memory target, bytes[] memory data) {
        // In Venus, to borrow a token, the user needs to:
        // 1. Enter the market for the token's vToken
        // 2. Approve this contract as a delegate borrower
        
        // Create arrays with two elements (enterMarket + delegate approval)
        target = new address[](2);
        data = new bytes[](2);
        
        // Get the vToken address for this token
        address vTokenAddress;
        try this.getVTokenForUnderlying(token) returns (address vToken) {
            vTokenAddress = vToken;
        } catch {
            // If token is not found in Venus, return empty approvals
            return (new address[](0), new bytes[](0));
        }
        
        // First call is to enterMarkets with a single market (the vToken)
        address[] memory marketsToEnter = new address[](1);
        marketsToEnter[0] = vTokenAddress;
        
        target[0] = address(comptroller);
        data[0] = abi.encodeWithSelector(
            comptroller.enterMarkets.selector,
            marketsToEnter
        );
        
        // Second call is the delegate approval
        (target[1], data[1]) = this.getEncodedDelegateApproval();
        
        return (target, data);
    }
}