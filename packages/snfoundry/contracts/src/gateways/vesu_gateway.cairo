use core::array::{Array, Span};
use core::byte_array::ByteArrayTrait;
use openzeppelin::token::erc20::interface::{
    IERC20Dispatcher, IERC20DispatcherTrait, IERC20MetadataDispatcher,
    IERC20MetadataDispatcherTrait,
};
use starknet::ContractAddress;
use crate::interfaces::vesu_data::{AssetPrice, Position};
use core::num::traits::Pow;
use core::traits::Into;
use core::integer::u256;

pub mod Errors {
    pub const APPROVE_FAILED: felt252 = 'Approve failed';
    pub const TRANSFER_FAILED: felt252 = 'Transfer failed';
}

#[starknet::interface]
pub trait IVesuGatewayAdmin<TContractState> {
    fn add_asset(ref self: TContractState, asset: ContractAddress);
}

#[derive(Drop, Serde)]
pub struct TokenMetadata {
    pub address: ContractAddress,
    pub symbol: felt252,
    pub decimals: u8,
    pub rate_accumulator: u256,
    pub utilization: u256,
    pub fee_rate: u256,
    pub price: AssetPrice,
    pub total_nominal_debt: u256,
    pub last_rate_accumulator: u256,
    pub reserve: u256,
    pub scale: u256,
}

#[derive(Drop, Serde, Copy)]
pub struct PositionWithAmounts {
    pub collateral_shares: u256,
    pub collateral_amount: u256,
    pub nominal_debt: u256,
    pub is_vtoken: bool,
}

#[starknet::interface]
pub trait IVesuViewer<TContractState> {
    fn get_all_positions(
        self: @TContractState, user: ContractAddress,
    ) -> Array<(ContractAddress, ContractAddress, PositionWithAmounts)>;
    fn get_supported_assets_array(self: @TContractState) -> Array<ContractAddress>;
    fn get_supported_assets_ui(self: @TContractState) -> Array<TokenMetadata>;
}

#[derive(Drop, Serde)]
pub struct VesuContext {
    // Vesu has pools and positions. Debt is isolated in pairs to a collateral.
    pub pool_id: felt252, // This allows targeting a specific pool besides genesis.
    pub position_counterpart_token: ContractAddress // This is either the collateral or the debt token depending on the instruction.
}

#[starknet::interface]
trait IERC20Symbol<TContractState> {
    fn symbol(self: @TContractState) -> felt252;
}

#[starknet::contract]
mod VesuGateway {
    use alexandria_math::i257::{I257Impl, i257};
    use core::array::ArrayTrait;
    use core::num::traits::Zero;
    use core::option::{OptionTrait, Option};
    use openzeppelin::access::ownable::OwnableComponent;
    use openzeppelin::token::erc20::interface::{
        IERC20Dispatcher, IERC20DispatcherTrait, IERC20MetadataDispatcher,
        IERC20MetadataDispatcherTrait,
    };
    use starknet::storage::{
        Map, MutableVecTrait, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
        Vec, VecTrait,
    };
    use starknet::{contract_address_const, get_caller_address, get_contract_address};
    use crate::interfaces::IGateway::{
        Borrow, Deposit, ILendingInstructionProcessor, LendingInstruction, Repay, Withdraw,
    };
    use crate::interfaces::vesu::{
        IDefaultExtensionCLDispatcher, IDefaultExtensionCLDispatcherTrait, IERC4626Dispatcher,
        IERC4626DispatcherTrait, ISingletonDispatcher, ISingletonDispatcherTrait,
    };
    use crate::interfaces::vesu_data::{
        Amount, AmountDenomination, AmountType, Context, ModifyPositionParams, Position,
        TransferPositionParams, UnsignedAmount, UpdatePositionResponse,
    };
    use super::*;


    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);

    #[abi(embed_v0)]
    impl OwnableMixinImpl = OwnableComponent::OwnableMixinImpl<ContractState>;
    impl InternalImpl = OwnableComponent::InternalImpl<ContractState>;

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        OwnableEvent: OwnableComponent::Event,
    }

    #[storage]
    struct Storage {
        // Add storage variables here
        vesu_singleton: ContractAddress,
        pool_id: felt252,
        supported_assets: Vec<ContractAddress>,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        vesu_singleton: ContractAddress,
        pool_id: felt252,
        supported_assets: Array<ContractAddress>,
    ) {
        self.vesu_singleton.write(vesu_singleton);
        self.pool_id.write(pool_id);
        self.ownable.initializer(get_caller_address());
        for asset in supported_assets {
            self.supported_assets.append().write(asset);
        }
    }


    trait IVesuGatewayInternal {
        fn get_vtoken_for_collateral(
            self: @ContractState, collateral: ContractAddress,
        ) -> ContractAddress;
        fn deposit(ref self: ContractState, instruction: @Deposit);
        fn withdraw(ref self: ContractState, instruction: @Withdraw);
        fn borrow(ref self: ContractState, instruction: @Borrow);
        fn repay(ref self: ContractState, instruction: @Repay);
        fn transfer_position_for(
            ref self: ContractState,
            pool_id: felt252,
            collateral_asset: ContractAddress,
            debt_asset: ContractAddress,
            user: ContractAddress,
            collateral_amount: u256,
        );
        fn modify_collateral_for(
            ref self: ContractState,
            pool_id: felt252,
            collateral_asset: ContractAddress,
            debt_asset: ContractAddress,
            user: ContractAddress,
            collateral_amount: i257,
        ) -> UpdatePositionResponse;
        fn modify_debt_for(
            ref self: ContractState,
            pool_id: felt252,
            collateral_asset: ContractAddress,
            debt_asset: ContractAddress,
            user: ContractAddress,
            debt_amount: i257,
        );
    }

    impl VesuGatewayInternal of IVesuGatewayInternal {
        fn get_vtoken_for_collateral(
            self: @ContractState, collateral: ContractAddress,
        ) -> ContractAddress {
            let vesu_singleton_dispatcher = ISingletonDispatcher {
                contract_address: self.vesu_singleton.read(),
            };
            let poolId = self.pool_id.read();
            let extensionForPool = vesu_singleton_dispatcher.extension(poolId);
            let extension = IDefaultExtensionCLDispatcher { contract_address: extensionForPool };
            extension.v_token_for_collateral_asset(poolId, collateral)
        }

        fn deposit(ref self: ContractState, instruction: @Deposit) {
            let basic = *instruction.basic;
            let mut pool_id = self.pool_id.read();
            let mut debt_asset = Zero::zero(); // Zero debt token for deposit
            if instruction.context.is_some() {
                let mut context_bytes: Span<felt252> = (*instruction.context).unwrap();
                let vesu_context: VesuContext = Serde::deserialize(ref context_bytes).unwrap();
                if vesu_context.pool_id != Zero::zero() {
                    pool_id = vesu_context.pool_id;
                }
                if vesu_context.position_counterpart_token != Zero::zero() {
                    debt_asset = vesu_context.position_counterpart_token;
                }
            }

            let erc20 = IERC20Dispatcher { contract_address: basic.token };
            let result = erc20
                .transfer_from(get_caller_address(), get_contract_address(), basic.amount);
            assert(result, Errors::TRANSFER_FAILED);

            // Approve singleton to spend tokens
            let singleton_address = self.vesu_singleton.read();
            let approve_result = erc20.approve(singleton_address, basic.amount);
            assert(approve_result, Errors::APPROVE_FAILED);

            // Use modify position to add collateral
            let collateral_asset = basic.token;
            let user = basic.user;

            // Create positive i257 for deposit
            let collateral_amount = I257Impl::new(basic.amount, false);
            let response = self
                .modify_collateral_for(
                    pool_id, collateral_asset, debt_asset, user, collateral_amount,
                );
        }

        fn withdraw(ref self: ContractState, instruction: @Withdraw) {
            let basic = *instruction.basic;
            let mut pool_id = self.pool_id.read();
            let collateral_asset = basic.token;
            let mut debt_asset = Zero::zero(); // Zero debt token for withdraw
            let user = basic.user;

            if instruction.context.is_some() {
                let mut context_bytes: Span<felt252> = (*instruction.context).unwrap();
                let vesu_context: VesuContext = Serde::deserialize(ref context_bytes).unwrap();
                if vesu_context.pool_id != Zero::zero() {
                    pool_id = vesu_context.pool_id;
                }
                if vesu_context.position_counterpart_token != Zero::zero() {
                    debt_asset = vesu_context.position_counterpart_token;
                }
            }

        
            // Create negative i257 for withdraw
            let collateral_amount = I257Impl::new(basic.amount, true);
            let response = self
                .modify_collateral_for(
                    pool_id, collateral_asset, debt_asset, user, collateral_amount,
                );

            // Transfer tokens back to user using the actual amount withdrawn
            let erc20 = IERC20Dispatcher { contract_address: basic.token };
            let result = erc20.transfer(user, response.collateral_delta.abs());
            assert(result, Errors::TRANSFER_FAILED);
        }

        fn transfer_position_for(
            ref self: ContractState,
            pool_id: felt252,
            collateral_asset: ContractAddress,
            debt_asset: ContractAddress,
            user: ContractAddress,
            collateral_amount: u256,
        ) {
            let singleton_dispatcher = ISingletonDispatcher {
                contract_address: self.vesu_singleton.read(),
            };

            // Check if position already exists
            let (position, _, _) = singleton_dispatcher
                .position(pool_id, collateral_asset, debt_asset, user);
            if position.collateral_shares == 0 && position.nominal_debt == 0 {
                // Transfer position from zero debt to target debt
                let transfer_params = TransferPositionParams {
                    pool_id,
                    from_collateral_asset: collateral_asset,
                    to_collateral_asset: collateral_asset,
                    from_debt_asset: Zero::zero(),
                    to_debt_asset: debt_asset,
                    from_user: user,
                    to_user: user,
                    collateral: UnsignedAmount {
                        amount_type: AmountType::Target,
                        denomination: AmountDenomination::Native,
                        value: collateral_amount,
                    },
                    debt: Default::default(),
                    from_data: ArrayTrait::new().span(),
                    to_data: ArrayTrait::new().span(),
                };
                singleton_dispatcher.transfer_position(transfer_params);
            }
        }

        fn modify_collateral_for(
            ref self: ContractState,
            pool_id: felt252,
            collateral_asset: ContractAddress,
            debt_asset: ContractAddress,
            user: ContractAddress,
            collateral_amount: i257,
        ) -> UpdatePositionResponse {
            let singleton_dispatcher = ISingletonDispatcher {
                contract_address: self.vesu_singleton.read(),
            };

            // Get context which contains all position info
            let context = singleton_dispatcher.context(pool_id, collateral_asset, debt_asset, user);
            let vesu_context: Context = context;

            // If withdrawing, ensure we don't withdraw more than available
            let mut final_amount = collateral_amount;
            let mut amount_type = AmountType::Delta;
            if collateral_amount.is_negative() {

                let vtoken = self.get_vtoken_for_collateral(collateral_asset);
                let erc4626 = IERC4626Dispatcher { contract_address: vtoken };
                let requested_shares = erc4626.convert_to_shares(collateral_amount.abs());
                let available_shares = vesu_context.position.collateral_shares;
                assert(available_shares > 0, 'No-collateral');

                if requested_shares >= available_shares {
                    // For exact or over withdrawals, use Target with 0
                    amount_type = AmountType::Target;
                    final_amount = I257Impl::new(0, false);
                } else {
                    // For partial withdrawals, use Delta with the negative amount
                    let max_assets = erc4626.convert_to_assets(requested_shares);
                    final_amount = I257Impl::new(max_assets, true);
                }
            }

            let modify_params = ModifyPositionParams {
                pool_id,
                collateral_asset,
                debt_asset,
                user,
                collateral: Amount {
                    amount_type, denomination: AmountDenomination::Assets, value: final_amount,
                },
                debt: Default::default(),
                data: ArrayTrait::new().span(),
            };
            singleton_dispatcher.modify_position(modify_params)
        }

        fn borrow(ref self: ContractState, instruction: @Borrow) {
            let basic = *instruction.basic;
            let context = *instruction.context;
            assert(context.is_some(), 'Context is required for borrow');
            let mut context_bytes = context.unwrap();
            let vesu_context: VesuContext = Serde::deserialize(ref context_bytes).unwrap();

            let mut pool_id = self.pool_id.read();
            if vesu_context.pool_id != Zero::zero() {
                pool_id = vesu_context.pool_id;
            }
            let user = basic.user;
            let collateral_asset = vesu_context.position_counterpart_token;
            let debt_asset = basic.token;

            // Create positive i257 for borrow
            let debt_amount = I257Impl::new(basic.amount, false);
            self.modify_debt_for(pool_id, collateral_asset, debt_asset, user, debt_amount);

            // Transfer debt tokens to user
            let erc20 = IERC20Dispatcher { contract_address: debt_asset };
            let result = erc20.transfer(get_caller_address(), erc20.balance_of(get_contract_address()));
            assert(result, Errors::TRANSFER_FAILED);
        }


        fn repay(ref self: ContractState, instruction: @Repay) {
            let basic = *instruction.basic;
            let context = *instruction.context;
            assert(context.is_some(), 'Context is required for repay');
            let mut context_bytes = context.unwrap();
            let vesu_context: VesuContext = Serde::deserialize(ref context_bytes).unwrap();

            let mut pool_id = self.pool_id.read();
            if vesu_context.pool_id != Zero::zero() {
                pool_id = vesu_context.pool_id;
            }
            let user = basic.user;
            let collateral_asset = vesu_context.position_counterpart_token;
            let debt_asset = basic.token;

            // Transfer debt tokens from user to gateway
            let erc20 = IERC20Dispatcher { contract_address: debt_asset };
            let result = erc20.transfer_from(get_caller_address(), get_contract_address(), basic.amount);
            assert(result, Errors::TRANSFER_FAILED);

            let erc20 = IERC20Dispatcher { contract_address: debt_asset };
            let result = erc20.approve(self.vesu_singleton.read(), basic.amount);
            assert(result, Errors::APPROVE_FAILED);

            // Create negative i257 for repay (reducing debt)
            let debt_amount = I257Impl::new(basic.amount, true);
            self.modify_debt_for(pool_id, collateral_asset, debt_asset, user, debt_amount);
        }

        
        fn modify_debt_for(
            ref self: ContractState,
            pool_id: felt252,
            collateral_asset: ContractAddress,
            debt_asset: ContractAddress,
            user: ContractAddress,
            debt_amount: i257,
        ) {
            let singleton_dispatcher = ISingletonDispatcher {
                contract_address: self.vesu_singleton.read(),
            };

            // Check if position exists
            let (position, _, _) = singleton_dispatcher
                .position(pool_id, collateral_asset, debt_asset, user);
            if position.collateral_shares == 0 && position.nominal_debt == 0 {
                // Transfer position from zero debt to target debt
                self.transfer_position_for(pool_id, collateral_asset, debt_asset, user, 0);
            }

            let modify_params = ModifyPositionParams {
                pool_id,
                collateral_asset,
                debt_asset,
                user,
                collateral: Default::default(),
                debt: Amount {
                    amount_type: AmountType::Delta,
                    denomination: AmountDenomination::Assets,
                    value: debt_amount,
                },
                data: ArrayTrait::new().span(),
            };
            singleton_dispatcher.modify_position(modify_params);
        }
    }

    #[abi(embed_v0)]
    impl IVesuGatewayAdminImpl of IVesuGatewayAdmin<ContractState> {
        fn add_asset(ref self: ContractState, asset: ContractAddress) {
            self.ownable.assert_only_owner();
            self.supported_assets.append().write(asset);
        }
    }

    #[abi(embed_v0)]
    impl ILendingInstructionProcessorImpl of ILendingInstructionProcessor<ContractState> {
        fn process_instructions(ref self: ContractState, instructions: Span<LendingInstruction>) {
            let mut i: usize = 0;
            while i != instructions.len() {
                match instructions.at(i) {
                    LendingInstruction::Deposit(deposit_params) => {
                        self.deposit(deposit_params);
                    },
                    LendingInstruction::Withdraw(withdraw_params) => {
                        self.withdraw(withdraw_params);
                    },
                    LendingInstruction::Borrow(borrow_params) => { 
                        self.borrow(borrow_params); 
                    },
                    LendingInstruction::Repay(repay_params) => { 
                        self.repay(repay_params); 
                    },
                }
                i += 1;
            }
        }
        fn get_authorizations_for_instructions(ref self: ContractState, instructions: Span<LendingInstruction>) -> Span<(ContractAddress, felt252, Array<felt252>)> {
            let mut authorizations = ArrayTrait::new();
            for instruction in instructions {
                match instruction {
                    LendingInstruction::Deposit(deposit_params) => {
                        let token = *deposit_params.basic.token;
                        let amount = deposit_params.basic.amount;
                        let mut call_data: Array<felt252> = array![];
                        Serde::serialize(@get_caller_address(), ref call_data); //todo - this is a hack to get the address of the router..
                        Serde::serialize(amount, ref call_data);
                        authorizations.append((token, 'approve', call_data));
                    },
                    LendingInstruction::Repay(repay_params) => {
                        let token = *repay_params.basic.token;
                        let mut call_data: Array<felt252> = array![];
                        Serde::serialize(@get_caller_address(), ref call_data); //todo - this is a hack to get the address of the router..
                        Serde::serialize(repay_params.basic.amount, ref call_data);
                        authorizations.append((token, 'approve', call_data));
                    },
                    LendingInstruction::Borrow(borrow_params) => {
                        let mut pool_id = self.pool_id.read();
                        let singleton = self.vesu_singleton.read();
                        if borrow_params.context.is_some() {
                            let mut context_bytes: Span<felt252> = (*borrow_params).context.unwrap();
                            let vesu_context: VesuContext = Serde::deserialize(ref context_bytes).unwrap();
                            if vesu_context.pool_id != Zero::zero() {
                                pool_id = vesu_context.pool_id;
                            }
                        }
                        let mut call_data: Array<felt252> = array![];
                        Serde::serialize(@pool_id, ref call_data); //todo - this is a hack to get the address of the router..
                        Serde::serialize(@get_contract_address(), ref call_data);
                        Serde::serialize(@true, ref call_data);
                        authorizations.append((singleton, 'modify_delegation', call_data));
                    },
                    LendingInstruction::Withdraw(withdraw_params) => {
                        let mut pool_id = self.pool_id.read();
                        let singleton = self.vesu_singleton.read();
                        if withdraw_params.context.is_some() {
                            let mut context_bytes: Span<felt252> = (*withdraw_params).context.unwrap();
                            let vesu_context: VesuContext = Serde::deserialize(ref context_bytes).unwrap();
                            if vesu_context.pool_id != Zero::zero() {
                                pool_id = vesu_context.pool_id;
                            }
                        }
                        let mut call_data: Array<felt252> = array![];
                        Serde::serialize(@pool_id, ref call_data); //todo - this is a hack to get the address of the router..
                        Serde::serialize(@get_contract_address(), ref call_data);
                        Serde::serialize(@true, ref call_data);
                        authorizations.append((singleton, 'modify_delegation', call_data));
                    },
                    _ => {}
                }
            };
            return authorizations.span();
        }
    }

    use crate::interfaces::IGateway::InterestRateView;
    use alexandria_math::{pow};

    #[abi(embed_v0)]
    impl InterestRateViewImpl of InterestRateView<ContractState> {
        fn get_borrow_rate(ref self: ContractState, token_address: ContractAddress) -> u256 {
            let pool_id = self.pool_id.read();
            let singleton_dispatcher = ISingletonDispatcher {
                contract_address: self.vesu_singleton.read(),
            };
            let extension = IDefaultExtensionCLDispatcher {
                contract_address: singleton_dispatcher.extension(pool_id),
            };

            // Get rate information from the singleton
            let utilization = singleton_dispatcher.utilization(pool_id, token_address);
            let (asset_config, _) = singleton_dispatcher.asset_config(pool_id, token_address);
            let interest_per_second = extension.interest_rate(
                pool_id,
                token_address,
                utilization,
                asset_config.last_updated,
                asset_config.last_full_utilization_rate,
            );

            // Convert to APR (multiply by YEAR_IN_SECONDS and divide by SCALE)
            let year_in_seconds: u256 = 31536000; // 365 days
            let scale: u256 = pow(10,10);
            let borrow_rate = (interest_per_second * year_in_seconds) ;

            // Return rate and scale
            borrow_rate
        }

        fn get_supply_rate(ref self: ContractState, token_address: ContractAddress) -> u256 {
            let pool_id = self.pool_id.read();
            let singleton_dispatcher = ISingletonDispatcher {
                contract_address: self.vesu_singleton.read(),
            };
            let extension = IDefaultExtensionCLDispatcher {
                contract_address: singleton_dispatcher.extension(pool_id),
            };
    
            // Fetch rate data
            let utilization = singleton_dispatcher.utilization(pool_id, token_address);
            let (asset_config, _) = singleton_dispatcher.asset_config(pool_id, token_address);
            let interest_per_second = extension.interest_rate(
                pool_id,
                token_address,
                utilization,
                asset_config.last_updated,
                asset_config.last_full_utilization_rate,
            );
    
            let year_in_seconds: u256 = 31536000;
            let scale: u256 = pow(10, 18);
    
            // 1. Compute numerator: interest * year * total_debt * last_rate (no divisions yet)
            let mut numerator = interest_per_second * year_in_seconds;
            numerator = numerator * asset_config.total_nominal_debt;
            numerator = numerator * asset_config.last_rate_accumulator;
    
            // 2. Compute denominator components with scaling
            let reserve_scale_part = (asset_config.reserve * scale) / asset_config.scale;
            let total_borrowed_part = (asset_config.total_nominal_debt * asset_config.last_rate_accumulator) / scale;
    
            // 3. Combine denominator and scale it
            let denominator = (reserve_scale_part + total_borrowed_part) * scale;
    
            // 4. Final division (precision preserved)
            let supply_rate = numerator / denominator;
    
            supply_rate
        }
    }

    #[abi(embed_v0)]
    impl IVesuViewerImpl of IVesuViewer<ContractState> {
        fn get_supported_assets_array(self: @ContractState) -> Array<ContractAddress> {
            let mut assets = array![];
            let supported_assets = self.supported_assets;
            let len = supported_assets.len();
            for i in 0..len {
                assets.append(self.supported_assets.at(i).read());
            };
            assets
        }

        fn get_all_positions(
            self: @ContractState, user: ContractAddress,
        ) -> Array<(ContractAddress, ContractAddress, PositionWithAmounts)> {
            let mut positions = array![];
            let supported_assets = self.get_supported_assets_array();
            let pool_id = self.pool_id.read();
            let singleton_dispatcher = ISingletonDispatcher {
                contract_address: self.vesu_singleton.read(),
            };
            let extension = IDefaultExtensionCLDispatcher {
                contract_address: singleton_dispatcher.extension(pool_id),
            };

            // Iterate through all possible pairs of supported assets
            let len = supported_assets.len();
            for i in 0..len {
                let collateral_asset = *supported_assets.at(i);

                // Check vtoken balance first
                let vtoken = extension.v_token_for_collateral_asset(pool_id, collateral_asset);
                let erc20 = IERC20Dispatcher { contract_address: vtoken };
                let vtoken_balance = erc20.balance_of(user);
                if vtoken_balance > 0 {
                    let erc4626 = IERC4626Dispatcher { contract_address: vtoken };
                    let collateral_amount = erc4626.convert_to_assets(vtoken_balance);
                    positions
                        .append(
                            (
                                collateral_asset,
                                Zero::zero(),
                                PositionWithAmounts {
                                    collateral_shares: vtoken_balance,
                                    collateral_amount,
                                    nominal_debt: 0,
                                    is_vtoken: true,
                                },
                            ),
                        );
                }

                // Check position with zero debt (earning positions)
                let (position, _, _) = singleton_dispatcher
                    .position(pool_id, collateral_asset, Zero::zero(), user);
                if position.collateral_shares > 0 {
                    let vtoken = extension.v_token_for_collateral_asset(pool_id, collateral_asset);
                    let erc4626 = IERC4626Dispatcher { contract_address: vtoken };
                    let collateral_amount = erc4626.convert_to_assets(position.collateral_shares);
                    positions
                        .append(
                            (
                                collateral_asset,
                                Zero::zero(),
                                PositionWithAmounts {
                                    collateral_shares: position.collateral_shares,
                                    collateral_amount,
                                    nominal_debt: position.nominal_debt,
                                    is_vtoken: false,
                                },
                            ),
                        );
                }

                // Then check all other possible debt assets
                for j in 0..len {
                    if i == j {
                        continue; // Skip same asset pairs
                    }
                    let debt_asset = *supported_assets.at(j);
                    let (position, _, _) = singleton_dispatcher
                        .position(pool_id, collateral_asset, debt_asset, user);
                    if position.collateral_shares > 0 || position.nominal_debt > 0 {
                        let vtoken = extension
                            .v_token_for_collateral_asset(pool_id, collateral_asset);
                        let erc4626 = IERC4626Dispatcher { contract_address: vtoken };
                        let collateral_amount = erc4626
                            .convert_to_assets(position.collateral_shares);
                        positions
                            .append(
                                (
                                    collateral_asset,
                                    debt_asset,
                                    PositionWithAmounts {
                                        collateral_shares: position.collateral_shares,
                                        collateral_amount,
                                        nominal_debt: position.nominal_debt,
                                        is_vtoken: false,
                                    },
                                ),
                            );
                    }
                }
            };
            positions
        }

        fn get_supported_assets_ui(self: @ContractState) -> Array<TokenMetadata> {
            let mut assets = array![];
            let len = self.supported_assets.len();
            let pool_id = self.pool_id.read();
            let singleton_dispatcher = ISingletonDispatcher {
                contract_address: self.vesu_singleton.read(),
            };

            let extension = IDefaultExtensionCLDispatcher {
                contract_address: singleton_dispatcher.extension(pool_id),
            };

            for i in 0..len {
                let asset = self.supported_assets.at(i).read();
                let asset_felt: felt252 = asset.into();

                let dispatcher = IERC20SymbolDispatcher { contract_address: asset };
                let symbol_felt = dispatcher.symbol();

                let decimals = IERC20MetadataDispatcher { contract_address: asset }.decimals();

                // Get rate information from the singleton
                let rate_accumulator = singleton_dispatcher.rate_accumulator(pool_id, asset);
                let utilization = singleton_dispatcher.utilization(pool_id, asset);
                let (asset_config, _) = singleton_dispatcher.asset_config(pool_id, asset);
                let fee_rate = extension
                    .interest_rate(
                        pool_id,
                        asset,
                        utilization,
                        asset_config.last_updated,
                        asset_config.last_full_utilization_rate,
                    );
                let price = extension.price(pool_id, asset);

                let metadata = TokenMetadata {
                    address: asset,
                    symbol: symbol_felt,
                    decimals,
                    rate_accumulator,
                    utilization,
                    fee_rate,
                    price,
                    total_nominal_debt: asset_config.total_nominal_debt,
                    last_rate_accumulator: asset_config.last_rate_accumulator,
                    reserve: asset_config.reserve,
                    scale: asset_config.scale,
                };
                assets.append(metadata.into());
            };
            assets
        }
    }
}
