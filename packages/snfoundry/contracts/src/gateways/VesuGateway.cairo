use starknet::ContractAddress;
use core::array::Array;
use core::array::Span;
use core::bool;
use crate::interfaces::IGateway::{IGateway, Collateral};

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
    impl IGatewayImpl of IGateway<ContractState> {
        fn deposit(ref self: ContractState, token: ContractAddress, user: ContractAddress, amount: u256) {
            let erc20 = IERC20Dispatcher {
                contract_address: token,
            };
            let result = erc20.transfer_from(get_caller_address(), get_contract_address(), amount);
            assert(result, Errors::TRANSFER_FAILED);

            let vToken = IVesuGatewayInternal::get_vtoken_for_collateral(@self, token);
            let erc4626 = IERC4626Dispatcher {
                contract_address: vToken,
            };
            
            assert(erc20.approve(vToken, amount), Errors::APPROVE_FAILED);
            erc4626.deposit(amount, user);
        }

        fn borrow(ref self: ContractState, token: ContractAddress, user: ContractAddress, amount: u256) {
            // Implementation
        }

        fn repay(ref self: ContractState, token: ContractAddress, user: ContractAddress, amount: u256) {
            // Implementation
        }

        fn deposit_collateral(
            ref self: ContractState,
            market: ContractAddress,
            collateral: ContractAddress,
            amount: u256,
            receiver: ContractAddress
        ) {
            self.deposit(collateral, receiver, amount);
        }

        fn withdraw_collateral(
            ref self: ContractState,
            market: ContractAddress,
            collateral: ContractAddress,
            user: ContractAddress,
            amount: u256
        ) -> (ContractAddress, u256) {
            // Implementation
            (collateral, amount)
        }

        fn get_balance(self: @ContractState, token: ContractAddress, user: ContractAddress) -> u256 {
            // Implementation
            0_u256
        }

        fn get_borrow_balance(self: @ContractState, token: ContractAddress, user: ContractAddress) -> u256 {
            // Implementation
            0_u256
        }

        fn get_borrow_balance_current(ref self: ContractState, token: ContractAddress, user: ContractAddress) -> u256 {
            // Implementation
            0_u256
        }

        fn get_borrow_rate(self: @ContractState, token: ContractAddress) -> (u256, bool) {
            // Implementation
            (0_u256, false)
        }

        fn get_supply_rate(self: @ContractState, token: ContractAddress) -> (u256, bool) {
            // Implementation
            (0_u256, false)
        }

        fn get_ltv(self: @ContractState, token: ContractAddress, user: ContractAddress) -> u256 {
            // Implementation
            0_u256
        }

        fn get_possible_collaterals(
            self: @ContractState,
            token: ContractAddress,
            user: ContractAddress
        ) -> (Array<ContractAddress>, Array<u256>, Array<felt252>, Array<u8>) {
            // Implementation
            (ArrayTrait::new(), ArrayTrait::new(), ArrayTrait::new(), ArrayTrait::new())
        }

        fn is_collateral_supported(
            self: @ContractState,
            market: ContractAddress,
            collateral: ContractAddress
        ) -> bool {
            // Implementation
            false
        }

        fn get_supported_collaterals(
            self: @ContractState,
            market: ContractAddress
        ) -> Array<ContractAddress> {
            // Implementation
            ArrayTrait::new()
        }

        fn get_encoded_collateral_approvals(
            self: @ContractState,
            token: ContractAddress,
            collaterals: Array<Collateral>
        ) -> (Array<ContractAddress>, Array<Span<felt252>>) {
            // Implementation
            (ArrayTrait::new(), ArrayTrait::new())
        }

        fn get_encoded_debt_approval(
            self: @ContractState,
            token: ContractAddress,
            amount: u256,
            user: ContractAddress
        ) -> (Array<ContractAddress>, Array<Span<felt252>>) {
            // Implementation
            (ArrayTrait::new(), ArrayTrait::new())
        }

        fn get_inbound_collateral_actions(
            self: @ContractState,
            token: ContractAddress,
            collaterals: Array<Collateral>
        ) -> (Array<ContractAddress>, Array<Span<felt252>>) {
            // Implementation
            (ArrayTrait::new(), ArrayTrait::new())
        }
    }
} 