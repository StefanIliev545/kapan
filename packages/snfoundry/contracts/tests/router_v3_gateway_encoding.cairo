use core::integer::u256;
use core::result::Result;
use starknet::contract_address_const;

use kapan::interfaces::IGateway::{
    LendingInstruction,
};
use kapan::router::token_amount::TokenAmountValue;
use kapan::router::v3::gateway_encoding::{
    GatewayEncodingError,
    encode_instruction,
};
use kapan::router::v3::instructions::{AccountInteraction};
use kapan::router::v3::resolved_instruction::{
    ResolvedBorrowInstruction,
    ResolvedDepositInstruction,
    ResolvedInstruction,
    ResolvedRepayInstruction,
    ResolvedTokenAmountInstruction,
    ResolvedWithdrawInstruction,
};

fn build_value() -> TokenAmountValue {
    TokenAmountValue {
        token: contract_address_const::<0x1>(),
        amount: u256 { low: 42, high: 0 },
    }
}

fn build_interaction() -> AccountInteraction {
    AccountInteraction::new(contract_address_const::<0x2>(), 1)
}

fn build_token_amount_instruction() -> ResolvedTokenAmountInstruction {
    ResolvedTokenAmountInstruction {
        amount: build_value(),
        interaction: build_interaction(),
    }
}

#[test]
fn encodes_borrow_instruction() {
    let resolved = ResolvedInstruction::Borrow(ResolvedBorrowInstruction {
        amount: build_token_amount_instruction(),
        recipient: contract_address_const::<0x3>(),
    });

    match encode_instruction(resolved) {
        Result::Ok(LendingInstruction::Borrow(borrow)) => {
            assert(*borrow.basic.token == contract_address_const::<0x1>(), 'borrow token mismatch');
            assert(borrow.basic.amount == u256 { low: 42, high: 0 }, 'borrow amount mismatch');
            assert(*borrow.basic.user == contract_address_const::<0x2>(), 'borrow user mismatch');
            assert(borrow.context.is_none(), 'borrow context expected none');
        }
        _ => {
            assert(0 == 1, 'expected borrow encoding');
        }
    }
}

#[test]
fn encodes_repay_instruction() {
    let resolved = ResolvedInstruction::Repay(ResolvedRepayInstruction {
        amount: build_token_amount_instruction(),
        recipient: contract_address_const::<0x4>(),
    });

    match encode_instruction(resolved) {
        Result::Ok(LendingInstruction::Repay(repay)) => {
            assert(*repay.basic.token == contract_address_const::<0x1>(), 'repay token mismatch');
            assert(repay.basic.amount == u256 { low: 42, high: 0 }, 'repay amount mismatch');
            assert(!repay.repay_all, 'repay_all default mismatch');
        }
        _ => {
            assert(0 == 1, 'expected repay encoding');
        }
    }
}

#[test]
fn encodes_deposit_instruction() {
    let resolved = ResolvedInstruction::Deposit(ResolvedDepositInstruction {
        amount: build_token_amount_instruction(),
    });

    match encode_instruction(resolved) {
        Result::Ok(LendingInstruction::Deposit(deposit)) => {
            assert(*deposit.basic.token == contract_address_const::<0x1>(), 'deposit token mismatch');
            assert(deposit.basic.amount == u256 { low: 42, high: 0 }, 'deposit amount mismatch');
        }
        _ => {
            assert(0 == 1, 'expected deposit encoding');
        }
    }
}

#[test]
fn encodes_withdraw_instruction() {
    let resolved = ResolvedInstruction::Withdraw(ResolvedWithdrawInstruction {
        amount: build_token_amount_instruction(),
        recipient: contract_address_const::<0x5>(),
    });

    match encode_instruction(resolved) {
        Result::Ok(LendingInstruction::Withdraw(withdraw)) => {
            assert(!withdraw.withdraw_all, 'withdraw_all default mismatch');
            assert(*withdraw.basic.user == contract_address_const::<0x2>(), 'withdraw user mismatch');
        }
        _ => {
            assert(0 == 1, 'expected withdraw encoding');
        }
    }
}

#[test]
fn unsupported_instruction_errors() {
    let transfer = ResolvedInstruction::Transfer(
        kapan::router::v3::resolved_instruction::ResolvedTransferInstruction {
            asset: build_value(),
            recipient: contract_address_const::<0x6>(),
        },
    );

    match encode_instruction(transfer) {
        Result::Err(error) => {
            assert(error == GatewayEncodingError::UnsupportedInstruction, 'unexpected error kind');
        }
        _ => {
            assert(0 == 1, 'expected unsupported instruction error');
        }
    }
}
