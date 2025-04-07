use starknet::ContractAddress;
use core::array::Span;
use core::bool;
use crate::interfaces::vesu_data::{
    AssetConfig,
    LTVConfig,
    ModifyPositionParams,
    Position,
    UpdatePositionResponse,
    TransferPositionParams,
    Amount,
    Context,
    AssetParams,
    LTVParams,
};
use alexandria_math::i257::i257;


#[starknet::interface]
pub trait ISingleton<TContractState> {
    fn creator_nonce(self: @TContractState, creator: ContractAddress) -> felt252;
    fn extension(self: @TContractState, pool_id: felt252) -> ContractAddress;
    fn asset_config_unsafe(self: @TContractState, pool_id: felt252, asset: ContractAddress) -> (AssetConfig, u256);
    fn asset_config(ref self: TContractState, pool_id: felt252, asset: ContractAddress) -> (AssetConfig, u256);
    fn ltv_config(
        self: @TContractState, pool_id: felt252, collateral_asset: ContractAddress, debt_asset: ContractAddress
    ) -> LTVConfig;
    fn position_unsafe(
        self: @TContractState,
        pool_id: felt252,
        collateral_asset: ContractAddress,
        debt_asset: ContractAddress,
        user: ContractAddress
    ) -> (Position, u256, u256);
    fn position(
        ref self: TContractState,
        pool_id: felt252,
        collateral_asset: ContractAddress,
        debt_asset: ContractAddress,
        user: ContractAddress
    ) -> (Position, u256, u256);
    fn check_collateralization_unsafe(
        self: @TContractState,
        pool_id: felt252,
        collateral_asset: ContractAddress,
        debt_asset: ContractAddress,
        user: ContractAddress
    ) -> (bool, u256, u256);
    fn check_collateralization(
        ref self: TContractState,
        pool_id: felt252,
        collateral_asset: ContractAddress,
        debt_asset: ContractAddress,
        user: ContractAddress
    ) -> (bool, u256, u256);
    fn rate_accumulator_unsafe(self: @TContractState, pool_id: felt252, asset: ContractAddress) -> u256;
    fn rate_accumulator(ref self: TContractState, pool_id: felt252, asset: ContractAddress) -> u256;
    fn utilization_unsafe(self: @TContractState, pool_id: felt252, asset: ContractAddress) -> u256;
    fn utilization(ref self: TContractState, pool_id: felt252, asset: ContractAddress) -> u256;
    fn delegation(
        self: @TContractState, pool_id: felt252, delegator: ContractAddress, delegatee: ContractAddress
    ) -> bool;
    fn calculate_pool_id(self: @TContractState, caller_address: ContractAddress, nonce: felt252) -> felt252;
    fn calculate_debt(self: @TContractState, nominal_debt: i257, rate_accumulator: u256, asset_scale: u256) -> u256;
    fn calculate_nominal_debt(self: @TContractState, debt: i257, rate_accumulator: u256, asset_scale: u256) -> u256;
    fn calculate_collateral_shares_unsafe(
        self: @TContractState, pool_id: felt252, asset: ContractAddress, collateral: i257
    ) -> u256;
    fn calculate_collateral_shares(
        ref self: TContractState, pool_id: felt252, asset: ContractAddress, collateral: i257
    ) -> u256;
    fn calculate_collateral_unsafe(
        self: @TContractState, pool_id: felt252, asset: ContractAddress, collateral_shares: i257
    ) -> u256;
    fn calculate_collateral(
        ref self: TContractState, pool_id: felt252, asset: ContractAddress, collateral_shares: i257
    ) -> u256;
    fn deconstruct_collateral_amount_unsafe(
        self: @TContractState,
        pool_id: felt252,
        collateral_asset: ContractAddress,
        debt_asset: ContractAddress,
        user: ContractAddress,
        collateral: Amount,
    ) -> (i257, i257);
    fn deconstruct_collateral_amount(
        ref self: TContractState,
        pool_id: felt252,
        collateral_asset: ContractAddress,
        debt_asset: ContractAddress,
        user: ContractAddress,
        collateral: Amount,
    ) -> (i257, i257);
    fn deconstruct_debt_amount_unsafe(
        self: @TContractState,
        pool_id: felt252,
        collateral_asset: ContractAddress,
        debt_asset: ContractAddress,
        user: ContractAddress,
        debt: Amount,
    ) -> (i257, i257);
    fn deconstruct_debt_amount(
        ref self: TContractState,
        pool_id: felt252,
        collateral_asset: ContractAddress,
        debt_asset: ContractAddress,
        user: ContractAddress,
        debt: Amount,
    ) -> (i257, i257);
    fn context_unsafe(
        self: @TContractState,
        pool_id: felt252,
        collateral_asset: ContractAddress,
        debt_asset: ContractAddress,
        user: ContractAddress,
    ) -> Context;
    fn context(
        ref self: TContractState,
        pool_id: felt252,
        collateral_asset: ContractAddress,
        debt_asset: ContractAddress,
        user: ContractAddress,
    ) -> Context;
    fn create_pool(
        ref self: TContractState,
        asset_params: Span<AssetParams>,
        ltv_params: Span<LTVParams>,
        extension: ContractAddress
    ) -> felt252;
    fn modify_position(ref self: TContractState, params: ModifyPositionParams) -> UpdatePositionResponse;
    fn transfer_position(ref self: TContractState, params: TransferPositionParams);
    fn flash_loan(
        ref self: TContractState,
        receiver: ContractAddress,
        asset: ContractAddress,
        amount: u256,
        is_legacy: bool,
        data: Span<felt252>
    );
    fn modify_delegation(ref self: TContractState, pool_id: felt252, delegatee: ContractAddress, delegation: bool);
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
    fn withdraw(ref self: TContractState, assets: u256, receiver: ContractAddress, owner: ContractAddress) -> u256;
    fn max_redeem(self: @TContractState, owner: ContractAddress) -> u256;
    fn preview_redeem(self: @TContractState, shares: u256) -> u256;
    fn redeem(ref self: TContractState, shares: u256, receiver: ContractAddress, owner: ContractAddress) -> u256;
}

#[starknet::interface]
pub trait IDefaultExtensionCL<TContractState> {
    fn pool_name(self: @TContractState, pool_id: felt252) -> felt252;
    fn pool_owner(self: @TContractState, pool_id: felt252) -> ContractAddress;
    fn debt_caps(
        self: @TContractState, pool_id: felt252, collateral_asset: ContractAddress, debt_asset: ContractAddress
    ) -> u256;
    fn v_token_for_collateral_asset(
        self: @TContractState, pool_id: felt252, collateral_asset: ContractAddress
    ) -> ContractAddress;
    fn collateral_asset_for_v_token(
        self: @TContractState, pool_id: felt252, v_token: ContractAddress
    ) -> ContractAddress;
}

