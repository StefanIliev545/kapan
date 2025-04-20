use starknet::contract_address::ContractAddress;

#[starknet::interface]
pub trait LentDebtTokenABI<TContractState> {
    // ILentDebtToken
    fn mint(ref self: TContractState, to: ContractAddress, amount: u256);
    fn borrow(ref self: TContractState, to: ContractAddress, amount: u256);
    fn burn(ref self: TContractState, from: ContractAddress, to: ContractAddress, amount: u256) -> u256;
    fn repay(ref self: TContractState, from: ContractAddress, amount: u256) -> u256;
    fn interest_rate_model(self: @TContractState) -> ContractAddress;
    fn allowance(self: @TContractState, owner: ContractAddress, spender: ContractAddress) -> u256;
    fn approve(ref self: TContractState, spender: ContractAddress, amount: u256) -> bool;
    fn transfer_from(
        ref self: TContractState, sender: ContractAddress, recipient: ContractAddress, amount: u256
    ) -> u256;
    fn approve_delegation(
        ref self: TContractState,
        delegatee: ContractAddress,
        amount: u256,
        delegator: ContractAddress
    ) -> bool;
}