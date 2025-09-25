use crate::irs_controller::types::units::{Assets, Q96, Shares};
use core::integer::u256::U256;

#[derive(Copy, Drop, Serde)]
pub enum MeterType {
    Time: (),
    Harvest: (),
}

pub struct TimeAdvanceInput {
    pub last_time_seconds: u64,
    pub now_seconds: u64,
    pub k_ref_assets_per_rate_per_second_q96: Q96,
}

pub fn compute_time_increment_in_q96(
    adapter_convert_assets_to_shares: fn(Assets) -> Shares,
    input: TimeAdvanceInput,
) -> Q96 {
    if input.now_seconds <= input.last_time_seconds {
        return Q96(U256::from(0));
    }
    let delta_seconds = input.now_seconds - input.last_time_seconds;
    let assets_delta = Assets(delta_seconds as u128);
    let shares = adapter_convert_assets_to_shares(assets_delta);
    Q96(shares.0)
}

pub struct HarvestAdvanceInput {
    pub previous_total_assets: Assets,
    pub current_total_assets: Assets,
    pub sum_effective_credit_rate_q96: Q96,
}

pub struct HarvestAdvanceOutput {
    pub candidate_index_q96: Q96,
    pub harvested_shares: Shares,
}

pub fn compute_harvest_candidate_index_q96(
    current_index_q96: Q96,
    adapter_convert_assets_to_shares: fn(Assets) -> Shares,
    input: HarvestAdvanceInput,
) -> HarvestAdvanceOutput {
    if input.current_total_assets.0 <= input.previous_total_assets.0 {
        return HarvestAdvanceOutput {
            candidate_index_q96: current_index_q96,
            harvested_shares: Shares(U256::from(0)),
        };
    }
    let delta_assets = input.current_total_assets.0 - input.previous_total_assets.0;
    let shares = adapter_convert_assets_to_shares(Assets(delta_assets));
    HarvestAdvanceOutput {
        candidate_index_q96: Q96(current_index_q96.0 + shares.0),
        harvested_shares: shares,
    }
}
