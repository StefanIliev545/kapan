use core::array::Span;
use core::result::Result;

use crate::interfaces::IGateway::{
    BasicInstruction,
    Borrow,
    Deposit,
    LendingInstruction,
    Repay,
    Withdraw,
};
use crate::router::token_amount::TokenAmountValue;

use super::instructions::{AccountInteraction, ProtocolCallContext};
use super::resolved_instruction::{
    ResolvedBorrowInstruction,
    ResolvedDepositInstruction,
    ResolvedInstruction,
    ResolvedRepayInstruction,
    ResolvedWithdrawInstruction,
};

#[derive(Copy, Drop, Serde)]
pub enum GatewayEncodingError {
    UnsupportedInstruction,
}

fn encode_basic_instruction(
    value: TokenAmountValue,
    interaction: AccountInteraction,
) -> BasicInstruction {
    BasicInstruction {
        token: value.token,
        amount: value.amount,
        user: interaction.account,
    }
}

fn encode_context(context: ProtocolCallContext) -> Option<Span<felt252>> {
    context.data
}

fn encode_borrow(instruction: ResolvedBorrowInstruction) -> LendingInstruction {
    let basic = encode_basic_instruction(
        instruction.amount.amount,
        instruction.amount.interaction,
    );
    LendingInstruction::Borrow(Borrow {
        basic,
        context: encode_context(instruction.amount.interaction.context),
    })
}

fn encode_repay(instruction: ResolvedRepayInstruction) -> LendingInstruction {
    let basic = encode_basic_instruction(
        instruction.amount.amount,
        instruction.amount.interaction,
    );
    LendingInstruction::Repay(Repay {
        basic,
        repay_all: false,
        context: encode_context(instruction.amount.interaction.context),
    })
}

fn encode_deposit(instruction: ResolvedDepositInstruction) -> LendingInstruction {
    let basic = encode_basic_instruction(
        instruction.amount.amount,
        instruction.amount.interaction,
    );
    LendingInstruction::Deposit(Deposit {
        basic,
        context: encode_context(instruction.amount.interaction.context),
    })
}

fn encode_withdraw(instruction: ResolvedWithdrawInstruction) -> LendingInstruction {
    let basic = encode_basic_instruction(
        instruction.amount.amount,
        instruction.amount.interaction,
    );
    LendingInstruction::Withdraw(Withdraw {
        basic,
        withdraw_all: false,
        context: encode_context(instruction.amount.interaction.context),
    })
}

pub fn encode_instruction(
    instruction: ResolvedInstruction,
) -> Result<LendingInstruction, GatewayEncodingError> {
    match instruction {
        ResolvedInstruction::Borrow(value) => Result::Ok(encode_borrow(value)),
        ResolvedInstruction::Repay(value) => Result::Ok(encode_repay(value)),
        ResolvedInstruction::Deposit(value) => Result::Ok(encode_deposit(value)),
        ResolvedInstruction::Withdraw(value) => Result::Ok(encode_withdraw(value)),
        _ => Result::Err(GatewayEncodingError::UnsupportedInstruction),
    }
}
