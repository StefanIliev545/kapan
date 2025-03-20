// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AaveGateway} from "./gateways/AaveGateway.sol";
import {CompoundGateway} from "./gateways/CompoundGateway.sol";
import {VenusGateway} from "./gateways/VenusGateway.sol";
import {IGateway} from "./interfaces/IGateway.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract OptimalInterestRateFinder is Ownable {
    // Store gateways in a mapping for dynamic registration
    mapping(string => IGateway) public gateways;
    string[] public registeredGatewayNames;
    
    // We'll use 1e8 as our fixed point precision.
    // When displaying the result, divide the returned number by 1e8.
    uint256 private constant PRECISION = 1e8;

    // Events for gateway registration
    event GatewayRegistered(string name, address gateway);
    event GatewayRemoved(string name);

    constructor() Ownable(msg.sender) {
        // Empty constructor - gateways will be registered separately
    }
    
    /**
     * @notice Register a gateway with the interest rate finder
     * @param name The name of the gateway (e.g., "aave", "compound", "venus")
     * @param gateway The address of the gateway
     */
    function registerGateway(string calldata name, address gateway) external onlyOwner {
        require(address(gateways[name]) == address(0), "Gateway already registered");
        gateways[name] = IGateway(gateway);
        registeredGatewayNames.push(name);
        emit GatewayRegistered(name, gateway);
    }
    
    /**
     * @notice Remove a gateway from the interest rate finder
     * @param name The name of the gateway to remove
     */
    function removeGateway(string calldata name) external onlyOwner {
        require(address(gateways[name]) != address(0), "Gateway not registered");
        
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
    function convertVenusRateToAPY(uint256 rate) public pure returns (uint256) {
        uint256 SECONDS_PER_YEAR = 60 * 60 * 24 * 365; // 31536000 seconds
        return (rate * SECONDS_PER_YEAR * 100 * PRECISION) / 1e18;
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
            IGateway gateway = gateways[protocol];
            
            // Skip if gateway is not set
            if (address(gateway) == address(0)) continue;
            
            try gateway.getSupplyRate(_token) returns (uint256 rateRaw, bool success) {
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
            IGateway gateway = gateways[protocol];
            
            // Skip if gateway is not set
            if (address(gateway) == address(0)) continue;
            
            try gateway.getBorrowRate(_token) returns (uint256 rateRaw, bool success) {
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
            
            IGateway gateway = gateways[protocol];
            if (address(gateway) == address(0)) {
                success[i] = false;
                continue;
            }
            
            try gateway.getSupplyRate(_token) returns (uint256 rateRaw, bool rateSuccess) {
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
            
            IGateway gateway = gateways[protocol];
            if (address(gateway) == address(0)) {
                success[i] = false;
                continue;
            }
            
            try gateway.getBorrowRate(_token) returns (uint256 rateRaw, bool rateSuccess) {
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
