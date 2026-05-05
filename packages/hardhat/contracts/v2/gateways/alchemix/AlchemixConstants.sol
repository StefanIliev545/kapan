// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title  AlchemixConstants
/// @notice Single source of truth for Alchemix protocol identifiers used by the gateway,
///         the view router, and downstream triggers. Centralised so a future "alchemix-v4"
///         (or hot-fix re-deploy) is one constant change instead of dozens of hardcoded
///         strings scattered across the contracts and deploy scripts.
///
/// Mirror file in TypeScript: `packages/nextjs/utils/alchemix/protocolConstants.ts`.
/// Keep both in sync — the chain identifies the gateway by `keccak256(GATEWAY_NAME)`, so
/// any divergence between TS and Solidity instantly produces silently-broken orders.
library AlchemixConstants {
    /// @notice Registry key under `KapanRouter.gateways[...]` and `KapanViewRouter.gateways[...]`.
    string internal constant GATEWAY_NAME = "alchemix-v3";

    /// @notice 4-byte protocol id used by triggers (LimitPrice, Ltv, AutoLeverage) and the
    ///         view-router's unified dispatch.
    bytes4 internal constant PROTOCOL_ID = bytes4(keccak256(bytes(GATEWAY_NAME)));
}
