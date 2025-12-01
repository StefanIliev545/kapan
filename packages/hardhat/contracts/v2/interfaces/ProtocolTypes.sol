// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

library ProtocolTypes {
    struct ProtocolInstruction {
        string protocolName;
        bytes data;
    }

    struct Output {
        address token;
        uint256 amount;
    }

    // Common lending instruction schema for gateways (deposit/withdraw/borrow/repay)
    enum LendingOp {
        Deposit,
        DepositCollateral,
        WithdrawCollateral,
        Borrow,
        Repay,
        GetBorrowBalance,
        GetSupplyBalance,
        Swap,
        SwapExactOut
    }
    struct InputPtr {
        uint256 index;
    }
    /**
     * Cross-protocol instruction.
     * - For Compound you can pass `context = abi.encode(address marketBaseToken)`
     *   which tells the gateway which Comet (market) to use. Empty means infer from token.
     */
    struct LendingInstruction {
        LendingOp op;
        address token; // underlying being acted on (base or collateral)
        address user; // end user on whose account we operate
        uint256 amount; // amount in underlying units
        bytes context; // (optional) protocol-specific blob (e.g., Compound marketBaseToken)
        InputPtr input; // (optional) pointer to prior output (UTXO); use if index < inputs.length
    }
}
