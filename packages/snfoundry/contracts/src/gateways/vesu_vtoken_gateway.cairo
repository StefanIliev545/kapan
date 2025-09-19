use core::array::{Array, Span};
use openzeppelin::token::erc20::interface::{
    IERC20Dispatcher, IERC20DispatcherTrait, IERC20MetadataDispatcher,
    IERC20MetadataDispatcherTrait,
};
use starknet::ContractAddress;
use crate::gateways::vesu_gateway::VesuContext;

pub mod Errors {
    pub const APPROVE_FAILED: felt252 = 'Approve failed';
    pub const TRANSFER_FAILED: felt252 = 'Transfer failed';
    pub const UNSUPPORTED_INSTRUCTION: felt252 = 'Instruction not supported';
}

#[derive(Drop, Serde)]
pub struct TokenMetadata {
    pub address: ContractAddress,
    pub symbol: felt252,
    pub decimals: u8,
    pub underlying: ContractAddress,
    pub pool_id: felt252,
}

#[starknet::interface]
pub trait IVesuVTokenGatewayAdmin<TContractState> {
    fn add_supported_vtoken(ref self: TContractState, pool_id: felt252, vtoken: ContractAddress);
}

#[starknet::interface]
pub trait IVesuVTokenViewer<TContractState> {
    fn get_supported_vtokens(self: @TContractState) -> Array<ContractAddress>;
    fn get_supported_vtokens_info(self: @TContractState) -> Array<TokenMetadata>;
    fn resolve_vtoken_for_collateral(
        self: @TContractState,
        pool_id: felt252,
        collateral: ContractAddress,
    ) -> ContractAddress;
}

#[starknet::contract]
mod VesuVTokenGateway {
    use alexandria_math::i257::I257Impl;
    use core::array::ArrayTrait;
    use core::num::traits::Zero;
    use core::option::{OptionTrait, Option};
    use openzeppelin::access::ownable::OwnableComponent;
    use openzeppelin::token::erc20::interface::{
        IERC20Dispatcher, IERC20DispatcherTrait, IERC20MetadataDispatcher,
        IERC20MetadataDispatcherTrait,
    };
    use starknet::storage::{
        Map, MutableVecTrait, StoragePointerReadAccess, StoragePointerWriteAccess, Vec, VecTrait,
    };
    use starknet::{get_caller_address, get_contract_address, Serde};
    use crate::interfaces::IGateway::{
        Deposit, ILendingInstructionProcessor, LendingInstruction, Repay, Withdraw,
    };
    use crate::interfaces::vesu::{
        IDefaultExtensionCLDispatcher, IDefaultExtensionCLDispatcherTrait, IERC4626Dispatcher,
        IERC4626DispatcherTrait, ISingletonDispatcher, ISingletonDispatcherTrait,
    };
    use crate::interfaces::vesu_data::{
        Amount, AmountDenomination, AmountType, ModifyPositionParams, UpdatePositionResponse,
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
        vesu_singleton: ContractAddress,
        pool_id: felt252,
        router: ContractAddress,
        supported_vtokens: Vec<ContractAddress>,
        supported_vtoken_pools: Map<ContractAddress, felt252>,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        vesu_singleton: ContractAddress,
        pool_id: felt252,
        router: ContractAddress,
        owner: ContractAddress,
        supported_vtokens: Array<(felt252, ContractAddress)>,
    ) {
        self.vesu_singleton.write(vesu_singleton);
        self.pool_id.write(pool_id);
        self.router.write(router);
        self.ownable.initializer(owner);
        for (pool, vtoken) in supported_vtokens {
            self.supported_vtokens.append().write(vtoken);
            self.supported_vtoken_pools.write(vtoken, pool);
        }
    }

    #[generate_trait]
    impl VesuVTokenGatewayInternal of IVesuVTokenGatewayInternal {
        fn get_extension(self: @ContractState, pool_id: felt252) -> IDefaultExtensionCLDispatcher {
            let singleton = ISingletonDispatcher { contract_address: self.vesu_singleton.read() };
            IDefaultExtensionCLDispatcher { contract_address: singleton.extension(pool_id) }
        }

        fn get_collateral_for_vtoken(
            self: @ContractState,
            vtoken: ContractAddress,
            pool_id: felt252,
        ) -> ContractAddress {
            let extension = self.get_extension(pool_id);
            extension.collateral_asset_for_v_token(pool_id, vtoken)
        }

        fn get_vtoken_for_collateral(
            self: @ContractState,
            collateral: ContractAddress,
            pool_id: felt252,
        ) -> ContractAddress {
            let extension = self.get_extension(pool_id);
            extension.v_token_for_collateral_asset(pool_id, collateral)
        }

        fn deposit(ref self: ContractState, instruction: @Deposit) {
            let basic = *instruction.basic;
            let user = basic.user;
            let shares = basic.amount;
            let vtoken = basic.token;

            let mut pool_id = self.pool_id.read();
            let stored_pool = self.supported_vtoken_pools.read(vtoken);
            if stored_pool != Zero::zero() {
                pool_id = stored_pool;
            }
            if instruction.context.is_some() {
                let mut context_bytes: Span<felt252> = (*instruction.context).unwrap();
                let vesu_context: VesuContext = Serde::deserialize(ref context_bytes).unwrap();
                if vesu_context.pool_id != Zero::zero() {
                    pool_id = vesu_context.pool_id;
                }
            }

            let vtoken_erc20 = IERC20Dispatcher { contract_address: vtoken };
            let transferred = vtoken_erc20
                .transfer_from(get_caller_address(), get_contract_address(), shares);
            assert(transferred, Errors::TRANSFER_FAILED);

            let erc4626 = IERC4626Dispatcher { contract_address: vtoken };
            let collateral_asset = self.get_collateral_for_vtoken(vtoken, pool_id);
            let redeemed_assets = erc4626
                .redeem(shares, get_contract_address(), get_contract_address());

            if redeemed_assets == 0 {
                return;
            }

            let underlying = IERC20Dispatcher { contract_address: collateral_asset };
            let approve_result = underlying
                .approve(self.vesu_singleton.read(), redeemed_assets);
            assert(approve_result, Errors::APPROVE_FAILED);

            let collateral_amount = I257Impl::new(redeemed_assets, false);
            let debt_asset = Zero::zero();
            self.modify_collateral_for(
                pool_id,
                collateral_asset,
                debt_asset,
                user,
                collateral_amount,
            );

            // Return any dust to caller to avoid locking funds
            let remaining_underlying = underlying.balance_of(get_contract_address());
            if remaining_underlying > 0 {
                let transfer_back = underlying.transfer(get_caller_address(), remaining_underlying);
                assert(transfer_back, Errors::TRANSFER_FAILED);
            }

            let remaining_vtokens = vtoken_erc20.balance_of(get_contract_address());
            if remaining_vtokens > 0 {
                let transfer_back = vtoken_erc20.transfer(get_caller_address(), remaining_vtokens);
                assert(transfer_back, Errors::TRANSFER_FAILED);
            }
        }

        fn withdraw(ref self: ContractState, instruction: @Withdraw) {
            let basic = *instruction.basic;
            let user = basic.user;
            self.assert_router_or_user(user);
            let mut pool_id = self.pool_id.read();
            let mut debt_asset = Zero::zero();
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

            let collateral_asset = basic.token;
            let collateral_amount = I257Impl::new(basic.amount, true);
            let response = self
                .modify_collateral_for(
                    pool_id,
                    collateral_asset,
                    debt_asset,
                    user,
                    collateral_amount,
                );

            let withdrawn_assets = response.collateral_delta.abs();
            if withdrawn_assets == 0 {
                return;
            }

            let vtoken = self.get_vtoken_for_collateral(collateral_asset, pool_id);
            let underlying = IERC20Dispatcher { contract_address: collateral_asset };
            let approval = underlying.approve(vtoken, withdrawn_assets);
            assert(approval, Errors::APPROVE_FAILED);

            let erc4626 = IERC4626Dispatcher { contract_address: vtoken };
            erc4626.deposit(withdrawn_assets, user);

            let remaining_underlying = underlying.balance_of(get_contract_address());
            if remaining_underlying > 0 {
                let transfer_back = underlying.transfer(get_caller_address(), remaining_underlying);
                assert(transfer_back, Errors::TRANSFER_FAILED);
            }

            let vtoken_dispatcher = IERC20Dispatcher { contract_address: vtoken };
            let remaining_vtokens = vtoken_dispatcher.balance_of(get_contract_address());
            if remaining_vtokens > 0 {
                let transfer_back = vtoken_dispatcher
                    .transfer(get_caller_address(), remaining_vtokens);
                assert(transfer_back, Errors::TRANSFER_FAILED);
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

            let context = singleton_dispatcher.context(pool_id, collateral_asset, debt_asset, user);
            let vesu_context = context;

            let mut final_amount = collateral_amount;
            let mut amount_type = AmountType::Delta;
            if collateral_amount.is_negative() {
                let vtoken = self.get_vtoken_for_collateral(collateral_asset, pool_id);
                let erc4626 = IERC4626Dispatcher { contract_address: vtoken };
                let requested_shares = erc4626.convert_to_shares(collateral_amount.abs());
                let available_shares = vesu_context.position.collateral_shares;
                assert(available_shares > 0, 'No-collateral');

                if requested_shares >= available_shares {
                    amount_type = AmountType::Target;
                    final_amount = I257Impl::new(0, false);
                } else {
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
                    amount_type,
                    denomination: AmountDenomination::Assets,
                    value: final_amount,
                },
                debt: Default::default(),
                data: ArrayTrait::new().span(),
            };
            singleton_dispatcher.modify_position(modify_params)
        }

        fn assert_router_or_user(self: @ContractState, user: ContractAddress) {
            let router = self.router.read();
            assert(router == get_caller_address() || user == get_caller_address(), 'unauthorized');
        }
    }

    #[abi(embed_v0)]
    impl IVesuVTokenGatewayAdminImpl of IVesuVTokenGatewayAdmin<ContractState> {
        fn add_supported_vtoken(ref self: ContractState, pool_id: felt252, vtoken: ContractAddress) {
            self.ownable.assert_only_owner();
            let stored_pool = self.supported_vtoken_pools.read(vtoken);
            if stored_pool == Zero::zero() {
                self.supported_vtokens.append().write(vtoken);
            }
            self.supported_vtoken_pools.write(vtoken, pool_id);
        }
    }

    #[abi(embed_v0)]
    impl IVesuVTokenViewerImpl of IVesuVTokenViewer<ContractState> {
        fn get_supported_vtokens(self: @ContractState) -> Array<ContractAddress> {
            let mut vtokens = array![];
            let len = self.supported_vtokens.len();
            for i in 0..len {
                vtokens.append(self.supported_vtokens.at(i).read());
            };
            vtokens
        }

        fn get_supported_vtokens_info(self: @ContractState) -> Array<TokenMetadata> {
            let mut vtokens = array![];
            let len = self.supported_vtokens.len();
            for i in 0..len {
                let vtoken = self.supported_vtokens.at(i).read();
                let symbol = IERC20MetadataDispatcher { contract_address: vtoken }.symbol();
                let decimals = IERC20MetadataDispatcher { contract_address: vtoken }.decimals();
                let stored_pool = self.supported_vtoken_pools.read(vtoken);
                let pool_id = if stored_pool != Zero::zero() { stored_pool } else { self.pool_id.read() };
                let underlying = self.get_collateral_for_vtoken(vtoken, pool_id);
                vtokens.append(TokenMetadata {
                    address: vtoken,
                    symbol,
                    decimals,
                    underlying,
                    pool_id,
                });
            };
            vtokens
        }

        fn resolve_vtoken_for_collateral(
            self: @ContractState,
            pool_id: felt252,
            collateral: ContractAddress,
        ) -> ContractAddress {
            let resolved_pool = if pool_id == Zero::zero() { self.pool_id.read() } else { pool_id };
            self.get_vtoken_for_collateral(collateral, resolved_pool)
        }
    }

    #[abi(embed_v0)]
    impl ILendingInstructionProcessorImpl of ILendingInstructionProcessor<ContractState> {
        fn process_instructions(ref self: ContractState, instructions: Span<LendingInstruction>) {
            for instruction in instructions {
                match instruction {
                    LendingInstruction::Deposit(deposit_params) => {
                        self.deposit(deposit_params);
                    },
                    LendingInstruction::Withdraw(withdraw_params) => {
                        self.withdraw(withdraw_params);
                    },
                    _ => {
                        assert(false, Errors::UNSUPPORTED_INSTRUCTION);
                    },
                }
            };
        }

        fn get_authorizations_for_instructions(
            ref self: ContractState,
            instructions: Span<LendingInstruction>,
            rawSelectors: bool,
        ) -> Span<(ContractAddress, felt252, Array<felt252>)> {
            let mut authorizations = ArrayTrait::new();
            for instruction in instructions {
                match instruction {
                    LendingInstruction::Deposit(deposit_params) => {
                        let token = *deposit_params.basic.token;
                        let mut call_data: Array<felt252> = array![];
                        Serde::serialize(@get_caller_address(), ref call_data);
                        Serde::serialize(deposit_params.basic.amount, ref call_data);
                        let selector = if !rawSelectors { 'approve' } else { selector!("approve") };
                        authorizations.append((token, selector, call_data));
                    },
                    LendingInstruction::Withdraw(withdraw_params) => {
                        let mut pool_id = self.pool_id.read();
                        if withdraw_params.context.is_some() {
                            let mut context_bytes: Span<felt252> = (*withdraw_params).context.unwrap();
                            let vesu_context: VesuContext = Serde::deserialize(ref context_bytes).unwrap();
                            if vesu_context.pool_id != Zero::zero() {
                                pool_id = vesu_context.pool_id;
                            }
                        }
                        let mut call_data: Array<felt252> = array![];
                        Serde::serialize(@pool_id, ref call_data);
                        Serde::serialize(@get_contract_address(), ref call_data);
                        Serde::serialize(@true, ref call_data);
                        let selector = if !rawSelectors {
                            'modify_delegation'
                        } else {
                            selector!("modify_delegation")
                        };
                        authorizations.append((self.vesu_singleton.read(), selector, call_data));
                    },
                    _ => {
                        assert(false, Errors::UNSUPPORTED_INSTRUCTION);
                    },
                }
            };
            authorizations.span()
        }

        fn get_flash_loan_amount(ref self: ContractState, _repay: Repay) -> u256 {
            0
        }
    }
}
