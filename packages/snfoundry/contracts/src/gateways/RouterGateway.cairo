use core::array::{Array, Span};
use core::bool;
use core::traits::Into;
use starknet::{ContractAddress, get_caller_address};
use crate::interfaces::IGateway::{
    ILendingInstructionProcessor, LendingInstruction,
    Deposit, Withdraw, Borrow, Repay,
    ILendingInstructionProcessorDispatcher,
    ILendingInstructionProcessorDispatcherTrait
};
use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};

#[derive(Drop, Serde)]
pub struct ProtocolInstructions {
    pub protocol_name: felt252,
    pub instructions: Span<LendingInstruction>,
}

#[starknet::interface]
pub trait RouterGatewayTrait<TContractState> {
    fn add_gateway(ref self: TContractState, protocol_name: felt252, gateway: ContractAddress);
    fn process_protocol_instructions(ref self: TContractState, instructions: Span<ProtocolInstructions>);
}

#[starknet::contract]
mod RouterGateway {
    use core::num::traits::Zero;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess,
        StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use super::*;
    use starknet::{contract_address_const, get_caller_address, get_contract_address};


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
    }

    #[constructor]
    fn constructor(ref self: ContractState, _owner: ContractAddress) {
        self.owner.write(_owner);
    }

    #[generate_trait]
    impl InternalFunctions of InternalFunctionsTrait {
        fn before_send_instructions(ref self: ContractState,gateway: ContractAddress, instructions: Span<LendingInstruction>) {
            let mut i: usize = 0;
            while i != instructions.len() {
                match instructions.at(i) {
                    LendingInstruction::Deposit(deposit) => {
                        let basic = *deposit.basic;
                        let erc20 = IERC20Dispatcher { contract_address: basic.token };
                        assert(basic.user == get_caller_address(), 'user mismatch');
                        println!("before transfer {} ", basic.amount);
                        assert(erc20.transfer_from(get_caller_address(), get_contract_address(), basic.amount), 'transfer failed');
                        assert(erc20.approve(gateway, basic.amount), 'approve failed');
                    },
                    LendingInstruction::Repay(repay) => {
                        let basic = *repay.basic;
                        let erc20 = IERC20Dispatcher { contract_address: basic.token };
                        assert(erc20.transfer_from(get_caller_address(), get_contract_address(), basic.amount), 'transfer failed');
                        assert(erc20.approve(gateway, basic.amount), 'approve failed');
                    },
                    _ => {}
                }
                i += 1;
            }
        }

        fn after_send_instructions(ref self: ContractState, gateway: ContractAddress, instructions: Span<LendingInstruction>) {
            let mut i: usize = 0;
            while i != instructions.len() {
                match instructions.at(i) {
                    LendingInstruction::Borrow(borrow) => {
                        let basic = *borrow.basic;
                        let erc20 = IERC20Dispatcher { contract_address: basic.token };
                        assert(erc20.transfer(basic.user, erc20.balance_of(get_contract_address())), 'transfer failed');
                    },
                    LendingInstruction::Withdraw(withdraw) => {
                        let basic = *withdraw.basic;
                        let erc20 = IERC20Dispatcher { contract_address: basic.token };
                        assert(erc20.transfer(basic.user, erc20.balance_of(get_contract_address())), 'transfer failed');
                    },
                    _ => {}
                }
                i += 1;
            }
        }
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

        fn process_protocol_instructions(ref self: ContractState, instructions: Span<ProtocolInstructions>) {
            let mut i: usize = 0;
            while i != instructions.len() {
                let protocol_instruction = instructions.at(i);
                let gateway = self.gateways.read(*protocol_instruction.protocol_name);
                assert(!gateway.is_zero(), 'Gateway not supported');

                let instructions_span = *protocol_instruction.instructions;
                println!("before send instructions");
                self.before_send_instructions(gateway, instructions_span);
                println!("processing instructions through gateway");
                let dispatcher = ILendingInstructionProcessorDispatcher { contract_address: gateway };
                dispatcher.process_instructions(instructions_span);
                println!("after send instructions");
                self.after_send_instructions(gateway, instructions_span);
                i += 1;
            }
        }
    }
}
