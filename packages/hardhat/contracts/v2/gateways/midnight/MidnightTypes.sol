// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { Offer } from "../../interfaces/midnight/IMidnight.sol";

/// @notice LendingInstruction.context = abi.encode(marketId, collateralIndex, abi.encode(Trade)).
/// Non-trading operations use empty tradeData. View contexts need only (marketId, collateralIndex).
library MidnightTypes {
    string internal constant NAME = "morpho-midnight";
    bytes4 internal constant PROTOCOL_ID = bytes4(keccak256("morpho-midnight"));
    // Select lender credit, rather than collateral, for GetSupplyBalance/WithdrawCollateral.
    uint256 internal constant CREDIT = type(uint256).max;
    uint256 internal constant MAX_TAKES = 32;

    struct Take {
        Offer offer;
        bytes ratifierData;
        uint256 maxUnits;
    }

    struct Trade {
        uint256 deadline;
        uint256 maxUnits; // Total units across all fills; mandatory for borrow and lend.
        uint256 minUnits; // Mandatory minimum received for Deposit (lending).
        uint256 priceLimit; // Net minimum proceeds/unit for Borrow; maximum cost/unit for Deposit (WAD).
        uint256 maxApr; // Borrow simple APR cap (WAD), evaluated at execution. Max uint explicitly disables.
        uint256 minHealthFactor; // Borrow health floor (WAD); zero means protocol minimum.
        address planProvider; // Zero uses inline takes. Otherwise selects this publisher's planKey.
        bytes32 planKey;
        Take[] takes;
    }
}
