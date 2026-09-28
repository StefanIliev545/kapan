// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.30;

import { IMidnight, Market } from "../../interfaces/midnight/IMidnight.sol";
import { MidnightTypes as T } from "./MidnightTypes.sol";
import { MidnightRiskLib, IMidnightOracle } from "./MidnightRiskLib.sol";
import { IdLib } from "./vendor/IdLib.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

contract MorphoMidnightGatewayView {
    IMidnight public immutable midnight;
    error InvalidContext();
    error WrongToken();
    error InvalidOraclePrice();

    struct PositionView {
        uint256 debt;
        uint256 credit;
        uint256 pendingFee;
        uint256 collateralValue; // Raw loan-token units, not USD.
        uint256 borrowCapacity;
        uint256 ltvBps;
        uint256 liquidationLtvBps; // Weighted across all of this user's collateral slots.
        uint256 healthFactor;
        uint256 maturity;
        bool pastMaturity;
    }

    constructor(address midnight_) {
        require(midnight_ != address(0), "midnight=0");
        midnight = IMidnight(midnight_);
    }

    function getPosition(bytes32 id, address user) public view returns (PositionView memory p) {
        Market memory market = _market(id);
        p.debt = midnight.debt(id, user);
        (uint128 credit, uint128 pendingFee, ) = midnight.updatePositionView(market, id, user);
        p.credit = credit;
        p.pendingFee = pendingFee;
        (p.collateralValue, p.borrowCapacity) = MidnightRiskLib.collateralValue(midnight, market, id, user);
        p.ltvBps = p.collateralValue == 0
            ? (p.debt == 0 ? 0 : type(uint256).max)
            : Math.mulDiv(p.debt, 10000, p.collateralValue, Math.Rounding.Ceil);
        p.liquidationLtvBps = p.collateralValue == 0 ? 0 : Math.mulDiv(p.borrowCapacity, 10000, p.collateralValue);
        p.healthFactor = p.debt == 0 ? type(uint256).max : Math.mulDiv(p.borrowCapacity, 1e18, p.debt);
        p.maturity = market.maturity;
        p.pastMaturity = block.timestamp > market.maturity;
    }

    function getCurrentLtvBps(bytes32 id, address user) external view returns (uint256) {
        return getPosition(id, user).ltvBps;
    }

    /// @notice Values normalized to 8 decimals in the LOAN token unit of account.
    /// As with Blue, these are only USD values when the loan token is worth one USD.
    function getPositionValue(
        bytes32 id,
        address user
    ) external view returns (uint256 collateralValue, uint256 debtValue) {
        PositionView memory p = getPosition(id, user);
        uint256 scale = 10 ** IERC20Metadata(_market(id).loanToken).decimals();
        return (Math.mulDiv(p.collateralValue, 1e8, scale), Math.mulDiv(p.debt, 1e8, scale));
    }

    function getBorrowBalance(bytes32 id, address user) external view returns (uint256) {
        _market(id);
        return midnight.debt(id, user);
    }

    function getSupplyBalance(bytes32 id, uint256 index, address user) external view returns (uint256) {
        Market memory market = _market(id);
        if (index == T.CREDIT) {
            (uint128 credit, , ) = midnight.updatePositionView(market, id, user);
            return credit;
        }
        if (index >= market.collateralParams.length) revert InvalidContext();
        return midnight.collateral(id, user, index);
    }

    function getOraclePrice(bytes32 id, uint256 index) public view returns (uint256) {
        Market memory market = _market(id);
        if (index >= market.collateralParams.length) revert InvalidContext();
        uint256 price = IMidnightOracle(market.collateralParams[index].oracle).price();
        if (price == 0) revert InvalidOraclePrice();
        return price;
    }

    function getPairOraclePrice(
        bytes32 id,
        uint256 index,
        address collateralToken,
        address loanToken
    ) external view returns (uint256) {
        Market memory market = _market(id);
        if (
            index >= market.collateralParams.length ||
            collateralToken != market.collateralParams[index].token ||
            loanToken != market.loanToken
        ) revert WrongToken();
        return getOraclePrice(id, index);
    }

    function getAssetPrice(bytes32 id, uint256 index, address token) external view returns (uint256) {
        Market memory market = _market(id);
        if (token == market.loanToken) return 1e8;
        if (index >= market.collateralParams.length || token != market.collateralParams[index].token)
            revert WrongToken();
        uint256 collateralScale = 10 ** IERC20Metadata(token).decimals();
        uint256 loanScale = 10 ** IERC20Metadata(market.loanToken).decimals();
        // Preserve precision before the final normalization to an 8-decimal loan-token price.
        return Math.mulDiv(getOraclePrice(id, index), collateralScale, 1e28 * loanScale);
    }

    function _market(bytes32 id) internal view returns (Market memory market) {
        market = midnight.toMarket(id);
        if (market.midnight != address(midnight) || market.chainId != block.chainid || IdLib.toId(market) != id) {
            revert InvalidContext();
        }
    }
}
