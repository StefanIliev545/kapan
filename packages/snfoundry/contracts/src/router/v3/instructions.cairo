use core::array::Span;
use starknet::ContractAddress;

use crate::router::token_amount::TokenAmount;

#[derive(Copy, Drop, Serde)]
pub struct ProtocolCallContext {
    pub data: Option<Span<felt252>>,
}

#[derive(Copy, Drop, Serde)]
pub struct AccountInteraction {
    pub account: ContractAddress,
    pub protocol: felt252,
    pub context: ProtocolCallContext,
}

impl AccountInteraction {
    pub fn new(account: ContractAddress, protocol: felt252) -> AccountInteraction {
        AccountInteraction {
            account,
            protocol,
            context: ProtocolCallContext { data: Option::None },
        }
    }
}

#[derive(Copy, Drop, Serde)]
pub struct TokenAmountInstruction {
    pub asset: TokenAmount,
    pub interaction: AccountInteraction,
}

#[derive(Copy, Drop, Serde)]
pub struct BorrowInstruction {
    pub amount: TokenAmountInstruction,
    pub recipient: ContractAddress,
}

#[derive(Copy, Drop, Serde)]
pub struct RepayInstruction {
    pub amount: TokenAmountInstruction,
    pub recipient: ContractAddress,
}

#[derive(Copy, Drop, Serde)]
pub struct DepositInstruction {
    pub amount: TokenAmountInstruction,
}

#[derive(Copy, Drop, Serde)]
pub struct WithdrawInstruction {
    pub amount: TokenAmountInstruction,
    pub recipient: ContractAddress,
}

#[derive(Copy, Drop, Serde)]
pub struct SwapInstruction {
    pub source: TokenAmountInstruction,
    pub destination_token: ContractAddress,
    pub recipient: ContractAddress,
}

#[derive(Copy, Drop, Serde)]
pub struct TransferInstruction {
    pub asset: TokenAmount,
    pub recipient: ContractAddress,
}

#[derive(Copy, Drop, Serde)]
pub struct RedeemInstruction {
    pub amount: TokenAmountInstruction,
    pub recipient: ContractAddress,
}

#[derive(Copy, Drop, Serde)]
pub struct BorrowBalanceInstruction {
    pub interaction: AccountInteraction,
    pub asset: ContractAddress,
}

#[derive(Copy, Drop, Serde)]
pub struct FlashLoanInstruction {
    pub interaction: AccountInteraction,
    pub assets: Span<TokenAmount>,
    pub nested: Span<Instruction>,
}

#[derive(Copy, Drop, Serde)]
pub enum Instruction {
    Borrow(BorrowInstruction),
    Repay(RepayInstruction),
    Deposit(DepositInstruction),
    Withdraw(WithdrawInstruction),
    Swap(SwapInstruction),
    Transfer(TransferInstruction),
    Redeem(RedeemInstruction),
    BorrowBalance(BorrowBalanceInstruction),
    FlashLoan(FlashLoanInstruction),
}
