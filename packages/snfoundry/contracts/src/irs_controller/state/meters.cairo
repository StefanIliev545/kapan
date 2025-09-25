use crate::irs_controller::types::units::{Q96, Shares, Assets};

#[derive(Copy, Drop, Serde)]
pub enum MeterType {
    Time: (),
    Harvest: (),
}

pub fn compute_time_increment(_last: u64, _now: u64, _rate: Q96) -> Q96 {
    0
}

pub fn compute_harvest_shares(_before: Assets, _after: Assets) -> Shares {
    0
}
