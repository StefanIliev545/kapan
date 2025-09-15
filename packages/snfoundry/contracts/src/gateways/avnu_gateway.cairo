use core::array::{Array, ArrayTrait, Span};
use starknet::ContractAddress;
use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
use crate::interfaces::IGateway::{
    LendingInstruction,
    Swap,
    SwapExactIn,
    ILendingInstructionProcessor,
    Repay,
    InstructionOutput,
};
use starknet::{ClassHash, get_caller_address, get_contract_address};

#[derive(Drop, Serde, Clone)]
pub struct Route {
    pub sell_token: ContractAddress,
    pub buy_token: ContractAddress,
    pub exchange_address: ContractAddress,
    pub percent: u128,
    pub additional_swap_params: Array<felt252>,
}

// Avnu context for passing swap parameters
#[derive(Drop, Serde)]
pub struct AvnuContext {
    pub routes: Array<Route>,
    pub integrator_fee_amount_bps: u128,
    pub integrator_fee_recipient: ContractAddress,
    pub amount: u256,
}

#[starknet::interface]
pub trait IExchange<TContractState> {
    fn initialize(
        ref self: TContractState,
        owner: ContractAddress,
        fee_recipient: ContractAddress,
        fees_bps_0: u128,
        fees_bps_1: u128,
        swap_exact_token_to_fees_bps: u128,
    );
    fn get_adapter_class_hash(self: @TContractState, exchange_address: ContractAddress) -> ClassHash;
    fn set_adapter_class_hash(ref self: TContractState, exchange_address: ContractAddress, adapter_class_hash: ClassHash) -> bool;
    fn multi_route_swap(
        ref self: TContractState,
        sell_token_address: ContractAddress,
        sell_token_amount: u256,
        buy_token_address: ContractAddress,
        buy_token_amount: u256,
        buy_token_min_amount: u256,
        beneficiary: ContractAddress,
        integrator_fee_amount_bps: u128,
        integrator_fee_recipient: ContractAddress,
        routes: Array<Route>,
    ) -> bool;
    fn swap_exact_token_to(
        ref self: TContractState,
        sell_token_address: ContractAddress,
        sell_token_amount: u256,
        sell_token_max_amount: u256,
        buy_token_address: ContractAddress,
        buy_token_amount: u256,
        beneficiary: ContractAddress,
        integrator_fee_amount_bps: u128,
        integrator_fee_recipient: ContractAddress,
        routes: Array<Route>,
    ) -> bool;
}

#[starknet::contract]
pub mod AvnuGateway {
    use super::*;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    #[storage]
    struct Storage {
        // Mainnet Avnu router address: 0x04270219d365d6b017231b52e92b3fb5d7c8378b05e9abc97724537a80e93b0f
        router: IExchangeDispatcher,
    }

    #[constructor]
    fn constructor(ref self: ContractState, router: ContractAddress) {
        self.router.write(IExchangeDispatcher { contract_address: router });
    }

    #[generate_trait]
    impl InternalFunctions of InternalFunctionsTrait {
        fn execute_swap_exact_out(ref self: ContractState, swap: @Swap) -> (u256, u256) {
            let swap = *swap;
          
            // Transfer max_in tokens from caller to this contract
            let erc20 = IERC20Dispatcher { contract_address: swap.token_in };
            assert(erc20.transfer_from(get_caller_address(), get_contract_address(), swap.max_in), 'transfer failed');

            // Approve Avnu router to pull tokens from this contract
            erc20.approve(self.router.read().contract_address, swap.max_in);

            // Extract Avnu context from swap context if provided
            let (routes, _integrator_fee_amount_bps, _integrator_fee_recipient, _amount) = if let Option::Some(context_data) = swap.context {
                    // Deserialize AvnuContext from context
                let mut context_span = context_data;
                let avnu_context: AvnuContext = Serde::deserialize(ref context_span).unwrap();
                      (avnu_context.routes, avnu_context.integrator_fee_amount_bps, avnu_context.integrator_fee_recipient, avnu_context.amount)
            } else {
                // Default values if no context provided
                (array![], 0, swap.user, 0)
            };

            // Call Avnu's swap_exact_token_to for exact output
            // For exact out: we want exactly `exact_out` amount of buy_token, willing to spend up to `max_in` of sell_token
            let success = self.router.read().swap_exact_token_to(
                swap.token_in,           // sell_token_address
                _amount,             // sell_token_amount (max amount we're willing to spend)
                swap.max_in,             // sell_token_max_amount (same as max_in for exact output)
                swap.token_out,          // buy_token_address
                swap.exact_out,          // buy_token_amount (exact amount we want)
                get_contract_address(),  // beneficiary
                _integrator_fee_amount_bps, // integrator_fee_amount_bps from AvnuContext
                _integrator_fee_recipient,  // integrator_fee_recipient from AvnuContext
                routes,                  // routes from AvnuContext
            );


            assert(success, 'avnu swap failed');

            // Refund any leftover token_in back to the caller
            let in_balance = erc20.balance_of(get_contract_address());
            if in_balance > 0 {
                assert(erc20.transfer(get_caller_address(), in_balance), 'refund failed');
            }

            let out_erc20 = IERC20Dispatcher { contract_address: swap.token_out };
            let out_balance = out_erc20.balance_of(get_contract_address());
            if out_balance > 0 {
                assert(out_erc20.transfer(get_caller_address(), out_balance), 'refund failed');
            }
            
            (in_balance, out_balance)
        }

        fn execute_swap_exact_in(ref self: ContractState, swap: @SwapExactIn) -> (u256, u256) {
            let swap = *swap;

            // Transfer exact_in tokens from caller to this contract
            let erc20 = IERC20Dispatcher { contract_address: swap.token_in };
            assert(erc20.transfer_from(get_caller_address(), get_contract_address(), swap.exact_in), 'transfer failed');

            // Approve Avnu router to pull tokens from this contract
            erc20.approve(self.router.read().contract_address, swap.exact_in);

            // Extract Avnu context from swap context if provided
            let (routes, _integrator_fee_amount_bps, _integrator_fee_recipient) = if let Option::Some(context_data) = swap.context {
                // Deserialize AvnuContext from context
                let mut context_span = context_data;
                let avnu_context: AvnuContext = Serde::deserialize(ref context_span).unwrap();
                (avnu_context.routes, avnu_context.integrator_fee_amount_bps, avnu_context.integrator_fee_recipient)
            } else {
                // Default values if no context provided
                (array![], 0, swap.user)
            };

            // Call Avnu's multi_route_swap for exact input
            // For exact in: we sell exactly `exact_in` amount of sell_token, want at least `min_out` of buy_token
            let success = self.router.read().multi_route_swap(
                swap.token_in,           // sell_token_address
                swap.exact_in,           // sell_token_amount (exact amount we're selling)
                swap.token_out,          // buy_token_address
                swap.min_out,            // buy_token_amount (minimum amount we want)
                swap.min_out,            // buy_token_min_amount (same as min_out for exact input)
                get_contract_address(),  // beneficiary
                _integrator_fee_amount_bps, // integrator_fee_amount_bps from AvnuContext
                _integrator_fee_recipient,  // integrator_fee_recipient from AvnuContext
                routes,                  // routes from AvnuContext
            );

            assert(success, 'avnu swap failed');

            // Refund any leftover token_in back to the caller
            let in_balance = erc20.balance_of(get_contract_address());
            if in_balance > 0 {
                assert(erc20.transfer(get_caller_address(), in_balance), 'refund failed');
            }

            let out_erc20 = IERC20Dispatcher { contract_address: swap.token_out };
            let out_balance = out_erc20.balance_of(get_contract_address());
            if out_balance > 0 {
                assert(out_erc20.transfer(get_caller_address(), out_balance), 'refund failed');
            }
            
            (in_balance, out_balance)
        }
    }

    #[abi(embed_v0)]
    impl ILendingInstructionProcessorImpl of ILendingInstructionProcessor<ContractState> {
        fn process_instructions(
            ref self: ContractState,
            instructions: Span<LendingInstruction>
        ) -> Span<Span<InstructionOutput>> {
            let mut results = array![];
            for instruction in instructions {
                match instruction {
                    LendingInstruction::Swap(swap) => {
                        let (in_balance, out_balance) = self.execute_swap_exact_out(swap);
                        let in_token = *swap.token_in;
                        let out_token = *swap.token_out;
                        let mut outs = array![];
                        outs.append(InstructionOutput { token: in_token, balance: in_balance });
                        outs.append(InstructionOutput { token: out_token, balance: out_balance });
                        results.append(outs.span());
                    },
                    LendingInstruction::SwapExactIn(swap) => {
                        let (in_balance, out_balance) = self.execute_swap_exact_in(swap);
                        let in_token = *swap.token_in;
                        let out_token = *swap.token_out;
                        let mut outs = array![];
                        outs.append(InstructionOutput { token: in_token, balance: in_balance });
                        outs.append(InstructionOutput { token: out_token, balance: out_balance });
                        results.append(outs.span());
                    },
                    _ => {},
                }
            }
            results.span()
        }

        fn get_authorizations_for_instructions(ref self: ContractState, instructions: Span<LendingInstruction>, rawSelectors: bool) -> Span<(ContractAddress, felt252, Array<felt252>)> {
            let authorizations = array![];
            authorizations.span()
        }

        fn get_flash_loan_amount(ref self: ContractState, repay: Repay) -> u256 {
            0
        }
    }
}
