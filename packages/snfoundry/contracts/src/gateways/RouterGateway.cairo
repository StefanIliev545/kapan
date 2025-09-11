use core::array::{Array, Span};
use core::bool;
use core::traits::Into;
use core::integer::BoundedInt;
use starknet::{ContractAddress};
    use crate::interfaces::IGateway::{
        LendingInstruction,
        Deposit,
        Withdraw,
        Borrow,
        Repay,
        Reborrow,
        Redeposit,
        Swap,
        BasicInstruction,
        InstructionOutput,
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
    fn process_protocol_instructions(
        ref self: TContractState,
        instructions: Span<ProtocolInstructions>
    ) -> Span<Span<InstructionOutput>>;
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

        // @dev - Internal function that translates redeposit and reborrow to normal borrow and deposit instructions as
        // those instructions only have a meaning here in the router during the flash loan process.
        fn remap_instructions(ref self: ContractState, instructions: Span<LendingInstruction>, gateway_outputs: Span<Span<InstructionOutput>>) -> Span<LendingInstruction> {
            let mut remappedInstructions = array![];
            for instruction in instructions {
                match instruction {
                    LendingInstruction::Reborrow(reborrow) => {
                        // Get the outputs from the target instruction (repay now returns two outputs: repaid_amount, refund_amount)
                        let target_outputs = *gateway_outputs.at(*reborrow.target_instruction_index);
                        let repaid_amount = *target_outputs.at(0).balance; // First output is what was repaid
                        remappedInstructions.append(LendingInstruction::Borrow(Borrow {
                            basic: BasicInstruction {
                                token: *reborrow.token,
                                amount: repaid_amount,
                                user: *reborrow.user,
                            },
                            context: *reborrow.context,
                        }));
                    },
                    LendingInstruction::Redeposit(redeposit) => {
                        // Get the output from the target instruction (withdraw output is what came out)
                        let target_outputs = *gateway_outputs.at(*redeposit.target_instruction_index);
                        let withdrawn_amount = *target_outputs.at(0).balance; // Withdraw output is what came out
                        remappedInstructions.append(LendingInstruction::Deposit(Deposit {
                            basic: BasicInstruction {
                                token: *redeposit.token,
                                amount: withdrawn_amount,
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

        // @dev - before sending instructions to the protocol's gateway we need to grant necessary approvals.
        fn before_send_instructions(ref self: ContractState, gateway: ContractAddress, instructions: Span<LendingInstruction>, should_transfer: bool) {
            let mut i: usize = 0;
            while i != instructions.len() {
                match instructions.at(i) {
                    LendingInstruction::Deposit(deposit) => {
                        let basic = *deposit.basic;
                        let erc20 = IERC20Dispatcher { contract_address: basic.token };
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
                        let mut amount = basic.amount;
                        if *repay.repay_all {
                            amount = BoundedInt::max();
                        }
                        assert(erc20.approve(gateway, amount), 'approve failed');
                    },
                    LendingInstruction::Swap(swap) => {
                        let swap = *swap;
                        let erc20 = IERC20Dispatcher { contract_address: swap.token_in };
                        if should_transfer {
                            assert(erc20.transfer_from(get_caller_address(), get_contract_address(), swap.max_in), 'transfer failed');
                        }
                        assert(erc20.approve(gateway, swap.max_in), 'approve failed');
                    },
                    _ => {}
                }
                i += 1;
            }
        }

        // @dev - after the instructions are executed we need to send back to the user the tokens.
        fn after_send_instructions(
            ref self: ContractState,
            gateway: ContractAddress,
            instructions: Span<LendingInstruction>,
            gateway_outputs: Span<Span<InstructionOutput>>,
            should_transfer: bool
        ) {
            if should_transfer {
                let mut i: usize = 0;
                while i != instructions.len() {
                    match instructions.at(i) {
                        LendingInstruction::Borrow(borrow) => {
                            let basic = *borrow.basic;
                            let erc20 = IERC20Dispatcher { contract_address: basic.token };
                            let output = *gateway_outputs.at(i).at(0);
                            assert(erc20.transfer(basic.user, output.balance), 'transfer failed');
                        },
                        LendingInstruction::Withdraw(withdraw) => {
                            let basic = *withdraw.basic;
                            let erc20 = IERC20Dispatcher { contract_address: basic.token };
                            let output = *gateway_outputs.at(i).at(0);
                            assert(erc20.transfer(basic.user, output.balance), 'transfer failed');
                        },
                        LendingInstruction::Repay(repay) => {
                            let basic = *repay.basic;
                            // Repay now returns two outputs: repaid_amount (index 0), refund_amount (index 1)
                            let refund_output = *gateway_outputs.at(i).at(1);
                            if refund_output.balance != 0 {
                                let erc20 = IERC20Dispatcher { contract_address: basic.token };
                                assert(erc20.transfer(basic.user, refund_output.balance), 'transfer failed');
                            }

                            if *repay.repay_all {
                                let erc20 = IERC20Dispatcher { contract_address: basic.token };
                                erc20.approve(gateway, 0);
                            }
                        },
                        LendingInstruction::Swap(swap) => {
                            let swap = *swap;
                            let output = *gateway_outputs.at(i).at(0);
                            if output.balance != 0 {
                                let erc20 = IERC20Dispatcher { contract_address: swap.token_in };
                                assert(erc20.transfer(get_caller_address(), output.balance), 'transfer failed');
                            }
                        },
                        _ => {}
                    }
                    i += 1;
                }
            }
        }

        // @dev - the core logic loop of the router. It goes protocol by protocol, giving approvals and transfering from caller
        // before forwarding to the concrete protocol's gateway. Then it looks at balance diffs and transfers back to the user.
        fn process_protocol_instructions_internal(
            ref self: ContractState,
            instructions: Span<ProtocolInstructions>,
            should_transfer: bool
        ) -> Span<Span<InstructionOutput>> {
            let mut i: usize = 0;
            let mut all_outputs = array![];
            while i != instructions.len() {
                let protocol_instruction = instructions.at(i);
                let gateway = self.gateways.read(*protocol_instruction.protocol_name);
                assert(!gateway.is_zero(), 'Gateway not supported');

                // Apply remapping (for redeposit/reborrow) using outputs from the previous protocol
                let mut instructions_span = *protocol_instruction.instructions;
                if all_outputs.len() != 0 {
                    instructions_span = self.remap_instructions(instructions_span, all_outputs.span());
                }

                // Process all instructions for this protocol at once
                self.before_send_instructions(gateway, instructions_span, should_transfer);
                let gateway_outputs = ILendingInstructionProcessorDispatcher { 
                    contract_address: gateway 
                }.process_instructions(instructions_span);
                self.after_send_instructions(gateway, instructions_span, gateway_outputs, should_transfer);
                for output_set in gateway_outputs {
                    all_outputs.append(*output_set);
                }
                i += 1;
            }
            all_outputs.span()
        }


        // @dev - gets how much to borrow for a flash loan. If we want to repay all, then we need to pull the current debt
        // at the time of processing the transaction as it varies with time.
        fn get_flash_loan_amount(ref self: ContractState, instructions: Span<ProtocolInstructions>) -> (ContractAddress, u256) {
            let mut flash_loan_amount: u256 = 0;
            let mut token: ContractAddress = Zero::zero();
            for protocolInstruction in instructions {
                for instruction in protocolInstruction.instructions {
                    if let LendingInstruction::Repay(repay) = instruction {
                        assert(*repay.basic.amount != 0, 'repay-amount-is-zero');
                        // If repay_all, get the amount from the gateway and add it to the flash loan amount
                        if *repay.repay_all {
                            let gateway = ILendingInstructionProcessorDispatcher { contract_address: self.gateways.read(*protocolInstruction.protocol_name) };
                            let (repay_token, repay_amount) = ( *repay.basic.token, gateway.get_flash_loan_amount(*repay) );
                            // If token is already set, ensure it matches
                            if token != Zero::zero() {
                                assert(token == repay_token, 'repay-token-mismatch');
                            }
                            token = repay_token;
                            flash_loan_amount += repay_amount;
                        } else {
                            // If token is already set, ensure it matches
                            if token != Zero::zero() {
                                assert(token == *repay.basic.token, 'repay-token-mismatch');
                            }
                            token = *repay.basic.token;
                            flash_loan_amount += *repay.basic.amount;
                        }
                    }
                }
            }
            (token, flash_loan_amount)
        }

        // @dev - as each instruction is carrying a user, we need to ensure it matches the caller.
        // A bit ugly, but it was an oversight in the design :/ 
        fn ensure_user_matches_caller(ref self: ContractState, instructions: Span<ProtocolInstructions>) {
            for protocolInstruction in instructions {
                // Ensure there is at most one borrow/withdraw per ERC20 token in this protocol's instruction list
                self.ensure_unique_diff_tokens(*protocolInstruction.instructions);
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
                        LendingInstruction::Swap(_) => {
                            continue;
                        },
                        _ => {
                            panic!("bad-instruction-order")
                        }
                    };
                    assert(*user == get_caller_address(), 'user mismatch');
                }
            }
        }

        // @dev - ensures there is only one Borrow or Withdraw instruction per ERC20 token in the same instructions span.
        fn ensure_unique_diff_tokens(ref self: ContractState, instructions: Span<LendingInstruction>) {
            // Keep track of tokens we have already seen in a borrow/withdraw instruction
            let mut seen_tokens = array![];
            for instr in instructions {
                match instr {
                    LendingInstruction::Borrow(borrow) => {
                        let token = *borrow.basic.token;
                        let mut i: usize = 0;
                        let mut found = false;
                        while i != seen_tokens.len() {
                            if *seen_tokens.at(i) == token {
                                found = true;
                            };
                            i += 1;
                        };
                        assert(!found, 'duplicate-borrow-withdraw-token');
                        seen_tokens.append(token);
                    },
                    LendingInstruction::Withdraw(withdraw) => {
                        let token = *withdraw.basic.token;
                        let mut i: usize = 0;
                        let mut found = false;
                        while i != seen_tokens.len() {
                            if *seen_tokens.at(i) == token {
                                found = true;
                            };
                            i += 1;
                        };
                        assert(!found, 'duplicate-borrow-withdraw-token');
                        seen_tokens.append(token);
                    },
                    LendingInstruction::Reborrow(reborrow) => {
                        let token = *reborrow.token;
                        let mut i: usize = 0;
                        let mut found = false;
                        while i != seen_tokens.len() {
                            if *seen_tokens.at(i) == token {
                                found = true;
                            };
                            i += 1;
                        };
                        assert(!found, 'duplicate-borrow-withdraw-token');
                        seen_tokens.append(token);
                    },
                    LendingInstruction::Repay(repay) => {
                        let token = *repay.basic.token;
                        let mut i: usize = 0;
                        let mut found = false;
                        while i != seen_tokens.len() {
                            if *seen_tokens.at(i) == token {
                                found = true;
                            };
                            i += 1;
                        };
                        assert(!found, 'duplicate-borrow-withdraw-token');
                        seen_tokens.append(token);
                    },
                    _ => {}
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

        // @dev - entrypoint for all processing of logic. Allows bundling multiple operations in one single call,
        // like deposit and borrow for example. 
        fn process_protocol_instructions(
            ref self: ContractState,
            instructions: Span<ProtocolInstructions>
        ) -> Span<Span<InstructionOutput>> {
            self.ensure_user_matches_caller(instructions);
            self.process_protocol_instructions_internal(instructions, true)
        }

        // @dev - view function that returns encoded calls which are used to give approval for the operations desired in the instructions.
        // This is used in the UI, but can be used by other contracts. Relies on the assumption that none of the contracts are upgradeable.
        // Otherwise integrating this function in a contract would be unsafe.
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

        // @dev - entrypoint for the logic that refinances debt between two protocols.
        // It is a wrapper around the flash loan logic, which redirects back to processing protocol instructions.
        // Ensures that the flash loan reflects accurate debt amounts as they scale with time and you cannot craft a transaction
        // that exactly matches the debt amount, thus the contract needs to replace the amount to be borrowed if we want to repay all.
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
        // @dev - The callback function that vesu calls when the flash loan is executed.
        // Relies on the assumption that sender cannot be cheated as it prevents other contracts from calling this through
        // the flash loan provider.
        fn on_flash_loan(ref self: ContractState, sender: ContractAddress, asset: ContractAddress, amount: u256, data: Span<felt252>) {
            assert(get_caller_address() == self.flashloan_provider.read(), 'caller-not-flashprovider');
            assert(sender == get_contract_address(), 'sender mismatch');
            let mut data = data;
            let mut protocol_instructions: Span<ProtocolInstructions> = Serde::deserialize(ref data).unwrap();
                  // Collect all repay amounts and calculate total
            let mut repay_amounts = array![];
            let mut total_repay_amount = 0;
            let mut repay_count = 0;
            
            // First pass: Collect all repay amounts and count
            for protocolInstruction in protocol_instructions {
                let gateway_addr = self.gateways.read(*protocolInstruction.protocol_name);
                let gateway = ILendingInstructionProcessorDispatcher { contract_address: gateway_addr };
                for instruction in protocolInstruction.instructions {
                    if let LendingInstruction::Repay(repay) = instruction {
                        let repay = *repay;
                        let mut this_amount = repay.basic.amount;
                        if repay.repay_all {
                            // For repay_all, fetch the exact current debt amount from the gateway
                            this_amount = gateway.get_flash_loan_amount(repay);
                        }
                        repay_amounts.append(this_amount);
                        total_repay_amount += this_amount;
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
                            let mut modified_amount = *repay_amounts.at(repay_index);
                            
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
            

            let _ = self.process_protocol_instructions_internal(remadeProtocolInstructions.span(), false); //no outside transfer, we do it in place

            // settle flash loan
            let erc20 = IERC20Dispatcher { contract_address: asset };
            let result = erc20.approve(get_caller_address(), amount);
            assert(result, 'transfer failed');
        }
    }
}