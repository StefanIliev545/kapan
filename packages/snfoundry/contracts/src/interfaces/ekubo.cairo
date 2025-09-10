use core::array::Span;
use core::integer::{i128, u128};
use core::bool;
use starknet::contract_address::ContractAddress;
use core::array::Array;

#[derive(Drop, Serde, Copy, PartialEq)]
pub struct PoolKey {
    pub token0: ContractAddress,
    pub token1: ContractAddress,
}

#[derive(Drop, Serde, Copy)]
pub struct SwapParameters {
    pub amount: i128,
    pub is_token1: bool,
    pub sqrt_ratio_limit: u128,
    pub skip_ahead: bool,
}

#[derive(Drop, Serde, Copy)]
pub struct Delta {
    pub amount0: i128,
    pub amount1: i128,
}

#[starknet::interface]
pub trait ICore<TContractState> {
    fn lock(ref self: TContractState, data: Span<felt252>) -> Array<felt252>;
    fn swap(ref self: TContractState, pool_key: PoolKey, params: SwapParameters) -> Delta;
    fn withdraw(ref self: TContractState, token: ContractAddress, to: ContractAddress, amount: u256);
    fn pay(ref self: TContractState, token: ContractAddress);
}

#[starknet::interface]
pub trait ILocker<TContractState> {
    fn locked(ref self: TContractState, id: u32, data: Span<felt252>) -> Array<felt252>;
}
