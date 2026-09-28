// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IMidnight, Market } from "../../interfaces/midnight/IMidnight.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

interface IMidnightOracle {
    function price() external view returns (uint256);
}

library MidnightRiskLib {
    /// @return value Collateral value in raw loan-token units (NOT USD).
    /// @return capacity LLTV-weighted borrowing capacity in raw loan-token units.
    function collateralValue(
        IMidnight midnight,
        Market memory market,
        bytes32 id,
        address user
    ) internal view returns (uint256 value, uint256 capacity) {
        for (uint256 i; i < market.collateralParams.length; ++i) {
            uint256 balance = midnight.collateral(id, user, i);
            if (balance == 0) continue;
            uint256 price = IMidnightOracle(market.collateralParams[i].oracle).price();
            uint256 v = Math.mulDiv(balance, price, 1e36);
            value += v;
            // Match Midnight's two downward roundings.
            capacity += Math.mulDiv(v, market.collateralParams[i].lltv, 1e18);
        }
    }
}
