use crate::irs_controller::state::position::Position;
use crate::irs_controller::types::units::{Q96, Shares};
use core::integer::u256::U256;

pub struct SettlementContext {
    pub current_index_meter0_q96: Q96,
    pub current_index_meter1_q96: Q96,
    pub optional_cap_on_meter_index: Option<(u8, Q96)>,
}

pub struct SettlementResult {
    pub credit_shares_delta: Shares,
    pub debit_shares_delta: Shares,
    pub new_checkpoint_meter0_q96: Q96,
    pub new_checkpoint_meter1_q96: Q96,
    pub crossed_stop: bool,
}

pub fn apply_for_position(
    _position: Position,
    ctx: SettlementContext,
) -> SettlementResult {
    let credit_shares_delta = Shares(U256::from(0));
    let debit_shares_delta = Shares(U256::from(0));
    let mut new_ckpt0 = ctx.current_index_meter0_q96;
    let mut new_ckpt1 = ctx.current_index_meter1_q96;

    if let Option::Some((meter, cap)) = ctx.optional_cap_on_meter_index {
        if meter == 0_u8 {
            new_ckpt0 = cap;
        } else {
            new_ckpt1 = cap;
        }
    }

    SettlementResult {
        credit_shares_delta,
        debit_shares_delta,
        new_checkpoint_meter0_q96: new_ckpt0,
        new_checkpoint_meter1_q96: new_ckpt1,
        crossed_stop: false,
    }
}
