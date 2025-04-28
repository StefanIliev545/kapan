use starknet::ContractAddress;

#[derive(Drop, Serde, Copy)]
pub struct BasicInstruction {
    pub token: ContractAddress,
    pub amount: u256,
    pub user: ContractAddress,
}

#[derive(Drop, Serde, Copy)]
pub struct Deposit {
    pub basic: BasicInstruction,
    pub context: Option<Span<felt252>>,
}


#[derive(Drop, Serde, Copy)]
pub struct Borrow {
    pub basic: BasicInstruction,
    pub context: Option<Span<felt252>>,
}

#[derive(Drop, Serde, Copy)]
pub struct Repay {
    pub basic: BasicInstruction,
    pub context: Option<Span<felt252>>,
}

#[derive(Drop, Serde, Copy)]
pub struct Withdraw {
    pub basic: BasicInstruction,
    pub context: Option<Span<felt252>>,
}


#[derive(Drop, Serde, Copy)]
pub enum LendingInstruction {
    Deposit: Deposit,
    Borrow: Borrow,
    Repay: Repay,
    Withdraw: Withdraw,
}

#[starknet::interface]
pub trait ILendingInstructionProcessor<TContractState> {
    fn process_instructions(ref self: TContractState, instructions: Span<LendingInstruction>);
    fn get_authorizations_for_instructions(ref self: TContractState, instructions: Span<LendingInstruction>) -> Span<(ContractAddress, felt252, Array<felt252>)>;
}

#[starknet::interface]
pub trait InterestRateView<TContractState> {
    fn get_borrow_rate(ref self: TContractState, token_address: ContractAddress) -> u256;
    fn get_supply_rate(ref self: TContractState, token_address: ContractAddress) -> u256;
}
