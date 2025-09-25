use crate::irs_controller::types::units::{Q96, Shares};

#[derive(Copy, Drop, Serde)]
pub struct SettlementOutcome {
    pub new_credit_checkpoint: Q96,
    pub credit_delta: Shares,
}

pub fn settle_to_index(current_index: Q96, accrued: Shares) -> SettlementOutcome {
    SettlementOutcome { new_credit_checkpoint: current_index, credit_delta: accrued }
}
