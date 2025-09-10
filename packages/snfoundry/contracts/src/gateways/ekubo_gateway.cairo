use core::array::{Array, ArrayTrait, Span};
use core::traits::{Into, TryInto};
use core::integer::{i128, u128};
use starknet::ContractAddress;
use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
use crate::interfaces::IGateway::{LendingInstruction, Swap, ILendingInstructionProcessor, Repay};
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
    use ekubo::types::i129;
use starknet::{get_caller_address};
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

            // Create swap data for callback
            let swap_data = SwapData {
                pool_key: PoolKey { 
                    token0, 
                    token1,
                    fee: 0, // Default fee - should be provided in real usage
                    tick_spacing: 0, // Default tick spacing - should be provided in real usage
                    extension: starknet::contract_address_const::<0>(), // No extension
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
            swap_result
        }
    }

    #[abi(embed_v0)]
    impl ILendingInstructionProcessorImpl of ILendingInstructionProcessor<ContractState> {
        fn process_instructions(ref self: ContractState, instructions: Span<LendingInstruction>) {
            for instruction in instructions {
                if let LendingInstruction::Swap(swap) = instruction {
                    let _result = self.execute_swap(swap);
                }
            }
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
            let neg_amount = i129_new(exact_out_u128, false);
            let params = SwapParameters {
                amount: neg_amount,
                is_token1,
                sqrt_ratio_limit: 0,
                skip_ahead: 0,
            };

            let delta = core.swap(pool_key, params);

            let mut amount_in: u128 = 0;
            let mut amount_out: u128 = 0;

            if is_token1 {
                let out_u128: u128 = (-delta.amount1).try_into().unwrap();
                amount_out = out_u128.into();
                let in_u128: u128 = delta.amount0.try_into().unwrap();
                amount_in = in_u128.into();
            } else {
                let out_u128: u128 = (-delta.amount0).try_into().unwrap();
                amount_out = out_u128.into();
                let in_u128: u128 = delta.amount1.try_into().unwrap();
                amount_in = in_u128.into();
            }

            assert(amount_out >= exact_out_u128, 'insufficient-output');
            assert(amount_in.into() <= max_in, 'slippage');

            core.withdraw(token_out, recipient, amount_out);

            let erc20 = IERC20Dispatcher { contract_address: token_in };
            assert(erc20.approve(self.core.read().contract_address, amount_in.into()), 'approve failed');
            core.pay(token_in);

            let result = SwapResult { delta };
            let mut ret = array![];
            Serde::serialize(@result, ref ret);
            
            ret.span()
        }
    }
}
