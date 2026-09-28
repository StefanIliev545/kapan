// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.30;

import { Market, Offer } from "../interfaces/midnight/IMidnight.sol";
import { IdLib } from "../gateways/midnight/vendor/IdLib.sol";
import { TickLib } from "../gateways/midnight/vendor/TickLib.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

contract MidnightTestOracle {
    uint256 public price;
    constructor(uint256 p) {
        price = p;
    }
    function setPrice(uint256 p) external {
        price = p;
    }
}

contract MidnightTestRatifier {
    function isRatified(Offer calldata, bytes calldata data, address) external pure returns (bytes32) {
        return data.length == 0 ? keccak256("morpho.midnight.callbackSuccess") : bytes32(0);
    }
}

/// @notice Deterministic test double, never for deployment. The suite can also use the pinned upstream core.
contract MockMidnight {
    mapping(bytes32 => Market) internal markets;
    mapping(address => mapping(address => bool)) public isAuthorized;
    mapping(address => mapping(bytes32 => uint128)) public consumed;
    mapping(bytes32 => mapping(address => uint128)) public debt;
    mapping(bytes32 => mapping(address => uint128)) public credit;
    mapping(bytes32 => mapping(address => mapping(uint256 => uint128))) public collateral;
    mapping(bytes32 => uint128) public withdrawable;
    mapping(bytes32 => uint256) internal fees;
    function enableLltv(uint256) external {}
    function enableLiquidationCursor(uint256) external {}
    function setFeeSetter(address) external {}
    function setMarketSettlementFee(bytes32 id, uint256, uint256 fee) external {
        fees[id] = fee;
    }
    function setConsumed(bytes32 group, uint128 amount, address user) external {
        _auth(user);
        require(amount >= consumed[user][group]);
        consumed[user][group] = amount;
    }
    function setIsAuthorized(address target, bool enabled, address user) external {
        _auth(user);
        isAuthorized[user][target] = enabled;
    }
    function _auth(address user) internal view {
        require(msg.sender == user || isAuthorized[user][msg.sender], "Unauthorized");
    }
    function touchMarket(Market memory market) public returns (bytes32 id) {
        id = IdLib.toId(market);
        markets[id] = market;
    }
    function toMarket(bytes32 id) external view returns (Market memory) {
        return markets[id];
    }
    function settlementFee(bytes32 id, uint256) external view returns (uint256) {
        return fees[id];
    }
    function updatePositionView(
        Market memory market,
        bytes32,
        address user
    ) external view returns (uint128, uint128, uint128) {
        return (credit[IdLib.toId(market)][user], 0, 0);
    }
    function supplyCollateral(Market memory market, uint256 index, uint256 amount, address user) external {
        _auth(user);
        collateral[IdLib.toId(market)][user][index] += uint128(amount);
        require(IERC20(market.collateralParams[index].token).transferFrom(msg.sender, address(this), amount));
    }
    function withdrawCollateral(
        Market memory market,
        uint256 index,
        uint256 amount,
        address user,
        address receiver
    ) external {
        _auth(user);
        bytes32 id = IdLib.toId(market);
        collateral[id][user][index] -= uint128(amount);
        require(isHealthy(market, id, user), "Unhealthy");
        require(IERC20(market.collateralParams[index].token).transfer(receiver, amount));
    }
    function repay(Market memory market, uint256 units, address user, address callback, bytes calldata) external {
        _auth(user);
        require(callback == address(0));
        bytes32 id = IdLib.toId(market);
        debt[id][user] -= uint128(units);
        withdrawable[id] += uint128(units);
        require(IERC20(market.loanToken).transferFrom(msg.sender, address(this), units));
    }
    function withdraw(Market memory market, uint256 units, address user, address receiver) external {
        _auth(user);
        bytes32 id = IdLib.toId(market);
        credit[id][user] -= uint128(units);
        withdrawable[id] -= uint128(units);
        require(IERC20(market.loanToken).transfer(receiver, units));
    }
    function take(
        Offer memory offer,
        bytes memory signature,
        uint256 units,
        address taker,
        address receiver,
        address callback,
        bytes calldata
    ) external returns (uint256 buyerAssets, uint256 sellerAssets) {
        _auth(taker);
        require(callback == address(0) && offer.callback == address(0), "Mock callbacks unsupported");
        require(block.timestamp >= offer.start && block.timestamp <= offer.expiry, "Expired");
        require(isAuthorized[offer.maker][offer.ratifier], "Ratifier unauthorized");
        require(
            MidnightTestRatifier(offer.ratifier).isRatified(offer, signature, taker) ==
                keccak256("morpho.midnight.callbackSuccess"),
            "Signature"
        );
        bytes32 id = IdLib.toId(offer.market);
        uint256 price = TickLib.tickToPrice(offer.tick);
        uint256 sellerPrice = offer.buy ? price - fees[id] : price;
        buyerAssets = Math.mulDiv(
            units,
            sellerPrice + fees[id],
            1e18,
            offer.buy ? Math.Rounding.Floor : Math.Rounding.Ceil
        );
        sellerAssets = Math.mulDiv(units, sellerPrice, 1e18, offer.buy ? Math.Rounding.Floor : Math.Rounding.Ceil);
        uint256 used = consumed[offer.maker][offer.group] +
            (offer.maxAssets == 0 ? units : (offer.buy ? buyerAssets : sellerAssets));
        require(used <= (offer.maxAssets == 0 ? offer.maxUnits : offer.maxAssets), "Consumed");
        consumed[offer.maker][offer.group] = uint128(used);
        address buyer = offer.buy ? offer.maker : taker;
        address seller = offer.buy ? taker : offer.maker;
        uint256 repaid = Math.min(units, debt[id][buyer]);
        uint256 sold = Math.min(units, credit[id][seller]);
        require(!offer.reduceOnly || (offer.buy ? units == repaid : units == sold), "Reduce only");
        require(block.timestamp <= offer.market.maturity || units == sold, "Matured");
        debt[id][buyer] -= uint128(repaid);
        credit[id][buyer] += uint128(units - repaid);
        credit[id][seller] -= uint128(sold);
        debt[id][seller] += uint128(units - sold);
        address payer = offer.buy ? buyer : msg.sender;
        require(IERC20(offer.market.loanToken).transferFrom(payer, address(this), buyerAssets - sellerAssets));
        require(
            IERC20(offer.market.loanToken).transferFrom(
                payer,
                offer.buy ? receiver : offer.receiverIfMakerIsSeller,
                sellerAssets
            )
        );
        require(isHealthy(offer.market, id, seller), "Unhealthy");
    }
    function isHealthy(Market memory market, bytes32 id, address user) public view returns (bool) {
        uint256 capacity;
        for (uint256 i; i < market.collateralParams.length; ++i) {
            uint256 value = Math.mulDiv(
                collateral[id][user][i],
                MidnightTestOracle(market.collateralParams[i].oracle).price(),
                1e36
            );
            capacity += Math.mulDiv(value, market.collateralParams[i].lltv, 1e18);
        }
        return capacity >= debt[id][user];
    }
}

/// @notice Deterministic venue behind the production OneInchGateway/Adapter, never used in production.
contract MidnightTestSwapVenue {
    function swap(address src, address dst, uint256 numerator, uint256 denominator) external {
        uint256 amount = IERC20(src).balanceOf(msg.sender);
        require(IERC20(src).transferFrom(msg.sender, address(this), amount));
        require(IERC20(dst).transfer(msg.sender, Math.mulDiv(amount, numerator, denominator)));
    }
}

contract MidnightTestFlashLender {
    function flashLoan(
        address receiver,
        IERC20[] calldata tokens,
        uint256[] calldata amounts,
        bytes calldata data
    ) external {
        uint256 beforeBalance = tokens[0].balanceOf(address(this));
        require(tokens[0].transfer(receiver, amounts[0]));
        uint256[] memory fees = new uint256[](1);
        fees[0] = amounts[0] / 1000;
        IMidnightTestFlashReceiver(receiver).receiveFlashLoan(tokens, amounts, fees, data);
        require(tokens[0].balanceOf(address(this)) >= beforeBalance + fees[0], "Flash repayment missing");
    }
}
interface IMidnightTestFlashReceiver {
    function receiveFlashLoan(IERC20[] calldata, uint256[] calldata, uint256[] calldata, bytes calldata) external;
}
