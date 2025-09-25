use core::integer::u256::{u256_add, u256_mul, U256};
use crate::irs_controller::types::units::{Q96, Shares};

pub fn mul_q96_u256(value: U256, scalar: Q96) -> U256 {
    let (high, low) = u256_mul(value, scalar.0);
    assert(high.is_zero(), 'mul overflow');
    low
}

pub fn add_q96(lhs: Q96, rhs: Q96) -> Q96 {
    Q96(u256_add(lhs.0, rhs.0))
}

pub fn shares_from_mul(rate: U256, scalar: Q96) -> Shares {
    let raw = mul_q96_u256(rate, scalar);
    Shares(raw)
}
