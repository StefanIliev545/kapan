use core::array::{Array, Span};
use core::bool;
use core::traits::Into;
use starknet::{ContractAddress, get_caller_address};
use crate::interfaces::IGateway::{Collateral, IGatewayDispatcher, IGatewayDispatcherTrait};

#[starknet::interface]
trait RouterGatewayTrait<TContractState> {
    fn add_gateway(ref self: TContractState, protocol_name: felt252, gateway: ContractAddress);
    fn supply(
        ref self: TContractState,
        protocol_name: felt252,
        token: ContractAddress,
        user: ContractAddress,
        amount: u256,
    );
    fn move_debt(
        ref self: TContractState,
        user: ContractAddress,
        debt_token: ContractAddress,
        debt_amount: u256,
        repay_all: bool,
        collaterals: Array<Collateral>,
        from_protocol: felt252,
        to_protocol: felt252,
        flash_loan_version: felt252,
    );
    fn get_gateway_balance(
        self: @TContractState,
        protocol_name: felt252,
        token: ContractAddress,
        user: ContractAddress,
    ) -> u256;
}

#[starknet::interface]
trait IFlashLoanProvider<TContractState> {
    fn flash_loan(
        ref self: TContractState,
        receiver: ContractAddress,
        tokens: Array<ContractAddress>,
        amounts: Array<u256>,
        user_data: Array<felt252>,
    );
}

#[starknet::interface]
trait IBalancerV3Vault<TContractState> {
    fn send_to(
        ref self: TContractState, token: ContractAddress, recipient: ContractAddress, amount: u256,
    );
    fn settle(ref self: TContractState, token: ContractAddress, amount: u256);
    fn unlock(ref self: TContractState, data: Array<felt252>);
}

#[starknet::contract]
mod RouterGateway {
    use core::num::traits::Zero;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePathEntry,
        StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use super::*;

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        GatewayAdded: GatewayAdded,
    }

    #[derive(Drop, starknet::Event)]
    struct GatewayAdded {
        protocol_name: felt252,
        gateway: ContractAddress,
    }

    #[storage]
    struct Storage {
        owner: ContractAddress,
        gateways: Map<felt252, ContractAddress>,
        balancer_v3_vault: ContractAddress,
        balancer_v2_vault: ContractAddress,
        flash_loan_enabled: bool,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        v3_vault: ContractAddress,
        v2_vault: ContractAddress,
        _owner: ContractAddress,
    ) {
        self.owner.write(_owner);
        self.balancer_v3_vault.write(v3_vault);
        self.balancer_v2_vault.write(v2_vault);
        self.flash_loan_enabled.write(false);
    }

    #[abi(embed_v0)]
    impl RouterGatewayImpl of super::RouterGatewayTrait<ContractState> {
        fn add_gateway(ref self: ContractState, protocol_name: felt252, gateway: ContractAddress) {
            // Only owner can add gateways
            assert(get_caller_address() == self.owner.read(), 'Caller is not owner');
            self.gateways.write(protocol_name, gateway);
            // Emit event
            self.emit(GatewayAdded { protocol_name, gateway });
        }

        fn supply(
            ref self: ContractState,
            protocol_name: felt252,
            token: ContractAddress,
            user: ContractAddress,
            amount: u256,
        ) {
            let gateway = self.gateways.read(protocol_name);
            assert(!gateway.is_zero(), 'Protocol not supported');

            // TODO: Implement token transfer and approval logic
            // This would require IERC20 interface implementation

            // Forward deposit call to the appropriate gateway
            IGatewayDispatcher { contract_address: gateway }.deposit(token, user, amount);
        }

        fn move_debt(
            ref self: ContractState,
            user: ContractAddress,
            debt_token: ContractAddress,
            debt_amount: u256,
            repay_all: bool,
            collaterals: Array<Collateral>,
            from_protocol: felt252,
            to_protocol: felt252,
            flash_loan_version: felt252,
        ) {
            // Verify caller is the user
            assert(get_caller_address() == user, 'User must be caller');
            assert(debt_amount > 0, 'Debt amount must be > 0');

            let mut final_debt_amount = debt_amount;
            if repay_all {
                let from_gateway = self.gateways.read(from_protocol);
                assert(!from_gateway.is_zero(), 'From protocol not supported');
                final_debt_amount = IGatewayDispatcher { contract_address: from_gateway }
                    .get_borrow_balance_current(debt_token, user);
            }
            // TODO: Implement flash loan logic for both v2 and v3
        // This would require additional interfaces and complex encoding/decoding
        }

        fn get_gateway_balance(
            self: @ContractState,
            protocol_name: felt252,
            token: ContractAddress,
            user: ContractAddress,
        ) -> u256 {
            let gateway = self.gateways.entry(protocol_name).read();
            assert(!gateway.is_zero(), 'Protocol not supported');
            IGatewayDispatcher { contract_address: gateway }.get_balance(token, user)
        }
    }

    #[generate_trait]
    impl InternalFunctions of InternalFunctionsTrait {
        fn _move_debt_common(
            ref self: ContractState,
            user: ContractAddress,
            debt_token: ContractAddress,
            debt_amount: u256,
            collaterals: Array<Collateral>,
            from_protocol: felt252,
            to_protocol: felt252,
        ) {
            let from_gateway = self.gateways.read(from_protocol);
            let to_gateway = self.gateways.read(to_protocol);

            assert(!from_gateway.is_zero(), 'From protocol not supported');
            assert(!to_gateway.is_zero(), 'To protocol not supported');
            // TODO: Implement the debt moving logic
        // This would require complex token approval and transfer logic
        }
    }
}
