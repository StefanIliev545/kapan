use starknet::ContractAddress;
use crate::irs_controller::types::units::{Assets, Shares};

#[starknet::interface]
pub trait I4626Adapter<TContractState> {
    fn asset(self: @TContractState) -> ContractAddress;
    fn shares_token(self: @TContractState) -> ContractAddress;
    fn total_assets(self: @TContractState) -> u128;
    fn convert_to_shares(self: @TContractState, assets: u128) -> core::integer::u256::U256;
    fn convert_to_assets(self: @TContractState, shares: core::integer::u256::U256) -> u128;
    fn pull_deposit_from(
        ref self: TContractState,
        payer: ContractAddress,
        assets: u128,
        receiver: ContractAddress,
    ) -> core::integer::u256::U256;
    fn payout(
        ref self: TContractState,
        to: ContractAddress,
        shares: core::integer::u256::U256,
        in_assets: bool,
    );
}

pub use self::I4626AdapterDispatcher;
pub use self::I4626AdapterDispatcherTrait;

pub fn convert_assets_to_shares(adapter_address: ContractAddress, assets: Assets) -> Shares {
    let dispatcher = I4626AdapterDispatcher { contract_address: adapter_address };
    let shares = dispatcher.convert_to_shares(assets.0);
    Shares(shares)
}
