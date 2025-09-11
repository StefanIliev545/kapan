use core::array::{Array, ArrayTrait, Span};
use core::traits::{Into, TryInto};
use core::integer::u128;
use starknet::ContractAddress;
use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
use crate::interfaces::IGateway::{
    LendingInstruction,
    Swap,
    ILendingInstructionProcessor,
    Repay,
    InstructionOutput,
};
use ekubo::interfaces::core::{ICoreDispatcher, ICoreDispatcherTrait, SwapParameters};
use ekubo::interfaces::core::ILocker;
use ekubo::types::keys::PoolKey;
use ekubo::types::delta::Delta;
use ekubo::types::i129::{i129};


fn i129_new(mag: u128, sign: bool) -> i129 {
    i129 { mag, sign: sign & (mag != 0) }
}

#[derive(Drop, Serde)]
struct SwapData {
    pub pool_key: PoolKey,
    pub exact_out: u256,
    pub max_in: u256,
    pub recipient: ContractAddress,
    pub token_in: ContractAddress,
    pub token_out: ContractAddress,
    pub is_token1: bool,
}

#[derive(Copy, Drop, Serde)]
struct SwapResult {
    pub delta: Delta,
}

#[starknet::contract]
pub mod EkuboGateway {
    use super::*;
use starknet::{get_caller_address, get_contract_address};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    #[storage]
    struct Storage {
        core: ICoreDispatcher,
    }

    #[constructor]
    fn constructor(ref self: ContractState, core: ContractAddress) {
        self.core.write(ICoreDispatcher { contract_address: core });
    }

    #[generate_trait]
    impl InternalFunctions of InternalFunctionsTrait {
        fn execute_swap(ref self: ContractState, swap: @Swap) -> SwapResult {
            let swap = *swap;

            // Determine token0 and token1 (token0 should be lower address)
            let token_in_felt: felt252 = swap.token_in.into();
            let token_out_felt: felt252 = swap.token_out.into();
            let token_in_u256: u256 = token_in_felt.try_into().unwrap();
            let token_out_u256: u256 = token_out_felt.try_into().unwrap();
            let (token0, token1) = if token_in_u256 < token_out_u256 {
                (swap.token_in, swap.token_out)
            } else {
                (swap.token_out, swap.token_in)
            };

            // Extract pool parameters from context if provided
            let (fee, tick_spacing, extension) = if let Option::Some(context_data) = swap.context {
                // Deserialize pool parameters from context
                let mut context_span = context_data;
                let fee: u128 = Serde::deserialize(ref context_span).unwrap();
                let tick_spacing: u128 = Serde::deserialize(ref context_span).unwrap();
                let extension: ContractAddress = Serde::deserialize(ref context_span).unwrap();
                (fee, tick_spacing, extension)
            } else {
                // Default values if no context provided
                (170141183460469235273462165868118016, 1000, starknet::contract_address_const::<0>())
            };

            // Transfer max_in tokens from caller to this contract
            let erc20 = IERC20Dispatcher { contract_address: swap.token_in };
            assert(erc20.transfer_from(get_caller_address(), get_contract_address(), swap.max_in), 'transfer failed');

            // Create swap data for callback
            let swap_data = SwapData {
                pool_key: PoolKey { 
                    token0, 
                    token1,
                    fee,
                    tick_spacing,
                    extension,
                },
                exact_out: swap.exact_out,
                max_in: swap.max_in,
                recipient: swap.recipient,
                token_in: swap.token_in,
                token_out: swap.token_out,
                is_token1: swap.token_out == token1,
            };

            // Serialize swap data for the lock call
            let mut call_data = array![];
            Serde::serialize(@swap_data, ref call_data);

            // Call core.lock which will trigger our locked callback
            let result_data = self.core.read().lock(call_data.span());
            
            // Deserialize the result
            let mut result_span = result_data;
            let swap_result: SwapResult = Serde::deserialize(ref result_span).unwrap();
            
            // Refund any leftover token_in back to the caller
            let current_balance = erc20.balance_of(get_contract_address());
            if current_balance > 0 {
                assert(erc20.transfer(get_caller_address(), current_balance), 'refund failed');
            }
            
            swap_result
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
                if let LendingInstruction::Swap(swap) = instruction {
                    let _result = self.execute_swap(swap);
                    let in_token = *swap.token_in;
                    let out_token = *swap.token_out;
                    let in_balance = IERC20Dispatcher { contract_address: in_token }
                        .balance_of(get_caller_address());
                    let out_balance = IERC20Dispatcher { contract_address: out_token }
                        .balance_of(get_caller_address());
                    let mut outs = array![];
                    outs.append(InstructionOutput { token: in_token, balance: in_balance });
                    outs.append(InstructionOutput { token: out_token, balance: out_balance });
                    results.append(outs.span());
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

    #[abi(embed_v0)]
    impl LockerImpl of ILocker<ContractState> {
        fn locked(ref self: ContractState, id: u32, data: Span<felt252>) -> Span<felt252> {
            assert(get_caller_address() == self.core.read().contract_address, 'unauthorized');
            let mut span = data;
            let swap_data = match Serde::deserialize(ref span) {
                Option::Some(x) => x,
                Option::None => panic!("deserialize"),
            };

            let core = ICoreDispatcher { contract_address: self.core.read().contract_address };

            let SwapData { pool_key, exact_out, max_in, recipient, token_in, token_out, is_token1 } = swap_data;

            let exact_out_u128: u128 = exact_out.try_into().unwrap();
            let neg_amount = i129_new(exact_out_u128, true);

            // Ekubo's documented bounds for sqrt_ratio_limit
            const MIN_SQRT_RATIO: u256 = 18446748437148339061;
            const MAX_SQRT_RATIO: u256 = 6277100250585753475930931601400621808602321654880405518632;

            // Direction comes from the token the POOL receives (token_in)
            let token_in_is_token0 = token_in == pool_key.token0;

            // If pool receives token0 → limit must be GREATER than current → use MAX
            // If pool receives token1 → limit must be LESS than current   → use MIN
            let sqrt_limit: u256 = if !token_in_is_token0 { MAX_SQRT_RATIO } else { MIN_SQRT_RATIO };

            // (Optional safety) Ensure your is_token1 flag matches pool orientation of the *output*
            assert(is_token1 == (token_out == pool_key.token1), 'is_token1-mismatch');

            let params = SwapParameters {
                amount: neg_amount,
                is_token1,
                sqrt_ratio_limit: sqrt_limit,
                skip_ahead: 0,
            };

            let delta = core.swap(pool_key, params);
            println!("Swapped");

            let (out_i, in_i) = if is_token1 { (delta.amount1, delta.amount0) } else { (delta.amount0, delta.amount1) };
            assert(out_i.sign, 'expected-negative-out');     // negative => owed to you
            assert(!in_i.sign, 'expected-positive-in');      // positive => you owe core
            let amount_out: u128 = out_i.mag;
            let amount_in:  u128 = in_i.mag;
            

            assert(amount_out >= exact_out_u128, 'insufficient-output');
            assert(amount_in.into() <= max_in, 'slippage');

            core.withdraw(token_out, recipient, amount_out);
            println!("Withdrawn");

            let erc20 = IERC20Dispatcher { contract_address: token_in };
            erc20.approve(self.core.read().contract_address, amount_in.into());
            core.pay(token_in);
            println!("Paid");

            let result = SwapResult { delta };
            let mut ret = array![];
            Serde::serialize(@result, ref ret);
            
            ret.span()
        }
    }
}
