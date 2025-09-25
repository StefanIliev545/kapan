use crate::irs_controller::types::units::{Q96, Shares};

pub fn add(lhs: Q96, rhs: Q96) -> Q96 {
    lhs + rhs
}

pub fn scale_shares(rate: Q96, scalar: Q96) -> Shares {
    rate * scalar
}
