use core::array::{Array, Span};
use core::bool;
use core::traits::Into;
use starknet::{ContractAddress};
use crate::interfaces::IGateway::{
    LendingInstruction,
    Deposit, 
    Withdraw, 
    Borrow, 
    Repay, 
    Reborrow,
    Redeposit,
    BasicInstruction,
    ILendingInstructionProcessorDispatcher,
    ILendingInstructionProcessorDispatcherTrait
};
use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};

#[derive(Drop, Serde, Copy)]
pub struct ProtocolInstructions {
    pub protocol_name: felt252,
    pub instructions: Span<LendingInstruction>,
}

#[starknet::interface]
pub trait RouterGatewayTrait<TContractState> {
    fn add_gateway(ref self: TContractState, protocol_name: felt252, gateway: ContractAddress);
    fn process_protocol_instructions(ref self: TContractState, instructions: Span<ProtocolInstructions>);
    fn get_authorizations_for_instructions(ref self: TContractState, instructions: Span<ProtocolInstructions>, rawSelectors: bool) -> Span<(ContractAddress, felt252, Array<felt252>)>;
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

        fn remap_instructions(ref self: ContractState, instructions: Span<LendingInstruction>, balanceDiffs: Span<u256>) -> Span<LendingInstruction> {
            let mut remappedInstructions = array![];
            for instruction in instructions {
                match instruction {
                    LendingInstruction::Reborrow(reborrow) => {
                        remappedInstructions.append(LendingInstruction::Borrow(Borrow {
                            basic: BasicInstruction {
                                token: *reborrow.token,
                                amount: *balanceDiffs.at(*reborrow.target_instruction_index),
                                user: *reborrow.user,
                            },
                            context: *reborrow.context,
                        }));
                    },
                    LendingInstruction::Redeposit(redeposit) => {
                        remappedInstructions.append(LendingInstruction::Deposit(Deposit {
                            basic: BasicInstruction {
                                token: *redeposit.token,
                                amount: *balanceDiffs.at(*redeposit.target_instruction_index),
                                user: *redeposit.user,
                            },
                            context: *redeposit.context,
                        }));
                    },
                    _ => {
                        remappedInstructions.append(*instruction);
                    }
                }
            }
            remappedInstructions.span()
        }
        fn before_send_instructions(ref self: ContractState, gateway: ContractAddress, instructions: Span<LendingInstruction>, should_transfer: bool) -> Span<u256> {
            let mut i: usize = 0;
            let mut balancesBefore = array![];
            while i != instructions.len() {
                match instructions.at(i) {
                    LendingInstruction::Deposit(deposit) => {
                        let basic = *deposit.basic;
                        let erc20 = IERC20Dispatcher { contract_address: basic.token };
                        if should_transfer {
                            assert(erc20.transfer_from(get_caller_address(), get_contract_address(), basic.amount), 'transfer failed');
                        }
                        assert(erc20.approve(gateway, basic.amount), 'approve failed');
                        let balance = erc20.balance_of(get_contract_address());
                        balancesBefore.append(balance);
                    },
                    LendingInstruction::Repay(repay) => {
                        let basic = *repay.basic;
                        let erc20 = IERC20Dispatcher { contract_address: basic.token };
                        if should_transfer {
                            assert(erc20.transfer_from(get_caller_address(), get_contract_address(), basic.amount), 'transfer failed');
                        }
                        assert(erc20.approve(gateway, basic.amount), 'approve failed');
                        let balance = erc20.balance_of(get_contract_address());
                        balancesBefore.append(balance);
                    },
                    LendingInstruction::Withdraw(withdraw) => {
                        let basic = *withdraw.basic;
                        let erc20 = IERC20Dispatcher { contract_address: basic.token };
                        let balance = erc20.balance_of(get_contract_address());
                        balancesBefore.append(balance);
                    },
                    LendingInstruction::Borrow(borrow) => {
                        let basic = *borrow.basic;
                        let erc20 = IERC20Dispatcher { contract_address: basic.token };
                        let balance = erc20.balance_of(get_contract_address());
                        balancesBefore.append(balance);
                    },
                    _ => {}
                }
                i += 1;
            }
            balancesBefore.span()
        }

        fn after_send_instructions(ref self: ContractState, gateway: ContractAddress, instructions: Span<LendingInstruction>, balancesBefore: Span<u256>, should_transfer: bool) -> Span<u256> {
            let mut i: usize = 0;
            let mut balancesAfter = array![];
            while i != instructions.len() {
                match instructions.at(i) {
                    LendingInstruction::Borrow(borrow) => {
                        let basic = *borrow.basic;
                        let erc20 = IERC20Dispatcher { contract_address: basic.token };
                        if should_transfer {
                            assert(erc20.transfer(basic.user, erc20.balance_of(get_contract_address())), 'transfer failed');
                        }
                        let balance = erc20.balance_of(get_contract_address());
                        balancesAfter.append(balance - *balancesBefore.at(i));
                    },
                    LendingInstruction::Withdraw(withdraw) => {
                        let basic = *withdraw.basic;
                        let erc20 = IERC20Dispatcher { contract_address: basic.token };
                        let balance = erc20.balance_of(get_contract_address());
                        let diff = balance - *balancesBefore.at(i);
                        balancesAfter.append(diff);
                        if should_transfer {
                            erc20.transfer(basic.user, diff);
                        }
                    },
                    LendingInstruction::Repay(repay) => {
                        let basic = *repay.basic;
                        let erc20 = IERC20Dispatcher { contract_address: basic.token };
                        let balance = erc20.balance_of(get_contract_address());
                        let diff = *balancesBefore.at(i) - balance;
                        balancesAfter.append(diff);
                        if basic.amount > diff {
                            let erc20 = IERC20Dispatcher { contract_address: basic.token };
                            erc20.transfer(basic.user, basic.amount - diff);
                        }
                    },
                    LendingInstruction::Deposit(deposit) => {
                        let basic = *deposit.basic;
                        let erc20 = IERC20Dispatcher { contract_address: basic.token };
                        let balance = erc20.balance_of(get_contract_address());
                        balancesAfter.append(*balancesBefore.at(i) - balance);
                    },
                    _ => {}
                }
                i += 1;
            }
            balancesAfter.span()
        }

        fn process_protocol_instructions_internal(ref self: ContractState, instructions: Span<ProtocolInstructions>, should_transfer: bool) {
            let mut i: usize = 0;
            let mut balancesDiffs = array![].span();
            while i != instructions.len() {
                let protocol_instruction = instructions.at(i);
                let gateway = self.gateways.read(*protocol_instruction.protocol_name);
                assert(!gateway.is_zero(), 'Gateway not supported');

                let mut instructions_span = *protocol_instruction.instructions;
                if balancesDiffs.len() != 0 {
                    instructions_span = self.remap_instructions(instructions_span, balancesDiffs);
                }

                let balancesBefore = self.before_send_instructions(gateway, instructions_span, should_transfer);
                let dispatcher = ILendingInstructionProcessorDispatcher { contract_address: gateway };
                dispatcher.process_instructions(instructions_span);
                balancesDiffs = self.after_send_instructions(gateway, instructions_span, balancesBefore, should_transfer);
                i += 1;
            }
        }



        fn get_flash_loan_amount(ref self: ContractState, instructions: Span<ProtocolInstructions>) -> (ContractAddress, u256) {
           let mut flash_loan_amount : u256 = 0;
           let mut token : ContractAddress = Zero::zero();
           for protocolInstruction in instructions {
                for instruction in protocolInstruction.instructions {
                    if let LendingInstruction::Repay(repay) = instruction {
                        assert(*repay.basic.amount != 0, 'repay-amount-is-zero');
                        if *repay.repay_all {
                            let gateway = ILendingInstructionProcessorDispatcher { contract_address: self.gateways.read(*protocolInstruction.protocol_name) };
                            return (*repay.basic.token, gateway.get_flash_loan_amount(*repay));
                        }
                        flash_loan_amount += *repay.basic.amount;
                        token = *repay.basic.token;
                    }
                };
           };
           (token, flash_loan_amount)
        }

        fn ensure_user_matches_caller(ref self: ContractState, instructions: Span<ProtocolInstructions>) {
            for protocolInstruction in instructions {
                for instruction in protocolInstruction.instructions {
                    let user = match instruction {
                        LendingInstruction::Repay(repay) => {
                            let basic = repay.basic;
                            basic.user
                        },
                        LendingInstruction::Borrow(borrow) => {
                            let basic = borrow.basic;
                            basic.user
                        },
                        LendingInstruction::Withdraw(withdraw) => {
                            let basic = withdraw.basic;
                            basic.user
                        },
                        LendingInstruction::Deposit(deposit) => {
                            let basic = deposit.basic;
                            basic.user
                        },
                        LendingInstruction::Reborrow(reborrow) => {
                           reborrow.user
                        },
                        LendingInstruction::Redeposit(redeposit) => {
                            redeposit.user
                        },
                        _ => {
                            panic!("bad-instruction-order")
                        }
                    };
                    assert(*user == get_caller_address(), 'user mismatch');
                }
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
            self.ensure_user_matches_caller(instructions);
            self.process_protocol_instructions_internal(instructions, true);
        }

        fn get_authorizations_for_instructions(ref self: ContractState, instructions: Span<ProtocolInstructions>, rawSelectors: bool) -> Span<(ContractAddress, felt252, Array<felt252>)> {
            let mut authorizations = ArrayTrait::new();
            for instruction in instructions {
                let gateway = self.gateways.read(*instruction.protocol_name);
                let dispatcher = ILendingInstructionProcessorDispatcher { contract_address: gateway };
                let gateway_authorizations = dispatcher.get_authorizations_for_instructions(*instruction.instructions, rawSelectors);
                for authorization in gateway_authorizations {
                    let (token, selector, call_data) = authorization;
                    authorizations.append((*token, *selector, call_data.clone()));
                }
            };
            return authorizations.span();
        }

        fn move_debt(ref self: ContractState, instructions: Span<ProtocolInstructions>) {
            self.ensure_user_matches_caller(instructions);
            let flashloan_provider = IFlashloanProviderDispatcher { contract_address: self.flashloan_provider.read() };
            let (asset, amount) = self.get_flash_loan_amount(instructions);
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
                  // Collect all repay amounts and calculate total
            let mut repay_amounts = array![];
            let mut total_repay_amount = 0;
            let mut repay_count = 0;
            
            // First pass: Collect all repay amounts and count
            for protocolInstruction in protocol_instructions {
                for instruction in protocolInstruction.instructions {
                    if let LendingInstruction::Repay(repay) = instruction {
                        let repay = *repay;
                        repay_amounts.append(repay.basic.amount);
                        total_repay_amount += repay.basic.amount;
                        repay_count += 1;
                    }
                }
            }
            
            // Calculate remaining amount to distribute
            let remaining_amount = amount - total_repay_amount;
            assert(remaining_amount >= 0, 'flashloan insufficient');
            
            // Second pass: Modify instructions with adjusted amounts
            let mut remadeProtocolInstructions = array![];
            let mut repay_index = 0;
            
            for instruction in protocol_instructions {
                let mut remadeInstructions = array![];
                for instruction in instruction.instructions {
                    match instruction {
                        LendingInstruction::Repay(repay) => {
                            let repay = *repay;
                            let mut modified_amount = repay.basic.amount;
                            
                            // Add remaining amount to last repay
                            if repay_index == repay_count - 1 {
                                modified_amount += remaining_amount;
                            }
                            
                            assert(modified_amount <= amount, 'repay amount exceeds flash loan');
                            
                            remadeInstructions.append(LendingInstruction::Repay(Repay {
                                basic: BasicInstruction {
                                    token: repay.basic.token,
                                    amount: modified_amount,
                                    user: repay.basic.user,
                                },
                                repay_all: false, // Force explicit amount
                                context: repay.context,
                            }));
                            
                            repay_index += 1;
                        },
                        _ => {
                            remadeInstructions.append(*instruction);
                        }
                    }
                }
                remadeProtocolInstructions.append(ProtocolInstructions {
                    protocol_name: *instruction.protocol_name,
                    instructions: remadeInstructions.span(),
                });
            }
            

            self.process_protocol_instructions_internal(remadeProtocolInstructions.span(), false); //no outside transfer, we do it in place

            // settle flash loan
            let erc20 = IERC20Dispatcher { contract_address: asset };
            let result = erc20.approve(get_caller_address(), amount);
            assert(result, 'transfer failed');
        }
    }
}