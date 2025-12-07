// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ComptrollerInterface} from "../../../interfaces/venus/ComptrollerInterface.sol";
import {VTokenInterface} from "../../../interfaces/venus/VTokenInterface.sol";
import {ResilientOracleInterface} from "../../../interfaces/venus/ResilientOracleInterface.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VenusGatewayView
 * @notice View-only gateway for Venus protocol
 * @dev Contains all read/view functions from v1, separate from write operations
 */
contract VenusGatewayView is Ownable {
    ComptrollerInterface public comptroller;
    ResilientOracleInterface public oracle;

    constructor(address _comptroller, address _oracle, address owner_) Ownable(owner_) {
        comptroller = ComptrollerInterface(_comptroller);
        oracle = ResilientOracleInterface(_oracle);
    }
    
    function setComptroller(address _comptroller) external onlyOwner {
        comptroller = ComptrollerInterface(_comptroller);
    }

    function setOracle(address _oracle) external onlyOwner {
        oracle = ResilientOracleInterface(_oracle);
    }

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
    
    function getAssetsIn(address account) external view returns (address[] memory) {
        VTokenInterface[] memory vTokens = comptroller.getAssetsIn(account);
        address[] memory vTokenAddresses = new address[](vTokens.length);
        
        for (uint i = 0; i < vTokens.length; i++) {
            vTokenAddresses[i] = address(vTokens[i]);
        }
        
        return vTokenAddresses;
    }
    
    function checkMembership(address account, address vToken) external view returns (bool) {
        return comptroller.checkMembership(account, vToken);
    }
    
    function getAllMarkets() external view returns (address[] memory) {
        VTokenInterface[] memory vTokens = comptroller.getAllMarkets();
        address[] memory vTokenAddresses = new address[](vTokens.length);
        
        for (uint i = 0; i < vTokens.length; i++) {
            vTokenAddresses[i] = address(vTokens[i]);
        }
        
        return vTokenAddresses;
    }
    
    function getAccountLiquidity(address account) public view returns (uint, uint, uint) {
        return comptroller.getAccountLiquidity(account);
    }
    
    function getBalance(address token, address user) external view returns (uint256) {
        address vTokenAddress = getVTokenForUnderlying(token);
        
        // Get vToken balance
        uint vTokenBalance = VTokenInterface(vTokenAddress).balanceOf(user);
        
        // Convert to underlying amount using exchange rate
        uint exchangeRate = VTokenInterface(vTokenAddress).exchangeRateStored();
        
        // Calculate underlying value
        return (vTokenBalance * exchangeRate) / 1e18;
    }
    
    function getBorrowBalance(address token, address user) external view returns (uint256) {
        address vTokenAddress = getVTokenForUnderlying(token);
        return VTokenInterface(vTokenAddress).borrowBalanceStored(user);
    }

    function getBorrowBalanceCurrent(address token, address user) external returns (uint256) {
        address vTokenAddress = getVTokenForUnderlying(token);
        return VTokenInterface(vTokenAddress).borrowBalanceCurrent(user);
    }
    
    function getBorrowRate(address token) external view returns (uint256, bool) {
        address vTokenAddress = getVTokenForUnderlying(token);
        uint borrowRate = VTokenInterface(vTokenAddress).borrowRatePerBlock();
        return (borrowRate, true);
    }
    
    function getSupplyRate(address token) external view returns (uint256, bool) {
        address vTokenAddress = getVTokenForUnderlying(token);
        uint supplyRate = VTokenInterface(vTokenAddress).supplyRatePerBlock();
        return (supplyRate, true);
    }
    
    function getAllVenusMarkets() external view returns (
        address[] memory vTokens,
        address[] memory tokens,
        string[] memory symbols,
        string[] memory names,
        uint8[] memory decimals,
        uint256[] memory prices
    ) {
        // Get all markets from the comptroller
        vTokens = this.getAllMarkets();
        uint256 marketsCount = vTokens.length;
        
        // Initialize arrays
        tokens = new address[](marketsCount);
        symbols = new string[](marketsCount);
        names = new string[](marketsCount);
        decimals = new uint8[](marketsCount);
        prices = new uint256[](marketsCount);
        
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
            prices[i] = oracle.getUnderlyingPrice(vTokenAddress);
        }
        
        return (vTokens, tokens, symbols, names, decimals, prices);
    }
    
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
            prices[i] = oracle.getUnderlyingPrice(vTokenAddress);
        }
        
        return (prices, supplyRates, borrowRates);
    }
    
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
    
    function getPossibleCollaterals(address token, address user) external view returns (
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
            uint8[] memory tokenDecimals,
            uint256[] memory prices
        ) = this.getAllVenusMarkets();
        
        // Create arrays for return values
        collateralAddresses = new address[](tokens.length);
        symbols = new string[](tokens.length);
        decimals = new uint8[](tokens.length);
        balances = new uint256[](tokens.length); // Initialize with all zeros by default
        
        // If user address is provided and not zero, get their balances
        if (user != address(0)) {
            // Get user balances for all markets
            (uint256[] memory userBalances, ) = this.getUserBalances(vTokens, user);
            balances = userBalances;
        }
        
        // Copy token information to return arrays
        for (uint i = 0; i < tokens.length; i++) {
            collateralAddresses[i] = tokens[i];
            symbols[i] = tokenSymbols[i];
            decimals[i] = tokenDecimals[i];
        }
        
        return (collateralAddresses, balances, symbols, decimals);
    }
    
    function isCollateralSupported(address market, address collateral) external view returns (bool isSupported) {
        // Get all Venus markets information
        (
            ,  // vTokens (not needed)
            address[] memory tokens, 
            , // symbols (not needed)
            , // names (not needed)
            , // decimals (not needed)
              // prices (not needed)
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
    
    function getSupportedCollaterals(address market) external view returns (address[] memory collateralAddresses) {
        // Get all Venus markets information
        (
            ,  // vTokens (not needed)
            address[] memory tokens, 
            ,  // symbols (not needed)
            ,  // names (not needed)
            ,// decimals (not needed)
            // prices (not needed)
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
    
    function _weightedCollateralFactorBps(address user) internal view returns (uint256) {
        // Get assets directly from comptroller to avoid external self-call issues
        VTokenInterface[] memory vTokens;
        try comptroller.getAssetsIn(user) returns (VTokenInterface[] memory v) {
            vTokens = v;
        } catch {
            return 0;
        }
        
        if (vTokens.length == 0) return 0;
        
        uint256 totalCollateralValue;
        uint256 totalAllowedBorrow;

        for (uint i = 0; i < vTokens.length; i++) {
            address vTokenAddr = address(vTokens[i]);
            
            uint256 vBalance;
            try vTokens[i].balanceOf(user) returns (uint256 b) { vBalance = b; } catch { continue; }
            if (vBalance == 0) continue;

            uint256 exchangeRate;
            try vTokens[i].exchangeRateStored() returns (uint256 rate) { exchangeRate = rate; } catch { continue; }

            uint256 underlyingAmount = (vBalance * exchangeRate) / 1e18;
            
            uint256 price;
            try oracle.getUnderlyingPrice(vTokenAddr) returns (uint256 p) { price = p; } catch { continue; }
            
            uint256 collateralValue = (underlyingAmount * price) / 1e18;
            totalCollateralValue += collateralValue;

            try comptroller.markets(vTokenAddr) returns (bool, uint256 collateralFactor, bool) {
                totalAllowedBorrow += (collateralValue * collateralFactor) / 1e18;
            } catch { continue; }
        }

        if (totalCollateralValue == 0) return 0;

        return (totalAllowedBorrow * 10_000) / totalCollateralValue;
    }

    /// @notice Calculate weighted liquidation threshold (LLTV) across user's collateral positions
    /// @dev Uses Venus V4's liquidationThreshold which is higher than collateralFactor
    function _weightedLiquidationThresholdBps(address user) internal view returns (uint256) {
        // Get assets directly from comptroller to avoid external self-call issues
        VTokenInterface[] memory vTokens;
        try comptroller.getAssetsIn(user) returns (VTokenInterface[] memory v) {
            vTokens = v;
        } catch {
            return 0;
        }
        
        if (vTokens.length == 0) return 0;
        
        uint256 totalCollateralValue;
        uint256 totalLiquidationThreshold;

        for (uint i = 0; i < vTokens.length; i++) {
            address vTokenAddr = address(vTokens[i]);

            uint256 vBalance;
            try vTokens[i].balanceOf(user) returns (uint256 b) { vBalance = b; } catch { continue; }
            if (vBalance == 0) continue;

            uint256 exchangeRate;
            try vTokens[i].exchangeRateStored() returns (uint256 rate) { exchangeRate = rate; } catch { continue; }

            uint256 underlyingAmount = (vBalance * exchangeRate) / 1e18;
            
            uint256 price;
            try oracle.getUnderlyingPrice(vTokenAddr) returns (uint256 p) { price = p; } catch { continue; }
            
            uint256 collateralValue = (underlyingAmount * price) / 1e18;
            totalCollateralValue += collateralValue;

            // Try to get liquidation threshold (Venus V4), fallback to collateral factor
            uint256 liqThreshold;
            try comptroller.liquidationThreshold(vTokenAddr) returns (uint256 lt) {
                liqThreshold = lt;
            } catch {
                // Fallback: use collateral factor if liquidationThreshold not available
                try comptroller.markets(vTokenAddr) returns (bool, uint256 collateralFactor, bool) {
                    liqThreshold = collateralFactor;
                } catch {
                    continue;
                }
            }
            totalLiquidationThreshold += (collateralValue * liqThreshold) / 1e18;
        }

        if (totalCollateralValue == 0) return 0;

        return (totalLiquidationThreshold * 10_000) / totalCollateralValue;
    }

    /// @notice Returns the LTV (borrowing power) for a user in basis points
    /// @dev Uses collateralFactor which determines how much can be borrowed
    function getLtv(address /* token */, address user) external view returns (uint256) {
        if (user == address(0)) return 0;
        return _weightedCollateralFactorBps(user);
    }

    /// @notice Returns the LLTV (liquidation threshold) for a user in basis points
    /// @dev Uses liquidationThreshold which is higher than LTV - the point at which liquidation occurs
    function getMaxLtv(address /* token */, address user) external view returns (uint256) {
        if (user == address(0)) return 0;
        return _weightedLiquidationThresholdBps(user);
    }
}

