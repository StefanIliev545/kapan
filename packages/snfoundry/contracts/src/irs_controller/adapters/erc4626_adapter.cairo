use starknet::ContractAddress;
use crate::irs_controller::types::units::{Assets, Shares};

#[starknet::interface]
pub trait I4626Adapter<TContractState> {
    fn asset(self: @TContractState) -> ContractAddress;
    fn shares_token(self: @TContractState) -> ContractAddress;
    fn convert_to_shares(self: @TContractState, assets: Assets) -> Shares;
}
