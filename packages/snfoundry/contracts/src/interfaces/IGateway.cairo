use starknet::ContractAddress;

#[derive(Drop, Serde, Copy)]
pub struct BasicInstruction {
    pub token: ContractAddress,
    pub amount: u256,
    pub user: ContractAddress,
}

#[derive(Drop, Serde)]
pub struct Deposit {
    pub basic: BasicInstruction,
    pub context: Option<Span<felt252>>
}


#[derive(Drop, Serde)]
pub struct Borrow {
    pub basic: BasicInstruction,
    pub context: Option<Span<felt252>>
}

#[derive(Drop, Serde)]
pub struct Repay {
    pub basic: BasicInstruction,
    pub context: Option<Span<felt252>>
}

#[derive(Drop, Serde)]
pub struct Withdraw {
    pub basic: BasicInstruction,
    pub context: Option<Span<felt252>>
}


#[derive(Drop, Serde)]
pub enum LendingInstruction {
    Deposit: Deposit,
    Borrow: Borrow,
    Repay: Repay,
    Withdraw: Withdraw,
}

#[starknet::interface]
pub trait ILendingInstructionProcessor<TContractState> {
    fn process_instructions(
        ref self: TContractState,
        instructions: Span<LendingInstruction>
    );
}