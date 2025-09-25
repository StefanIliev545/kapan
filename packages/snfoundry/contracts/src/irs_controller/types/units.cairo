mod units {
    use core::integer::u256::U256;
    use starknet::storage::Store;

    #[derive(Copy, Drop, Serde, Store)]
    pub struct Q96(pub U256);

    #[derive(Copy, Drop, Serde, Store)]
    pub struct Shares(pub U256);

    #[derive(Copy, Drop, Serde, Store)]
    pub struct Assets(pub u128);

    pub fn q96_inner(value: Q96) -> U256 {
        value.0
    }

    pub fn shares_inner(value: Shares) -> U256 {
        value.0
    }

    pub fn assets_inner(value: Assets) -> u128 {
        value.0
    }

    pub fn q96_from_u128(value: u128) -> Q96 {
        Q96(U256::from(value.into()))
    }

    pub fn shares_from_u128(value: u128) -> Shares {
        Shares(U256::from(value.into()))
    }

    pub fn assets_from_u128(value: u128) -> Assets {
        Assets(value)
    }
}
