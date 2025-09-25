use starknet::ContractAddress;
use crate::irs_controller::types::units::{Q96, Shares, Assets};

#[derive(Copy, Drop, Serde)]
pub struct OpenPositionRequest {
    pub owner: ContractAddress,
    pub credit_meter: u8,
    pub exposure: Q96,
    pub prepaid_assets: Assets,
}

pub fn estimate_stop_index(current_index: Q96, funded_shares: Shares) -> Q96 {
    current_index + funded_shares
}
