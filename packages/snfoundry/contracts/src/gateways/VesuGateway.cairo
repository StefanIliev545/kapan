use starknet::ContractAddress;
use core::array::Array;
use core::array::Span;
use crate::interfaces::vesu_data::Position;

pub mod Errors {
    pub const APPROVE_FAILED: felt252 = 'Approve failed';
    pub const TRANSFER_FAILED: felt252 = 'Transfer failed';
}

#[starknet::interface]
pub trait IVesuGatewayAdmin<TContractState> {
    fn add_asset(ref self: TContractState, asset: ContractAddress);
}

#[starknet::interface]
pub trait IVesuViewer<TContractState> {
    fn get_all_positions(self: @TContractState, user: ContractAddress) -> Array<(ContractAddress, ContractAddress, Position)>;
    fn get_supported_assets_array(self: @TContractState) -> Array<ContractAddress>;
}

#[derive(Drop, Serde)]
pub struct VesuContext {
    // Vesu has pools and positions. Debt is isolated in pairs to a collateral. 
    pub pool_id: felt252, // This allows targeting a specific pool besides genesis.
    pub position_counterpart_token: ContractAddress, // This is either the collateral or the debt token depending on the instruction.
}

#[starknet::contract]
mod VesuGateway {
    use super::*;
    use core::num::traits::Zero;
    use core::option::OptionTrait;
    use core::array::ArrayTrait;
    use openzeppelin::access::ownable::OwnableComponent;
    use openzeppelin::token::erc20::interface::{IERC20DispatcherTrait, IERC20Dispatcher};
    use alexandria_math::i257::{i257, I257Impl};
    use starknet::storage::{
        Map,
        StoragePointerWriteAccess,
        StoragePointerReadAccess,
        StoragePathEntry,
        Vec,
        VecTrait,
        MutableVecTrait,
    };

    use starknet::{
        get_caller_address,
        get_contract_address,
        contract_address_const,
    };

    use crate::interfaces::vesu::{
        IDefaultExtensionCLDispatcher,
        IDefaultExtensionCLDispatcherTrait,
        IERC4626Dispatcher,
        IERC4626DispatcherTrait,
        ISingletonDispatcher,
        ISingletonDispatcherTrait,
    };
    use crate::interfaces::vesu_data::{
        ModifyPositionParams,
        TransferPositionParams,
        Context,
        Position,
        Amount,
        AmountType,
        AmountDenomination,
        UnsignedAmount,
        UpdatePositionResponse,
    };
    use crate::interfaces::IGateway::{ILendingInstructionProcessor, LendingInstruction, Deposit, Withdraw, Borrow, Repay};

    
    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);

    #[abi(embed_v0)]
    impl OwnableMixinImpl = OwnableComponent::OwnableMixinImpl<ContractState>;
    impl InternalImpl = OwnableComponent::InternalImpl<ContractState>;

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        OwnableEvent: OwnableComponent::Event
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
    fn constructor(ref self: ContractState, vesu_singleton: ContractAddress, pool_id: felt252) {
        self.vesu_singleton.write(vesu_singleton);
        self.pool_id.write(pool_id);
        self.ownable.initializer(get_caller_address());
    }


    trait IVesuGatewayInternal {
        fn get_vtoken_for_collateral(self: @ContractState, collateral: ContractAddress) -> ContractAddress;
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
            collateral_amount: u256
        );
        fn modify_collateral_for(
            ref self: ContractState,
            pool_id: felt252,
            collateral_asset: ContractAddress,
            debt_asset: ContractAddress,
            user: ContractAddress,
            collateral_amount: i257
        ) -> UpdatePositionResponse;
        fn modify_debt_for(
            ref self: ContractState,
            pool_id: felt252,
            collateral_asset: ContractAddress,
            debt_asset: ContractAddress,
            user: ContractAddress,
            debt_amount: i257
        );
    }

    impl VesuGatewayInternal of IVesuGatewayInternal {
        fn get_vtoken_for_collateral(self: @ContractState, collateral: ContractAddress) -> ContractAddress {
            let vesu_singleton_dispatcher = ISingletonDispatcher {
                contract_address: self.vesu_singleton.read(),
            };
            let poolId = self.pool_id.read();
            let extensionForPool = vesu_singleton_dispatcher.extension(poolId);
            let extension = IDefaultExtensionCLDispatcher {
                contract_address: extensionForPool,
            };
            extension.v_token_for_collateral_asset(poolId, collateral)
        }

        fn deposit(ref self: ContractState, instruction: @Deposit) {
            let basic = *instruction.basic;
            if instruction.context.is_some() {
                // todo - trigger modify as we are adding collateral
                return;
            }

            let erc20 = IERC20Dispatcher {
                contract_address: basic.token,
            };
            let result = erc20.transfer_from(get_caller_address(), get_contract_address(), basic.amount);
            assert(result, Errors::TRANSFER_FAILED);

            // Approve singleton to spend tokens
            let singleton_address = self.vesu_singleton.read();
            let approve_result = erc20.approve(singleton_address, basic.amount);
            assert(approve_result, Errors::APPROVE_FAILED);

            // Use modify position to add collateral
            let pool_id = self.pool_id.read();
            let collateral_asset = basic.token;
            let debt_asset = Zero::zero();  // Zero debt token for deposit
            let user = basic.user;

            // Create positive i257 for deposit
            let collateral_amount = I257Impl::new(basic.amount, false);
            let response = self.modify_collateral_for(pool_id, collateral_asset, debt_asset, user, collateral_amount);
        }

        fn withdraw(ref self: ContractState, instruction: @Withdraw) {
            let basic = *instruction.basic;
            if instruction.context.is_some() {
                // todo - trigger modify as we are removing paired collateral
                return;
            }

            let pool_id = self.pool_id.read();
            let collateral_asset = basic.token;
            let debt_asset = Zero::zero();  // Zero debt token for withdraw
            let user = basic.user;

            // Create negative i257 for withdraw
            let collateral_amount = I257Impl::new(basic.amount, true);
            let response = self.modify_collateral_for(pool_id, collateral_asset, debt_asset, user, collateral_amount);

            println!("withdrawing collateral");
            // Transfer tokens back to user using the actual amount withdrawn
            let erc20 = IERC20Dispatcher {
                contract_address: basic.token,
            };
            let result = erc20.transfer(user, response.collateral_delta.abs());
            assert(result, Errors::TRANSFER_FAILED);
        }

        fn transfer_position_for(
            ref self: ContractState,
            pool_id: felt252,
            collateral_asset: ContractAddress,
            debt_asset: ContractAddress,
            user: ContractAddress,
            collateral_amount: u256
        ) {
            let singleton_dispatcher = ISingletonDispatcher {
                contract_address: self.vesu_singleton.read(),
            };

            // Check if position already exists
            let (position, _, _) = singleton_dispatcher.position(pool_id, collateral_asset, debt_asset, user);
            if position.collateral_shares == 0 && position.nominal_debt == 0 {
                // Transfer position from zero debt to target debt
                println!("transferring position {} collateral", collateral_amount);
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
                println!("transferred position");
            }
        }

        fn modify_collateral_for(
            ref self: ContractState,
            pool_id: felt252,
            collateral_asset: ContractAddress,
            debt_asset: ContractAddress,
            user: ContractAddress,
            collateral_amount: i257
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
                println!("is negative");
               
                let vtoken = self.get_vtoken_for_collateral(collateral_asset);
                let erc4626 = IERC4626Dispatcher {
                    contract_address: vtoken,
                };
                let requested_shares = erc4626.convert_to_shares(collateral_amount.abs());
                let available_shares = vesu_context.position.collateral_shares;
                assert(available_shares > 0, 'No-collateral');
                
                println!("requested_shares: {}", requested_shares);
                println!("available_shares: {}", available_shares);
                if requested_shares >= available_shares {
                    // For exact or over withdrawals, use Target with 0
                    amount_type = AmountType::Target;
                    final_amount = I257Impl::new(0, false);
                    println!("using target amount type");
                } else {
                    // For partial withdrawals, use Delta with the negative amount
                    let max_assets = erc4626.convert_to_assets(available_shares);
                    final_amount = I257Impl::new(max_assets, true);
                    println!("using delta amount type");
                }
                println!("final_amount: {}", final_amount);
            }
            println!("final_amount_premodify: {}", final_amount);

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

        fn modify_debt_for(
            ref self: ContractState,
            pool_id: felt252,
            collateral_asset: ContractAddress,
            debt_asset: ContractAddress,
            user: ContractAddress,
            debt_amount: i257
        ) {
            let singleton_dispatcher = ISingletonDispatcher {
                contract_address: self.vesu_singleton.read(),
            };

            // Check if position exists
            let (position, _, _) = singleton_dispatcher.position(pool_id, collateral_asset, debt_asset, user);
            if position.collateral_shares == 0 && position.nominal_debt == 0 {
                // Transfer position from zero debt to target debt
                self.transfer_position_for(pool_id, collateral_asset, debt_asset, user, 0);
            }

            // Approve singleton to spend tokens if needed
            if !debt_amount.is_negative() {
                let erc20 = IERC20Dispatcher {
                    contract_address: debt_asset,
                };
                let result = erc20.approve(self.vesu_singleton.read(), debt_amount.abs());
                assert(result, Errors::APPROVE_FAILED);
                println!("approved debt {}", debt_amount.abs());
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

        fn borrow(ref self: ContractState, instruction: @Borrow) {
            let basic = *instruction.basic;
            let context = *instruction.context;
            assert(context.is_some(), 'Context is required for borrow');
            let mut context_bytes = context.unwrap();
            let vesu_context: VesuContext = Serde::deserialize(ref context_bytes).unwrap();
        
            let pool_id = self.pool_id.read();
            let user = basic.user;
            let collateral_asset = vesu_context.position_counterpart_token;
            let debt_asset = basic.token;
        
            // Validate context
            assert(vesu_context.pool_id == pool_id, 'Invalid pool id');
            assert(vesu_context.position_counterpart_token == contract_address_const::<0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7>(), 'Invalid context'); //eth
            assert(user == contract_address_const::<0x0113c67ed78bc280887234fe5ed5e77272465317978ae86c25a71531d9332a2d>(), 'Invalid user');
        
            // Create positive i257 for borrow
            let debt_amount = I257Impl::new(basic.amount, false);
            self.modify_debt_for(pool_id, collateral_asset, debt_asset, user, debt_amount);
            
            // Transfer debt tokens to user
            let erc20 = IERC20Dispatcher {
                contract_address: debt_asset,
            };
            let result = erc20.transfer(user, erc20.balance_of(get_contract_address()));
            assert(result, Errors::TRANSFER_FAILED);
        }
        

        fn repay(ref self: ContractState, instruction: @Repay) {
            let basic = *instruction.basic;
            let context = *instruction.context;
            assert(context.is_some(), 'Context is required for repay');
            let mut context_bytes = context.unwrap();
            let vesu_context: VesuContext = Serde::deserialize(ref context_bytes).unwrap();
        
            let pool_id = self.pool_id.read();
            let user = basic.user;
            let collateral_asset = vesu_context.position_counterpart_token;
            let debt_asset = basic.token;
        
            // Validate context
            assert(vesu_context.pool_id == pool_id, 'Invalid pool id');
            assert(vesu_context.position_counterpart_token == contract_address_const::<0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7>(), 'Invalid context'); //eth
            assert(user == contract_address_const::<0x0113c67ed78bc280887234fe5ed5e77272465317978ae86c25a71531d9332a2d>(), 'Invalid user');
        
            // Transfer debt tokens from user to gateway
            let erc20 = IERC20Dispatcher {
                contract_address: debt_asset,
            };
            let result = erc20.transfer_from(user, get_contract_address(), basic.amount);
            assert(result, Errors::TRANSFER_FAILED);

            // Create negative i257 for repay (reducing debt)
            let debt_amount = I257Impl::new(basic.amount, true);
            println!("debt_amount: {}", debt_amount);
            self.modify_debt_for(pool_id, collateral_asset, debt_asset, user, debt_amount);
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
            // Implementation
            let mut i: usize = 0;
            loop {
                if i >= instructions.len() {
                    break;
                }
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

        fn get_all_positions(self: @ContractState, user: ContractAddress) -> Array<(ContractAddress, ContractAddress, Position)> {
            let mut positions = array![];
            let supported_assets = self.get_supported_assets_array();
            let pool_id = self.pool_id.read();
            let singleton_dispatcher = ISingletonDispatcher {
                contract_address: self.vesu_singleton.read(),
            };

            // Iterate through all possible pairs of supported assets
            println!("supported_assets: {}", supported_assets.len());
            let len = supported_assets.len();
            for i in 0..len {
                let collateral_asset = *supported_assets.at(i);
                // Check position with zero debt first (earning positions)
                let (position, _, _) = singleton_dispatcher.position(pool_id, collateral_asset, Zero::zero(), user);
                if position.collateral_shares > 0 {
                    println!("found earning position");
                    positions.append((collateral_asset, Zero::zero(), position));
                }

                // Then check all other possible debt assets
                for j in 0..len {
                    if i == j {
                        continue; // Skip same asset pairs
                    }
                    let debt_asset = *supported_assets.at(j);
                    let (position, _, _) = singleton_dispatcher.position(pool_id, collateral_asset, debt_asset, user);
                    if position.collateral_shares > 0 || position.nominal_debt > 0 {
                        println!("found position");
                        positions.append((collateral_asset, debt_asset, position));
                    }
                }
            };
            positions
        }
    }
} 