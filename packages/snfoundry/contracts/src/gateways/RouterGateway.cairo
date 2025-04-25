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
    fn get_authorizations_for_instructions(ref self: TContractState, instructions: Span<ProtocolInstructions>) -> Span<(ContractAddress, felt252, Array<felt252>)>;
    fn move_debt(ref self: TContractState, instructions: Span<ProtocolInstructions>);
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
    use crate::interfaces::vesu::{IFlashloanReceiver, IFlashloanProviderDispatcher, IFlashloanProviderDispatcherTrait};

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
        flashloan_provider: ContractAddress,
    }

    #[constructor]
    fn constructor(ref self: ContractState, _owner: ContractAddress, flashloan_provider: ContractAddress) {
        self.owner.write(_owner);
        self.flashloan_provider.write(flashloan_provider);
    }

    #[generate_trait]
    impl InternalFunctions of InternalFunctionsTrait {
        fn before_send_instructions(ref self: ContractState, gateway: ContractAddress, instructions: Span<LendingInstruction>, should_transfer: bool) {
            let mut i: usize = 0;
            while i != instructions.len() {
                match instructions.at(i) {
                    LendingInstruction::Deposit(deposit) => {
                        let basic = *deposit.basic;
                        let erc20 = IERC20Dispatcher { contract_address: basic.token };
                        println!("before transfer {} ", basic.amount);
                        if should_transfer {
                            assert(erc20.transfer_from(get_caller_address(), get_contract_address(), basic.amount), 'transfer failed');
                        }
                        assert(erc20.approve(gateway, basic.amount), 'approve failed');
                    },
                    LendingInstruction::Repay(repay) => {
                        let basic = *repay.basic;
                        let erc20 = IERC20Dispatcher { contract_address: basic.token };
                        if should_transfer {
                            assert(erc20.transfer_from(get_caller_address(), get_contract_address(), basic.amount), 'transfer failed');
                        }
                        assert(erc20.approve(gateway, basic.amount), 'approve failed');
                    },
                    _ => {}
                }
                i += 1;
            }
        }

        fn after_send_instructions(ref self: ContractState, gateway: ContractAddress, instructions: Span<LendingInstruction>, should_transfer: bool) {
            let mut i: usize = 0;
            while i != instructions.len() {
                match instructions.at(i) {
                    LendingInstruction::Borrow(borrow) => {
                        let basic = *borrow.basic;
                        let erc20 = IERC20Dispatcher { contract_address: basic.token };
                        if should_transfer {
                            assert(erc20.transfer(basic.user, erc20.balance_of(get_contract_address())), 'transfer failed');
                        }
                    },
                    LendingInstruction::Withdraw(withdraw) => {
                        let basic = *withdraw.basic;
                        let erc20 = IERC20Dispatcher { contract_address: basic.token };
                        if should_transfer {
                            assert(erc20.transfer(basic.user, erc20.balance_of(get_contract_address())), 'transfer failed');
                        }
                    },
                    _ => {}
                }
                i += 1;
            }
        }

        fn process_protocol_instructions_internal(ref self: ContractState, instructions: Span<ProtocolInstructions>, should_transfer: bool) {
            let mut i: usize = 0;
            while i != instructions.len() {
                let protocol_instruction = instructions.at(i);
                let gateway = self.gateways.read(*protocol_instruction.protocol_name);
                assert(!gateway.is_zero(), 'Gateway not supported');

                let instructions_span = *protocol_instruction.instructions;
                println!("before send instructions");
                self.before_send_instructions(gateway, instructions_span, should_transfer);
                println!("processing instructions through gateway");
                let dispatcher = ILendingInstructionProcessorDispatcher { contract_address: gateway };
                dispatcher.process_instructions(instructions_span);
                println!("after send instructions");
                self.after_send_instructions(gateway, instructions_span, should_transfer);
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
            self.process_protocol_instructions_internal(instructions, true);
        }

        fn get_authorizations_for_instructions(ref self: ContractState, instructions: Span<ProtocolInstructions>) -> Span<(ContractAddress, felt252, Array<felt252>)> {
            let mut authorizations = ArrayTrait::new();
            for instruction in instructions {
                let gateway = self.gateways.read(*instruction.protocol_name);
                let dispatcher = ILendingInstructionProcessorDispatcher { contract_address: gateway };
                let gateway_authorizations = dispatcher.get_authorizations_for_instructions(*instruction.instructions);
                for authorization in gateway_authorizations {
                    let (token, selector, call_data) = authorization;
                    authorizations.append((*token, *selector, call_data.clone()));
                }
            }
            return authorizations.span();
        }

        fn move_debt(ref self: ContractState, instructions: Span<ProtocolInstructions>) {
            let flashloan_provider = IFlashloanProviderDispatcher { contract_address: self.flashloan_provider.read() };
            // Get first instruction and ensure it's a repay
            let first_protocol = instructions.at(0);
            let first_instruction = *first_protocol.instructions.at(0);
            let repay = match first_instruction {
                LendingInstruction::Repay(repay) => repay,
                _ => panic!("bad-instruction-order")
            };

            // Get asset and amount from repay instruction
            let asset = repay.basic.token;
            let amount = repay.basic.amount;
            let is_legacy = false;

            // Serialize instructions for flash loan data
            let mut data = ArrayTrait::new();
            Serde::serialize(@instructions, ref data);
            flashloan_provider.flash_loan(get_contract_address(), asset, amount, is_legacy, data.span());
        }
    }

    #[abi(embed_v0)]
    impl RouterGatewayFlashloanReceiver of IFlashloanReceiver<ContractState> {
        fn on_flash_loan(ref self: ContractState, sender: ContractAddress, asset: ContractAddress, amount: u256, data: Span<felt252>) {
            assert(sender == get_contract_address(), 'sender mismatch');
            let mut data = data;
            let mut protocol_instructions: Span<ProtocolInstructions> = Serde::deserialize(ref data).unwrap();

            self.process_protocol_instructions_internal(protocol_instructions, false); //no outside transfer, we do it in place

            // settle flash loan
            let erc20 = IERC20Dispatcher { contract_address: asset };
            let balance = erc20.balance_of(get_contract_address());
            println!("balance: {}", balance);
            let result = erc20.approve(get_caller_address(), amount);
            assert(result, 'transfer failed');
            println!("flash-loan-end");
        }
    }
}