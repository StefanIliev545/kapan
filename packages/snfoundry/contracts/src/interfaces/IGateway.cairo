use starknet::ContractAddress;

#[derive(Drop, Serde, Copy)]
pub struct BasicInstruction {
    pub token: ContractAddress,
    pub amount: u256,
    pub user: ContractAddress,
}

#[derive(Drop, Serde, Copy)]
pub struct InstructionOutput {
    pub token: ContractAddress,
    pub balance: u256,
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
    pub repay_all: bool,
    pub context: Option<Span<felt252>>,
}

#[derive(Drop, Serde, Copy)]
pub struct Withdraw {
    pub basic: BasicInstruction,
    pub withdraw_all: bool,
    pub context: Option<Span<felt252>>,
}

#[derive(Drop, Serde, Copy)]
pub struct Redeposit {
    pub token: ContractAddress,
    pub target_instruction_index: u32,
    pub user: ContractAddress,
    pub context: Option<Span<felt252>>,
}

#[derive(Drop, Serde, Copy)]
pub struct Reborrow {
    pub token: ContractAddress,
    pub target_instruction_index: u32,
    pub approval_amount: u256, //amount to approve for the borrow; not actual borrow.
    pub user: ContractAddress,
    pub context: Option<Span<felt252>>,
}

#[derive(Drop, Serde, Copy)]
pub struct Reswap {
    pub exact_out_index: u32,
    pub max_in_index: u32,
    pub user: ContractAddress,
    pub should_pay_out: bool,
    pub should_pay_in: bool,
    pub context: Option<Span<felt252>>,
}

#[derive(Drop, Serde, Copy)]
pub struct Swap {
    pub token_in: ContractAddress,
    pub token_out: ContractAddress,
    pub exact_out: u256,
    pub max_in: u256,
    pub user: ContractAddress,
    pub should_pay_out: bool,
    pub should_pay_in: bool,
    pub context: Option<Span<felt252>>,
}

#[derive(Drop, Serde, Copy)]
pub enum LendingInstruction {
    Deposit: Deposit,
    Borrow: Borrow,
    Repay: Repay,
    Withdraw: Withdraw,
    Redeposit: Redeposit,
    Reborrow: Reborrow,
    Swap: Swap,
    Reswap: Reswap,
}

#[starknet::interface]
pub trait ILendingInstructionProcessor<TContractState> {
    fn process_instructions(
        ref self: TContractState,
        instructions: Span<LendingInstruction>
    ) -> Span<Span<InstructionOutput>>;
    fn get_authorizations_for_instructions(ref self: TContractState, instructions: Span<LendingInstruction>, rawSelectors: bool) -> Span<(ContractAddress, felt252, Array<felt252>)>;
    fn get_flash_loan_amount(ref self: TContractState, repay: Repay) -> u256;
}

#[starknet::interface]
pub trait InterestRateView<TContractState> {
    fn get_borrow_rate(ref self: TContractState, token_address: ContractAddress) -> u256;
    fn get_supply_rate(ref self: TContractState, token_address: ContractAddress) -> u256;
}
