use alexandria_math::i257::i257;
use core::array::Span;
use core::bool;
use starknet::ContractAddress;

#[derive(PartialEq, Copy, Drop, Serde)]
pub struct Position {
    pub collateral_shares: u256, // packed as u128 [SCALE] 
    pub nominal_debt: u256 // packed as u123 [SCALE]
}

#[derive(PartialEq, Copy, Drop, Serde)]
pub struct AssetConfig { 
    pub total_collateral_shares: u256, //       [SCALE]         
    pub total_nominal_debt: u256, //            [SCALE]         
    pub reserve: u256, //                       [asset scale]   
    pub max_utilization: u256, //               [SCALE]         
    pub floor: u256, //                         [SCALE]         
    pub scale: u256, //                         [SCALE]         
    pub is_legacy: bool, //                                     
    pub last_updated: u64, //                   [seconds]       
    pub last_rate_accumulator: u256, //         [SCALE]         
    pub last_full_utilization_rate: u256, //    [SCALE]         
    pub fee_rate: u256, //                      [SCALE]         
    pub fee_shares: u256, //                    [SCALE] - V2 addition
}

#[derive(PartialEq, Copy, Drop, Serde, starknet::Store)]
pub struct LTVConfig {
    max_ltv: u64 // [SCALE]
}

#[derive(PartialEq, Copy, Drop, Serde, Default)]
pub struct Amount {
    pub denomination: AmountDenomination,
    pub value: i257,
}

#[derive(PartialEq, Copy, Drop, Serde, Default)]
pub enum AmountDenomination {
    #[default]
    Native,
    Assets,
}

#[derive(PartialEq, Copy, Drop, Serde, Default)]
pub struct AssetPrice {
    pub value: u256,
    pub is_valid: bool,
}

#[derive(PartialEq, Copy, Drop, Serde)]
pub struct AssetParams {
    asset: ContractAddress,
    floor: u256, // [SCALE]
    initial_rate_accumulator: u256, // [SCALE]
    initial_full_utilization_rate: u256, // [SCALE]
    max_utilization: u256, // [SCALE]
    is_legacy: bool,
    fee_rate: u256 // [SCALE]
}

#[derive(PartialEq, Copy, Drop, Serde)]
pub struct LTVParams {
    collateral_asset_index: usize,
    debt_asset_index: usize,
    max_ltv: u64 // [SCALE]
}

// V2: Removed pool_id and data fields
#[derive(PartialEq, Copy, Drop, Serde)]
pub struct ModifyPositionParams {
    pub collateral_asset: ContractAddress,
    pub debt_asset: ContractAddress,
    pub user: ContractAddress,
    pub collateral: Amount,
    pub debt: Amount,
}

// V2: Removed pool_id, data, and receive_as_shares fields
#[derive(PartialEq, Copy, Drop, Serde)]
pub struct LiquidatePositionParams {
    collateral_asset: ContractAddress,
    debt_asset: ContractAddress,
    user: ContractAddress,
}

#[derive(PartialEq, Copy, Drop, Serde)]
pub struct UpdatePositionResponse {
    pub collateral_delta: i257, // [asset scale]
    pub collateral_shares_delta: i257, // [SCALE]
    pub debt_delta: i257, // [asset scale]
    pub nominal_debt_delta: i257, // [SCALE]
    pub bad_debt: u256 // [asset scale]
}

#[derive(PartialEq, Copy, Drop, Serde)]
pub struct Context {
    pub collateral_asset: ContractAddress,
    pub debt_asset: ContractAddress,
    pub collateral_asset_config: AssetConfig,
    pub debt_asset_config: AssetConfig,
    pub collateral_asset_price: AssetPrice,
    pub debt_asset_price: AssetPrice,
    pub max_ltv: u64,
    pub user: ContractAddress,
    pub position: Position,
}

#[starknet::interface]
pub trait IERC20Symbol<TContractState> {
    fn symbol(self: @TContractState) -> felt252;
}

// V2 Pool Interface - replaces singleton pattern
#[starknet::interface]
pub trait IPool<TContractState> {
    fn asset_config_unsafe(
        self: @TContractState, asset: ContractAddress,
    ) -> (AssetConfig, u256);
    fn asset_config(
        ref self: TContractState, asset: ContractAddress,
    ) -> (AssetConfig, u256);
    fn ltv_config(
        self: @TContractState,
        collateral_asset: ContractAddress,
        debt_asset: ContractAddress,
    ) -> LTVConfig;
    fn position_unsafe(
        self: @TContractState,
        collateral_asset: ContractAddress,
        debt_asset: ContractAddress,
        user: ContractAddress,
    ) -> (Position, u256, u256);
    fn position(
        ref self: TContractState,
        collateral_asset: ContractAddress,
        debt_asset: ContractAddress,
        user: ContractAddress,
    ) -> (Position, u256, u256);
    fn check_collateralization_unsafe(
        self: @TContractState,
        collateral_asset: ContractAddress,
        debt_asset: ContractAddress,
        user: ContractAddress,
    ) -> (bool, u256, u256);
    fn check_collateralization(
        ref self: TContractState,
        collateral_asset: ContractAddress,
        debt_asset: ContractAddress,
        user: ContractAddress,
    ) -> (bool, u256, u256);
    fn rate_accumulator_unsafe(
        self: @TContractState, asset: ContractAddress,
    ) -> u256;
    fn rate_accumulator(ref self: TContractState, asset: ContractAddress) -> u256;
    fn utilization_unsafe(self: @TContractState, asset: ContractAddress) -> u256;
    fn utilization(ref self: TContractState, asset: ContractAddress) -> u256;
    fn delegation(
        self: @TContractState,
        delegator: ContractAddress,
        delegatee: ContractAddress,
    ) -> bool;
    fn calculate_debt(
        self: @TContractState, nominal_debt: i257, rate_accumulator: u256, asset_scale: u256,
    ) -> u256;
    fn calculate_nominal_debt(
        self: @TContractState, debt: i257, rate_accumulator: u256, asset_scale: u256,
    ) -> u256;
    fn calculate_collateral_shares_unsafe(
        self: @TContractState, asset: ContractAddress, collateral: i257,
    ) -> u256;
    fn calculate_collateral_shares(
        ref self: TContractState, asset: ContractAddress, collateral: i257,
    ) -> u256;
    fn calculate_collateral_unsafe(
        self: @TContractState, asset: ContractAddress, collateral_shares: i257,
    ) -> u256;
    fn calculate_collateral(
        ref self: TContractState, asset: ContractAddress, collateral_shares: i257,
    ) -> u256;
    fn deconstruct_collateral_amount_unsafe(
        self: @TContractState,
        collateral_asset: ContractAddress,
        debt_asset: ContractAddress,
        user: ContractAddress,
        collateral: Amount,
    ) -> (i257, i257);
    fn deconstruct_collateral_amount(
        ref self: TContractState,
        collateral_asset: ContractAddress,
        debt_asset: ContractAddress,
        user: ContractAddress,
        collateral: Amount,
    ) -> (i257, i257);
    fn deconstruct_debt_amount_unsafe(
        self: @TContractState,
        collateral_asset: ContractAddress,
        debt_asset: ContractAddress,
        user: ContractAddress,
        debt: Amount,
    ) -> (i257, i257);
    fn deconstruct_debt_amount(
        ref self: TContractState,
        collateral_asset: ContractAddress,
        debt_asset: ContractAddress,
        user: ContractAddress,
        debt: Amount,
    ) -> (i257, i257);
    fn context_unsafe(
        self: @TContractState,
        collateral_asset: ContractAddress,
        debt_asset: ContractAddress,
        user: ContractAddress,
    ) -> Context;
    fn context(
        ref self: TContractState,
        collateral_asset: ContractAddress,
        debt_asset: ContractAddress,
        user: ContractAddress,
    ) -> Context;
    fn modify_position(
        ref self: TContractState, params: ModifyPositionParams,
    ) -> UpdatePositionResponse;
    fn liquidate_position(ref self: TContractState, params: LiquidatePositionParams);
    fn modify_delegation(
        ref self: TContractState, delegatee: ContractAddress, delegation: bool,
    );
    fn flash_loan(
        ref self: TContractState,
        receiver: ContractAddress,
        asset: ContractAddress,
        amount: u256,
        is_legacy: bool,
        data: Span<felt252>,
    );
}

#[starknet::interface]
pub trait IERC4626<TContractState> {
    fn asset(self: @TContractState) -> ContractAddress;
    fn total_assets(self: @TContractState) -> u256;
    fn convert_to_shares(self: @TContractState, assets: u256) -> u256;
    fn convert_to_assets(self: @TContractState, shares: u256) -> u256;
    fn max_deposit(self: @TContractState, receiver: ContractAddress) -> u256;
    fn preview_deposit(self: @TContractState, assets: u256) -> u256;
    fn deposit(ref self: TContractState, assets: u256, receiver: ContractAddress) -> u256;
    fn max_mint(self: @TContractState, receiver: ContractAddress) -> u256;
    fn preview_mint(self: @TContractState, shares: u256) -> u256;
    fn mint(ref self: TContractState, shares: u256, receiver: ContractAddress) -> u256;
    fn max_withdraw(self: @TContractState, owner: ContractAddress) -> u256;
    fn preview_withdraw(self: @TContractState, assets: u256) -> u256;
    fn withdraw(
        ref self: TContractState, assets: u256, receiver: ContractAddress, owner: ContractAddress,
    ) -> u256;
    fn max_redeem(self: @TContractState, owner: ContractAddress) -> u256;
    fn preview_redeem(self: @TContractState, shares: u256) -> u256;
    fn redeem(
        ref self: TContractState, shares: u256, receiver: ContractAddress, owner: ContractAddress,
    ) -> u256;
}

#[starknet::interface]
pub trait IFlashloanReceiver<TContractState> {
    fn on_flash_loan(
        ref self: TContractState, sender: ContractAddress, asset: ContractAddress, amount: u256, data: Span<felt252>
    );
}
