use core::array::{Array, ArrayTrait, Span};
use core::result::Result;

use crate::router::token_amount::{
    TokenAmount,
    TokenAmountResolutionError,
    TokenAmountValue,
};

use super::instructions::{
    BorrowInstruction,
    DepositInstruction,
    FlashLoanInstruction,
    Instruction,
    RedeemInstruction,
    RepayInstruction,
    SwapInstruction,
    TokenAmountInstruction,
    TransferInstruction,
    WithdrawInstruction,
};
use super::resolved_instruction::{
    ResolvedBorrowInstruction,
    ResolvedDepositInstruction,
    ResolvedFlashLoanInstruction,
    ResolvedInstruction,
    ResolvedRedeemInstruction,
    ResolvedRepayInstruction,
    ResolvedSwapInstruction,
    ResolvedTokenAmountInstruction,
    ResolvedTransferInstruction,
    ResolvedWithdrawInstruction,
};
use super::state::InstructionOutputsState;

fn resolve_token_amount_instruction(
    state: @InstructionOutputsState,
    instruction: TokenAmountInstruction,
) -> Result<ResolvedTokenAmountInstruction, TokenAmountResolutionError> {
    match state.resolve_token_amount(instruction.asset) {
        Result::Ok(value) => Result::Ok(
            ResolvedTokenAmountInstruction::from_unresolved(instruction, value),
        ),
        Result::Err(error) => Result::Err(error),
    }
}

fn resolve_flash_loan_assets(
    state: @InstructionOutputsState,
    assets: Span<TokenAmount>,
) -> Result<Array<TokenAmountValue>, TokenAmountResolutionError> {
    let mut resolved: Array<TokenAmountValue> = ArrayTrait::new();
    for asset in assets {
        match state.resolve_token_amount(*asset) {
            Result::Ok(value) => {
                resolved.append(value);
            }
            Result::Err(error) => {
                return Result::Err(error);
            }
        }
    }
    Result::Ok(resolved)
}

fn resolve_borrow_instruction(
    state: @InstructionOutputsState,
    instruction: BorrowInstruction,
) -> Result<ResolvedInstruction, TokenAmountResolutionError> {
    match resolve_token_amount_instruction(state, instruction.amount) {
        Result::Ok(amount) => Result::Ok(ResolvedInstruction::Borrow(ResolvedBorrowInstruction {
            amount,
            recipient: instruction.recipient,
        })),
        Result::Err(error) => Result::Err(error),
    }
}

fn resolve_repay_instruction(
    state: @InstructionOutputsState,
    instruction: RepayInstruction,
) -> Result<ResolvedInstruction, TokenAmountResolutionError> {
    match resolve_token_amount_instruction(state, instruction.amount) {
        Result::Ok(amount) => Result::Ok(ResolvedInstruction::Repay(ResolvedRepayInstruction {
            amount,
            recipient: instruction.recipient,
        })),
        Result::Err(error) => Result::Err(error),
    }
}

fn resolve_deposit_instruction(
    state: @InstructionOutputsState,
    instruction: DepositInstruction,
) -> Result<ResolvedInstruction, TokenAmountResolutionError> {
    match resolve_token_amount_instruction(state, instruction.amount) {
        Result::Ok(amount) => Result::Ok(ResolvedInstruction::Deposit(ResolvedDepositInstruction {
            amount,
        })),
        Result::Err(error) => Result::Err(error),
    }
}

fn resolve_withdraw_instruction(
    state: @InstructionOutputsState,
    instruction: WithdrawInstruction,
) -> Result<ResolvedInstruction, TokenAmountResolutionError> {
    match resolve_token_amount_instruction(state, instruction.amount) {
        Result::Ok(amount) => Result::Ok(ResolvedInstruction::Withdraw(ResolvedWithdrawInstruction {
            amount,
            recipient: instruction.recipient,
        })),
        Result::Err(error) => Result::Err(error),
    }
}

fn resolve_swap_instruction(
    state: @InstructionOutputsState,
    instruction: SwapInstruction,
) -> Result<ResolvedInstruction, TokenAmountResolutionError> {
    match resolve_token_amount_instruction(state, instruction.source) {
        Result::Ok(source) => Result::Ok(ResolvedInstruction::Swap(ResolvedSwapInstruction {
            source,
            destination_token: instruction.destination_token,
            recipient: instruction.recipient,
        })),
        Result::Err(error) => Result::Err(error),
    }
}

fn resolve_transfer_instruction(
    state: @InstructionOutputsState,
    instruction: TransferInstruction,
) -> Result<ResolvedInstruction, TokenAmountResolutionError> {
    match state.resolve_token_amount(instruction.asset) {
        Result::Ok(asset) => Result::Ok(ResolvedInstruction::Transfer(ResolvedTransferInstruction {
            asset,
            recipient: instruction.recipient,
        })),
        Result::Err(error) => Result::Err(error),
    }
}

fn resolve_redeem_instruction(
    state: @InstructionOutputsState,
    instruction: RedeemInstruction,
) -> Result<ResolvedInstruction, TokenAmountResolutionError> {
    match resolve_token_amount_instruction(state, instruction.amount) {
        Result::Ok(amount) => Result::Ok(ResolvedInstruction::Redeem(ResolvedRedeemInstruction {
            amount,
            recipient: instruction.recipient,
        })),
        Result::Err(error) => Result::Err(error),
    }
}

fn resolve_flash_loan_instruction(
    state: @InstructionOutputsState,
    instruction: FlashLoanInstruction,
) -> Result<ResolvedInstruction, TokenAmountResolutionError> {
    match resolve_flash_loan_assets(state, instruction.assets) {
        Result::Ok(assets) => Result::Ok(ResolvedInstruction::FlashLoan(
            ResolvedFlashLoanInstruction {
                interaction: instruction.interaction,
                assets,
                nested: instruction.nested,
            },
        )),
        Result::Err(error) => Result::Err(error),
    }
}

pub fn resolve_instruction(
    state: @InstructionOutputsState,
    instruction: Instruction,
) -> Result<ResolvedInstruction, TokenAmountResolutionError> {
    match instruction {
        Instruction::Borrow(value) => resolve_borrow_instruction(state, *value),
        Instruction::Repay(value) => resolve_repay_instruction(state, *value),
        Instruction::Deposit(value) => resolve_deposit_instruction(state, *value),
        Instruction::Withdraw(value) => resolve_withdraw_instruction(state, *value),
        Instruction::Swap(value) => resolve_swap_instruction(state, *value),
        Instruction::Transfer(value) => resolve_transfer_instruction(state, *value),
        Instruction::Redeem(value) => resolve_redeem_instruction(state, *value),
        Instruction::BorrowBalance(value) => Result::Ok(ResolvedInstruction::BorrowBalance(
            super::resolved_instruction::ResolvedBorrowBalanceInstruction {
                interaction: (*value).interaction,
                asset: (*value).asset,
            },
        )),
        Instruction::FlashLoan(value) => resolve_flash_loan_instruction(state, *value),
    }
}
