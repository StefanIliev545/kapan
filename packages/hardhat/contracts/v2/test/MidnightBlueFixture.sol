// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { MarketParams, Market, Position, MorphoLib } from "../interfaces/morpho/IMorphoBlue.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Minimal Blue test double to exercise the existing Blue gateway in cross-protocol flows.
contract MidnightBlueFixture {
    using MorphoLib for MarketParams;
    mapping(address => mapping(address => bool)) public isAuthorized;
    mapping(bytes32 => mapping(address => Position)) private positions;
    mapping(bytes32 => Market) private states;
    function position(bytes32 id, address user) external view returns (Position memory) {
        return positions[id][user];
    }
    function market(bytes32 id) external view returns (Market memory) {
        return states[id];
    }
    function setAuthorization(address target, bool value) external {
        isAuthorized[msg.sender][target] = value;
    }
    function accrueInterest(MarketParams memory) external {}
    function supplyCollateral(MarketParams memory p, uint256 amount, address user, bytes calldata) external {
        positions[p.id()][user].collateral += uint128(amount);
        require(IERC20(p.collateralToken).transferFrom(msg.sender, address(this), amount));
    }
    function withdrawCollateral(MarketParams memory p, uint256 amount, address user, address receiver) external {
        require(msg.sender == user || isAuthorized[user][msg.sender]);
        positions[p.id()][user].collateral -= uint128(amount);
        require(positions[p.id()][user].borrowShares == 0, "Fixture must repay before withdrawing");
        require(IERC20(p.collateralToken).transfer(receiver, amount));
    }
    function borrow(
        MarketParams memory p,
        uint256 assets,
        uint256,
        address user,
        address receiver
    ) external returns (uint256, uint256) {
        require(msg.sender == user || isAuthorized[user][msg.sender]);
        require(positions[p.id()][user].collateral > 0, "No collateral");
        positions[p.id()][user].borrowShares += uint128(assets);
        states[p.id()].totalBorrowShares += uint128(assets);
        states[p.id()].totalBorrowAssets += uint128(assets);
        require(IERC20(p.loanToken).transfer(receiver, assets));
        return (assets, assets);
    }
    function repay(
        MarketParams memory p,
        uint256 assets,
        uint256 shares,
        address user,
        bytes calldata
    ) external returns (uint256, uint256) {
        uint256 amount = shares == 0 ? assets : shares;
        positions[p.id()][user].borrowShares -= uint128(amount);
        states[p.id()].totalBorrowShares -= uint128(amount);
        states[p.id()].totalBorrowAssets -= uint128(amount);
        require(IERC20(p.loanToken).transferFrom(msg.sender, address(this), amount));
        return (amount, amount);
    }
}
