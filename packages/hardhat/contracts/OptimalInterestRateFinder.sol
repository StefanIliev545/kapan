// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AaveGateway} from "./gateways/AaveGateway.sol";
import {CompoundGateway} from "./gateways/CompoundGateway.sol";
import {VenusGateway} from "./gateways/VenusGateway.sol";
import {IGateway} from "./interfaces/IGateway.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

// Minimal interface for rate queries (works with both v1 and v2 gateways)
interface IRateProvider {
    function getSupplyRate(address token) external view returns (uint256, bool);
    function getBorrowRate(address token) external view returns (uint256, bool);
}

contract OptimalInterestRateFinder is Ownable {
    // Store gateways in a mapping for dynamic registration
    // Using address instead of IGateway to support both v1 and v2 view gateways
    mapping(string => address) public gateways;
    string[] public registeredGatewayNames;
    
    // We'll use 1e8 as our fixed point precision.
    // When displaying the result, divide the returned number by 1e8.
    uint256 private constant PRECISION = 1e8;
    // We'll use a higher internal scale to avoid rounding to zero.
    uint256 private constant HIGH_SCALE = 1e27;

    // Events for gateway registration
    event GatewayRegistered(string name, address gateway);
    event GatewayRemoved(string name);

    constructor(address owner) Ownable(owner) {
        // Empty constructor - gateways will be registered separately
    }
    
    /**
     * @notice Register a gateway with the interest rate finder
     * @param name The name of the gateway (e.g., "aave", "compound", "venus")
     * @param gateway The address of the gateway
     */
    function registerGateway(string calldata name, address gateway) external onlyOwner {
        require(gateway != address(0), "Gateway address cannot be zero");
        if (gateways[name] != address(0)) {
            removeGateway(name);
        }

        gateways[name] = gateway;
        registeredGatewayNames.push(name);
        emit GatewayRegistered(name, gateway);
    }
    
    /**
     * @notice Remove a gateway from the interest rate finder
     * @param name The name of the gateway to remove
     */
    function removeGateway(string calldata name) public onlyOwner {
        require(gateways[name] != address(0), "Gateway not registered");
        
        delete gateways[name];
        
        // Remove from the array of names
        for (uint i = 0; i < registeredGatewayNames.length; i++) {
            if (keccak256(bytes(registeredGatewayNames[i])) == keccak256(bytes(name))) {
                // Move the last element to the current position and then pop
                if (i != registeredGatewayNames.length - 1) {
                    registeredGatewayNames[i] = registeredGatewayNames[registeredGatewayNames.length - 1];
                }
                registeredGatewayNames.pop();
                break;
            }
        }
        
        emit GatewayRemoved(name);
    }
    
    /**
     * @notice Get all registered gateway names
     * @return Array of registered gateway names
     */
    function getRegisteredGateways() external view returns (string[] memory) {
        return registeredGatewayNames;
    }

    /**
     * @notice Converts Compound's per‑second rate (scaled by 1e18) to an APR percentage.
     * @dev The JS conversion is: (ratePerSecond * SECONDS_PER_YEAR * 100) / 1e18.
     *      To preserve 8 decimals, we multiply by PRECISION.
     *      The returned value is in fixed‑point format (divide by PRECISION to get the percentage).
     *      For example, if the real APR is 1.48%, this function returns 148000000.
     */
    function convertCompoundRateToAPR(uint256 ratePerSecond) public pure returns (uint256) {
        uint256 SECONDS_PER_YEAR = 60 * 60 * 24 * 365; // 31536000 seconds
        return (ratePerSecond * SECONDS_PER_YEAR * 100 * PRECISION) / 1e18;
    }

    /**
     * @notice Converts Aave's rate (originally converted in JS as rate/1e25) to an APY percentage.
     * @dev To preserve 8 decimals, we multiply by PRECISION.
     *      The returned value is in fixed‑point format (divide by PRECISION to get the percentage).
     *      For example, if the real APY is 0.02%, this function returns 2000000.
     */
    function convertAaveRateToAPY(uint256 rate) public pure returns (uint256) {
        return (rate * PRECISION) / 1e25;
    }
    
    /**
     * @notice Converts Venus's APY rate (scaled by 1e18) to an APY percentage.
     * @dev Similar to the Compound conversion, but with different scaling.
     *      The returned value is in fixed‑point format (divide by PRECISION to get the percentage).
     */
    
    function convertVenusRateToAPY(uint256 ratePerBlock) public pure returns (uint256) {
        uint256 blocksPerDay = 60 * 60 * 24; // 86400 blocks per day
        uint256 daysPerYear = 365;

        // Calculate the daily increment in HIGH_SCALE precision.
        // dailyIncrement = (ratePerBlock * blocksPerDay * HIGH_SCALE) / 1e18
        uint256 dailyIncrement = (ratePerBlock * blocksPerDay * HIGH_SCALE) / 1e18;
        // Daily growth factor (in HIGH_SCALE fixed-point): 1 + dailyIncrement
        uint256 dailyFactor = HIGH_SCALE + dailyIncrement;
        
        // Compound the daily factor for (daysPerYear - 1) days.
        uint256 compounded = rpow(dailyFactor, daysPerYear - 1, HIGH_SCALE);
        
        // The APY (in the same fixed-point scale) is the excess growth: compounded - HIGH_SCALE.
        uint256 apyFixed = compounded > HIGH_SCALE ? compounded - HIGH_SCALE : 0;
        
        // Convert to a percentage and scale to PRECISION (1e8):
        // That is, APY (%) = (apyFixed / HIGH_SCALE) * 100.
        return (apyFixed * 100 * PRECISION) / HIGH_SCALE;
    }

    function rpow(uint256 x, uint256 n, uint256 base) internal pure returns (uint256 result) {
        result = base;
        for (uint256 i = 0; i < n; i++) {
            // Multiply, then round by adding half the base before dividing.
            result = (result * x + base / 2) / base;
        }
    }


    
    /**
     * @notice Converts a protocol rate to a standardized APY percentage
     * @param protocol The protocol name ("aave", "compound", "venus")
     * @param rate The raw rate from the protocol
     * @return The standardized rate for comparison
     */
    function convertRateToStandardized(string memory protocol, uint256 rate) public pure returns (uint256) {
        // Convert the rate based on the protocol
        if (strcmp(protocol, "aave")) {
            return convertAaveRateToAPY(rate);
        } else if (strcmp(protocol, "compound")) {
            return convertCompoundRateToAPR(rate);
        } else if (strcmp(protocol, "venus")) {
            return convertVenusRateToAPY(rate);
        } else {
            revert("Unsupported protocol");
        }
    }
    
    /**
     * @notice Compare two strings
     * @param a First string
     * @param b Second string
     * @return True if strings are equal, false otherwise
     */
    function strcmp(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }

    /**
     * @notice Find the optimal supply rate across all registered gateways
     * @param _token The token address to check
     * @return The protocol name and the standardized supply rate
     */
    function findOptimalSupplyRate(address _token) public view returns (string memory, uint256) {
        require(registeredGatewayNames.length > 0, "No gateways registered");
        
        string memory bestProtocol = "";
        uint256 bestRate = 0;
        bool foundValidRate = false;
        
        // Iterate through all registered gateways
        for (uint i = 0; i < registeredGatewayNames.length; i++) {
            string memory protocol = registeredGatewayNames[i];
            address gatewayAddr = gateways[protocol];
            
            // Skip if gateway is not set
            if (gatewayAddr == address(0)) continue;
            
            // Try to call getSupplyRate - works with both v1 and v2 view gateways
            try IRateProvider(gatewayAddr).getSupplyRate(_token) returns (uint256 rateRaw, bool success) {
                if (success) {
                    uint256 standardizedRate = convertRateToStandardized(protocol, rateRaw);
                    if (!foundValidRate || standardizedRate > bestRate) {
                        bestProtocol = protocol;
                        bestRate = standardizedRate;
                        foundValidRate = true;
                    }
                }
            } catch {
                // Skip if the call fails
                continue;
            }
        }
        
        require(foundValidRate, "No valid rates found");
        return (bestProtocol, bestRate);
    }

    /**
     * @notice Find the optimal borrow rate across all registered gateways
     * @param _token The token address to check
     * @return The protocol name and the standardized borrow rate
     */
    function findOptimalBorrowRate(address _token) public view returns (string memory, uint256) {
        require(registeredGatewayNames.length > 0, "No gateways registered");
        
        string memory bestProtocol = "";
        uint256 bestRate = type(uint256).max; // Start with maximum value for borrow rate
        bool foundValidRate = false;
        
        // Iterate through all registered gateways
        for (uint i = 0; i < registeredGatewayNames.length; i++) {
            string memory protocol = registeredGatewayNames[i];
            address gatewayAddr = gateways[protocol];
            
            // Skip if gateway is not set
            if (gatewayAddr == address(0)) continue;
            
            // Try to call getBorrowRate - works with both v1 and v2 view gateways
            try IRateProvider(gatewayAddr).getBorrowRate(_token) returns (uint256 rateRaw, bool success) {
                if (success) {
                    uint256 standardizedRate = convertRateToStandardized(protocol, rateRaw);
                    if (!foundValidRate || standardizedRate < bestRate) {
                        bestProtocol = protocol;
                        bestRate = standardizedRate;
                        foundValidRate = true;
                    }
                }
            } catch {
                // Skip if the call fails
                continue;
            }
        }
        
        require(foundValidRate, "No valid rates found");
        return (bestProtocol, bestRate);
    }

    /**
     * @notice Find optimal interest rates for multiple tokens
     * @param _tokens Array of token addresses
     * @return Array of protocol names and standardized rates
     */
    function multiFindOptimalInterestRate(address[] calldata _tokens)
        public
        view
        returns (string[] memory, uint256[] memory)
    {
        string[] memory optimalProtocols = new string[](_tokens.length);
        uint256[] memory optimalInterestRates = new uint256[](_tokens.length);
        for (uint256 i = 0; i < _tokens.length; i++) {
            (string memory optimalProtocol, uint256 optimalInterestRate) = findOptimalSupplyRate(_tokens[i]);
            optimalProtocols[i] = optimalProtocol;
            optimalInterestRates[i] = optimalInterestRate;
        }
        return (optimalProtocols, optimalInterestRates);
    }

    /**
     * @notice Get all rates for a token across all registered protocols
     * @param _token The token address to check
     * @return protocols Array of protocol names
     * @return rates Array of standardized rates
     * @return success Array indicating if each rate was retrieved successfully
     */
    function getAllProtocolRates(address _token) public view returns (
        string[] memory protocols,
        uint256[] memory rates,
        bool[] memory success
    ) {
        uint256 count = registeredGatewayNames.length;
        protocols = new string[](count);
        rates = new uint256[](count);
        success = new bool[](count);

        for (uint i = 0; i < count; i++) {
            string memory protocol = registeredGatewayNames[i];
            protocols[i] = protocol;
            
            address gatewayAddr = gateways[protocol];
            if (gatewayAddr == address(0)) {
                success[i] = false;
                continue;
            }
            
            try IRateProvider(gatewayAddr).getSupplyRate(_token) returns (uint256 rateRaw, bool rateSuccess) {
                if (rateSuccess) {
                    rates[i] = convertRateToStandardized(protocol, rateRaw);
                    success[i] = true;
                } else {
                    success[i] = false;
                }
            } catch {
                success[i] = false;
            }
        }
    }

    /**
     * @notice Get all borrow rates for a token across all registered protocols
     * @param _token The token address to check
     * @return protocols Array of protocol names
     * @return rates Array of standardized borrow rates
     * @return success Array indicating if each rate was retrieved successfully
     */
    function getAllProtocolBorrowRates(address _token) public view returns (
        string[] memory protocols,
        uint256[] memory rates,
        bool[] memory success
    ) {
        uint256 count = registeredGatewayNames.length;
        protocols = new string[](count);
        rates = new uint256[](count);
        success = new bool[](count);

        for (uint i = 0; i < count; i++) {
            string memory protocol = registeredGatewayNames[i];
            protocols[i] = protocol;
            
            address gatewayAddr = gateways[protocol];
            if (gatewayAddr == address(0)) {
                success[i] = false;
                continue;
            }
            
            try IRateProvider(gatewayAddr).getBorrowRate(_token) returns (uint256 rateRaw, bool rateSuccess) {
                if (rateSuccess) {
                    rates[i] = convertRateToStandardized(protocol, rateRaw);
                    success[i] = true;
                } else {
                    success[i] = false;
                }
            } catch {
                success[i] = false;
            }
        }
    }
}
