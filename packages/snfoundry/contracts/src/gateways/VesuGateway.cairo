use starknet::ContractAddress;
use core::array::Array;
use core::array::Span;
use core::bool;

pub mod Errors {
    pub const APPROVE_FAILED: felt252 = 'Approve failed';
    pub const TRANSFER_FAILED: felt252 = 'Transfer failed';
}

#[starknet::interface]
trait IVesuGatewayAdmin<TContractState> {
    fn add_asset(ref self: TContractState, asset: ContractAddress);
    fn get_supported_assets(self: @TContractState) -> Array<ContractAddress>;
}

#[starknet::contract]
mod VesuGateway {
    use super::*;
    use openzeppelin::access::ownable::OwnableComponent;
    use openzeppelin::token::erc20::interface::{IERC20DispatcherTrait, IERC20Dispatcher};
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
    };

    use crate::interfaces::vesu::{
        IDefaultExtensionCLDispatcher,
        IDefaultExtensionCLDispatcherTrait,
        IERC4626Dispatcher,
        IERC4626DispatcherTrait,
        ISingletonDispatcher,
        ISingletonDispatcherTrait,
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

    #[derive(Drop, Serde)]
    struct VesuContext {
        // Vesu has pools and positions. Debt is isolated in pairs to a collateral. 
        pub pool_id: felt252, // This allows targeting a specific pool besides genesis.
        pub positionCounterpartToken: ContractAddress, // This is either the collateral or the debt token depending on the instruction.
    }

    trait IVesuGatewayInternal {
        fn get_vtoken_for_collateral(self: @ContractState, collateral: ContractAddress) -> ContractAddress;
        fn deposit(ref self: ContractState, instruction: @Deposit);
        fn withdraw(ref self: ContractState, instruction: @Withdraw);
        fn borrow(ref self: ContractState, instruction: @Borrow);
        fn repay(ref self: ContractState, instruction: @Repay);
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

            let vToken = self.get_vtoken_for_collateral(basic.token);
            let erc4626 = IERC4626Dispatcher {
                contract_address: vToken,
            };
            
            assert(erc20.approve(vToken, basic.amount), Errors::APPROVE_FAILED);
            erc4626.deposit(basic.amount, basic.user);
        }

        fn withdraw(ref self: ContractState, instruction: @Withdraw) {
        }

        fn borrow(ref self: ContractState, instruction: @Borrow) {
        }

        fn repay(ref self: ContractState, instruction: @Repay) {
        }
    }

    #[abi(embed_v0)]
    impl IVesuGatewayAdminImpl of IVesuGatewayAdmin<ContractState> {

        fn add_asset(ref self: ContractState, asset: ContractAddress) {
            self.ownable.assert_only_owner();
            self.supported_assets.append().write(asset);
        }

        fn get_supported_assets(self: @ContractState) -> Array<ContractAddress> {
            let mut addresses = array![];
            for i in 0..self.supported_assets.len() {
                addresses.append(self.supported_assets.at(i).read());
            }
            addresses
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
                    LendingInstruction::Withdraw(_withdraw_params) => {
                        // TODO: Implement withdraw instruction handling  
                    },
                    LendingInstruction::Borrow(_borrow_params) => {
                        // TODO: Implement borrow instruction handling
                    },
                    LendingInstruction::Repay(_repay_params) => {
                        // TODO: Implement repay instruction handling
                    },
                }
                i += 1;
            }
        }
    }
} 