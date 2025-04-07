use alexandria_math::i257::i257;
use starknet::ContractAddress;

#[derive(PartialEq, Copy, Drop, Serde)]
pub struct Position {
    collateral_shares: u256, // packed as u128 [SCALE] 
    nominal_debt: u256, // packed as u123 [SCALE]
}

#[derive(PartialEq, Copy, Drop, Serde)]
pub struct AssetConfig { //                                     | slot | packed | notes
    //                                                      | ---- | ------ | ----- 
    total_collateral_shares: u256, //       [SCALE]         | 1    | u128   |
    total_nominal_debt: u256, //            [SCALE]         | 1    | u123   |
    reserve: u256, //                       [asset scale]   | 2    | u128   |
    max_utilization: u256, //               [SCALE]         | 2    | u8     | constant percentage
    floor: u256, //                         [SCALE]         | 2    | u8     | constant decimals
    scale: u256, //                         [SCALE]         | 2    | u8     | constant decimals 
    is_legacy: bool, //                                     | 2    | u8     | constant
    last_updated: u64, //                   [seconds]       | 3    | u32    |
    last_rate_accumulator: u256, //         [SCALE]         | 3    | u64    |
    last_full_utilization_rate: u256, //    [SCALE]         | 3    | u64    |
    fee_rate: u256, //                      [SCALE]         | 3    | u8     | percentage
}

#[derive(PartialEq, Copy, Drop, Serde, starknet::Store)]
pub struct LTVConfig {
    max_ltv: u64, // [SCALE]
}

#[derive(PartialEq, Copy, Drop, Serde, Default)]
pub enum AmountType {
    #[default]
    Delta,
    Target,
}

#[derive(PartialEq, Copy, Drop, Serde, Default)]
pub enum AmountDenomination {
    #[default]
    Native,
    Assets,
}

#[derive(PartialEq, Copy, Drop, Serde, Default)]
pub struct Amount {
    amount_type: AmountType,
    denomination: AmountDenomination,
    value: i257,
}

#[derive(PartialEq, Copy, Drop, Serde, Default)]
pub struct UnsignedAmount {
    amount_type: AmountType,
    denomination: AmountDenomination,
    value: u256,
}

#[derive(PartialEq, Copy, Drop, Serde, Default)]
pub struct AssetPrice {
    value: u256,
    is_valid: bool,
}

#[derive(PartialEq, Copy, Drop, Serde)]
pub struct AssetParams {
    asset: ContractAddress,
    floor: u256, // [SCALE]
    initial_rate_accumulator: u256, // [SCALE]
    initial_full_utilization_rate: u256, // [SCALE]
    max_utilization: u256, // [SCALE]
    is_legacy: bool,
    fee_rate: u256, // [SCALE]
}

#[derive(PartialEq, Copy, Drop, Serde)]
pub struct LTVParams {
    collateral_asset_index: usize,
    debt_asset_index: usize,
    max_ltv: u64, // [SCALE]
}

#[derive(PartialEq, Copy, Drop, Serde)]
pub struct DebtCapParams {
    collateral_asset_index: usize,
    debt_asset_index: usize,
    debt_cap: u256, // [SCALE]
}

#[derive(PartialEq, Copy, Drop, Serde)]
pub struct ModifyPositionParams {
    pool_id: felt252,
    collateral_asset: ContractAddress,
    debt_asset: ContractAddress,
    user: ContractAddress,
    collateral: Amount,
    debt: Amount,
    data: Span<felt252>
}

#[derive(PartialEq, Copy, Drop, Serde)]
pub struct TransferPositionParams {
    pool_id: felt252,
    from_collateral_asset: ContractAddress,
    from_debt_asset: ContractAddress,
    to_collateral_asset: ContractAddress,
    to_debt_asset: ContractAddress,
    from_user: ContractAddress,
    to_user: ContractAddress,
    collateral: UnsignedAmount,
    debt: UnsignedAmount,
    from_data: Span<felt252>,
    to_data: Span<felt252>
}

#[derive(PartialEq, Copy, Drop, Serde)]
pub struct LiquidatePositionParams {
    pool_id: felt252,
    collateral_asset: ContractAddress,
    debt_asset: ContractAddress,
    user: ContractAddress,
    receive_as_shares: bool,
    data: Span<felt252>
}

#[derive(PartialEq, Copy, Drop, Serde)]
pub struct UpdatePositionResponse {
    collateral_delta: i257, // [asset scale]
    collateral_shares_delta: i257, // [SCALE]
    debt_delta: i257, // [asset scale]
    nominal_debt_delta: i257, // [SCALE]
    bad_debt: u256, // [asset scale]
}

#[derive(PartialEq, Copy, Drop, Serde)]
pub struct Context {
    pool_id: felt252,
    extension: ContractAddress,
    collateral_asset: ContractAddress,
    debt_asset: ContractAddress,
    collateral_asset_config: AssetConfig,
    debt_asset_config: AssetConfig,
    collateral_asset_price: AssetPrice,
    debt_asset_price: AssetPrice,
    collateral_asset_fee_shares: u256,
    debt_asset_fee_shares: u256,
    max_ltv: u64,
    user: ContractAddress,
    position: Position
}