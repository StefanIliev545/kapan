// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// Re-export all CoW Protocol interfaces
import { GPv2Order } from "./GPv2Order.sol";
import { IConditionalOrder, IConditionalOrderGenerator, PollTryNextBlock, PollTryAtBlock, PollTryAtEpoch, PollNever, OrderNotValid, OrderNotReady } from "./IConditionalOrder.sol";
import { IComposableCoW, IValueFactory } from "./IComposableCoW.sol";
import { IERC1271, ERC1271_MAGIC_VALUE } from "./IERC1271.sol";
import { IGPv2Settlement } from "./IGPv2Settlement.sol";
