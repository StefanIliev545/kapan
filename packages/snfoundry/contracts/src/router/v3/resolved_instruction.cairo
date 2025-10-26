use core::array::{Array, Span};
use starknet::ContractAddress;

use crate::router::token_amount::TokenAmountValue;

use super::instructions::{
    AccountInteraction,
    BorrowBalanceInstruction,
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

#[derive(Drop, Serde)]
pub struct ResolvedTokenAmountInstruction {
    pub amount: TokenAmountValue,
    pub interaction: AccountInteraction,
}

impl ResolvedTokenAmountInstruction {
    pub fn from_unresolved(
        unresolved: TokenAmountInstruction,
        amount: TokenAmountValue,
    ) -> ResolvedTokenAmountInstruction {
        ResolvedTokenAmountInstruction { amount, interaction: unresolved.interaction }
    }
}

#[derive(Drop, Serde)]
pub struct ResolvedBorrowInstruction {
    pub amount: ResolvedTokenAmountInstruction,
    pub recipient: ContractAddress,
}

#[derive(Drop, Serde)]
pub struct ResolvedRepayInstruction {
    pub amount: ResolvedTokenAmountInstruction,
    pub recipient: ContractAddress,
}

#[derive(Drop, Serde)]
pub struct ResolvedDepositInstruction {
    pub amount: ResolvedTokenAmountInstruction,
}

#[derive(Drop, Serde)]
pub struct ResolvedWithdrawInstruction {
    pub amount: ResolvedTokenAmountInstruction,
    pub recipient: ContractAddress,
}

#[derive(Drop, Serde)]
pub struct ResolvedSwapInstruction {
    pub source: ResolvedTokenAmountInstruction,
    pub destination_token: ContractAddress,
    pub recipient: ContractAddress,
}

#[derive(Drop, Serde)]
pub struct ResolvedTransferInstruction {
    pub asset: TokenAmountValue,
    pub recipient: ContractAddress,
}

#[derive(Drop, Serde)]
pub struct ResolvedRedeemInstruction {
    pub amount: ResolvedTokenAmountInstruction,
    pub recipient: ContractAddress,
}

#[derive(Drop, Serde)]
pub struct ResolvedBorrowBalanceInstruction {
    pub interaction: AccountInteraction,
    pub asset: ContractAddress,
}

#[derive(Drop, Serde)]
pub struct ResolvedFlashLoanInstruction {
    pub interaction: AccountInteraction,
    pub assets: Array<TokenAmountValue>,
    pub nested: Span<Instruction>,
}

#[derive(Drop, Serde)]
pub enum ResolvedInstruction {
    Borrow(ResolvedBorrowInstruction),
    Repay(ResolvedRepayInstruction),
    Deposit(ResolvedDepositInstruction),
    Withdraw(ResolvedWithdrawInstruction),
    Swap(ResolvedSwapInstruction),
    Transfer(ResolvedTransferInstruction),
    Redeem(ResolvedRedeemInstruction),
    BorrowBalance(ResolvedBorrowBalanceInstruction),
    FlashLoan(ResolvedFlashLoanInstruction),
}
