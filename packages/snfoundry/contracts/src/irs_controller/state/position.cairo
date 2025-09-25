use starknet::storage::Store;
use starknet::ContractAddress;
use core::integer::u256::U256;
use crate::irs_controller::types::units::{Q96, Shares};

#[derive(Copy, Drop, Serde, Store)]
pub struct Position {
    pub owner_address: ContractAddress,
    pub is_active: bool,
    pub credit_meter_index: u8,
    pub exposure_rate: U256,
    pub meter0_scalar_q96: Q96,
    pub meter1_scalar_q96: Q96,
    pub funded_shares_on_debit_adapter: Shares,
    pub meter0_checkpoint_index_q96: Q96,
    pub meter1_checkpoint_index_q96: Q96,
    pub stop_index_q96_on_debit_meter: Q96,
    pub net_shares_in_credit_token: Shares,
    pub bucket_meter_index: u8,
    pub bucket_tick_key: u128,
    pub prev_in_bucket: u64,
    pub next_in_bucket: u64,
}

impl Position {
    pub fn new(
        owner_address: ContractAddress,
        credit_meter_index: u8,
        exposure_rate: U256,
        meter0_scalar_q96: Q96,
        meter1_scalar_q96: Q96,
        funded_shares_on_debit_adapter: Shares,
        meter0_checkpoint_index_q96: Q96,
        meter1_checkpoint_index_q96: Q96,
        stop_index_q96_on_debit_meter: Q96,
    ) -> Self {
        Position {
            owner_address,
            is_active: true,
            credit_meter_index,
            exposure_rate,
            meter0_scalar_q96,
            meter1_scalar_q96,
            funded_shares_on_debit_adapter,
            meter0_checkpoint_index_q96,
            meter1_checkpoint_index_q96,
            stop_index_q96_on_debit_meter,
            net_shares_in_credit_token: Shares(U256::from(0)),
            bucket_meter_index: 255_u8,
            bucket_tick_key: 0_u128,
            prev_in_bucket: 0_u64,
            next_in_bucket: 0_u64,
        }
    }
}
