// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AaveGateway} from "./gateways/AaveGateway.sol";
import {CompoundGateway} from "./gateways/CompoundGateway.sol";

contract OptimalInterestRateFinder {
    AaveGateway public aaveGateway;
    CompoundGateway public compoundGateway;

    // We'll use 1e8 as our fixed point precision.
    // When displaying the result, divide the returned number by 1e8.
    uint256 private constant PRECISION = 1e8;

    constructor(address _aaveGateway, address _compoundGateway) {
        aaveGateway = AaveGateway(_aaveGateway);
        compoundGateway = CompoundGateway(_compoundGateway);
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

    function findOptimalSupplyRate(address _token) public view returns (string memory, uint256) {
        (uint256 aaveSupplyRateRaw, bool aaveSuccess) = aaveGateway.getSupplyRate(_token);
        (uint256 compoundSupplyRateRaw, bool compoundSuccess) = compoundGateway.getSupplyRate(_token);
        uint256 aaveSupplyRate = convertAaveRateToAPY(aaveSupplyRateRaw);
        uint256 compoundSupplyRate = convertCompoundRateToAPR(compoundSupplyRateRaw);
        if (aaveSuccess && compoundSuccess) {
            if (aaveSupplyRate > compoundSupplyRate) {
                return ("aave", aaveSupplyRate);
            } else {
                return ("compound", compoundSupplyRate);
            }
        } else if (aaveSuccess) {
            return ("aave", aaveSupplyRate);
        } else {
            return ("compound", compoundSupplyRate);
        }
    }

    

    function findOptimalBorrowRate(address _token) public view returns (string memory, uint256) {
        (uint256 aaveBorrowRateRaw, bool aaveSuccess) = aaveGateway.getBorrowRate(_token);
        (uint256 compoundBorrowRateRaw, bool compoundSuccess) = compoundGateway.getBorrowRate(_token);
        uint256 aaveBorrowRate = convertAaveRateToAPY(aaveBorrowRateRaw);
        uint256 compoundBorrowRate = convertCompoundRateToAPR(compoundBorrowRateRaw);
        if (aaveSuccess && compoundSuccess) {
            if (aaveBorrowRate < compoundBorrowRate) {
                return ("aave", aaveBorrowRate);
            } else {
                return ("compound", compoundBorrowRate);
            }
        } else if (aaveSuccess) {
            return ("aave", aaveBorrowRate);
        } else {
            return ("compound", compoundBorrowRate);
        }
    }

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

    function getAllProtocolRates(address _token) public view returns (
        string[] memory protocols,
        uint256[] memory rates,
        bool[] memory success
    ) {
        // Initialize arrays with size 2 (Aave and Compound)
        protocols = new string[](2);
        rates = new uint256[](2);
        success = new bool[](2);

        // Get Aave rates
        protocols[0] = "Aave V3";
        (uint256 aaveRateRaw, bool aaveSuccess) = aaveGateway.getSupplyRate(_token);
        rates[0] = convertAaveRateToAPY(aaveRateRaw);
        success[0] = aaveSuccess;

        // Get Compound rates
        protocols[1] = "Compound V3";
        (uint256 compoundRateRaw, bool compoundSuccess) = compoundGateway.getSupplyRate(_token);
        rates[1] = convertCompoundRateToAPR(compoundRateRaw);
        success[1] = compoundSuccess;
    }


    function getAllProtocolBorrowRates(address _token) public view returns (
        string[] memory protocols,
        uint256[] memory rates,
        bool[] memory success
    ) {
        // Initialize arrays with size 2 (Aave and Compound)
        protocols = new string[](2);
        rates = new uint256[](2);
        success = new bool[](2);

        // Get Aave rates
        protocols[0] = "Aave V3";
        (uint256 aaveRateRaw, bool aaveSuccess) = aaveGateway.getBorrowRate(_token);
        rates[0] = convertAaveRateToAPY(aaveRateRaw);
        success[0] = aaveSuccess;

        // Get Compound rates
        protocols[1] = "Compound V3";
        (uint256 compoundRateRaw, bool compoundSuccess) = compoundGateway.getBorrowRate(_token);
        rates[1] = convertCompoundRateToAPR(compoundRateRaw);
        success[1] = compoundSuccess;
    }
}
