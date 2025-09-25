use starknet::ContractAddress;
use crate::irs_controller::types::units::{Q96, Shares};

pub struct Position {
    pub owner: ContractAddress,
    pub credit_meter: u8,
    pub exposure: Q96,
    pub funded_shares: Shares,
}
