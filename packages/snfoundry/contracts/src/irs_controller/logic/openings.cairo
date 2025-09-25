use starknet::ContractAddress;
use core::integer::u256::U256;
use crate::irs_controller::types::units::{Assets, Q96, Shares};

pub struct OpenInput {
    pub owner_address: ContractAddress,
    pub credit_meter_index: u8,
    pub exposure_rate: U256,
    pub meter0_scalar_q96: Q96,
    pub meter1_scalar_q96: Q96,
    pub prepay_assets: Assets,
    pub funding_payer_address: ContractAddress,
}

pub fn compute_stop_index_on_debit_meter(
    debit_checkpoint_index_q96: Q96,
    funded_shares_on_debit_adapter: Shares,
    _exposure_rate: U256,
    _scalar: Q96,
) -> Q96 {
    Q96(debit_checkpoint_index_q96.0 + funded_shares_on_debit_adapter.0)
}
