use core::array::{Array, ArrayTrait, Span};
use core::num::traits::Zero;
use core::traits::{Into, TryInto};
use core::result::ResultTrait;
use core::option::Option;
use core::integer::i256;
use starknet::ContractAddress;
use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
use crate::interfaces::ekubo::{ICoreDispatcher, ICoreDispatcherTrait, PoolKey, SwapParameters, Delta, ILocker};
use crate::interfaces::IGateway::{LendingInstruction, Swap, ILendingInstructionProcessor, ILendingInstructionProcessorTrait, Repay};

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

#[derive(Drop, Serde)]
struct SwapResult {
    pub amount_in: u256,
    pub amount_out: u256,
}

#[starknet::contract]
mod EkuboGateway {
    use super::*;
    use starknet::{get_caller_address};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    #[storage]
    struct Storage {
        core: ContractAddress,
    }

    #[constructor]
    fn constructor(ref self: ContractState, core: ContractAddress) {
        self.core.write(core);
    }

    #[generate_trait]
    impl InternalFunctions of InternalFunctionsTrait {
        fn execute_swap(ref self: ContractState, swap: @Swap) {
            let swap = *swap;

            let token_in_felt: felt252 = swap.token_in.into();
            let token_out_felt: felt252 = swap.token_out.into();
            let token_in_u256: u256 = token_in_felt.try_into().unwrap();
            let token_out_u256: u256 = token_out_felt.try_into().unwrap();
            let (token0, token1) = if token_in_u256 < token_out_u256 {
                (swap.token_in, swap.token_out)
            } else {
                (swap.token_out, swap.token_in)
            };
            let is_token1 = swap.token_out == token1;

            let swap_data = SwapData {
                pool_key: PoolKey { token0, token1 },
                exact_out: swap.exact_out,
                max_in: swap.max_in,
                recipient: swap.recipient,
                token_in: swap.token_in,
                token_out: swap.token_out,
                is_token1,
            };

            let mut call_data = array![];
            Serde::serialize(@swap_data, ref call_data);

            let core = ICoreDispatcher { contract_address: self.core.read() };
            let result = core.lock(call_data.span());

            let mut res_span = result.span();
            let swap_result = match Serde::deserialize(ref res_span) {
                Option::Some(x) => x,
                Option::None => panic!("deserialize"),
            };

            if swap_result.amount_in < swap.max_in {
                let leftover = swap.max_in - swap_result.amount_in;
                if leftover != Zero::zero() {
                    let erc20 = IERC20Dispatcher { contract_address: swap.token_in };
                    assert(erc20.transfer(get_caller_address(), leftover), 'transfer failed');
                }
            }
        }
    }

    #[abi(embed_v0)]
    impl ILendingInstructionProcessorImpl of ILendingInstructionProcessor<ContractState> {
        fn process_instructions(ref self: ContractState, instructions: Span<LendingInstruction>) {
            for instruction in instructions {
                if let LendingInstruction::Swap(swap) = instruction {
                    self.execute_swap(swap);
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

    #[external]
    impl LockerImpl of ILocker<ContractState> {
        fn locked(ref self: ContractState, id: u32, data: Span<felt252>) -> Array<felt252> {
            assert(get_caller_address() == self.core.read(), 'unauthorized');
            let mut span = data;
            let swap_data = match Serde::deserialize(ref span) {
                Option::Some(x) => x,
                Option::None => panic!("deserialize"),
            };

            let core = ICoreDispatcher { contract_address: self.core.read() };

            let SwapData { pool_key, exact_out, max_in, recipient, token_in, token_out, is_token1 } = swap_data;

            let exact_out_i256: i256 = exact_out.try_into().unwrap();
            let neg_amount = -exact_out_i256;
            let params = SwapParameters {
                amount: neg_amount,
                is_token1,
                sqrt_ratio_limit: 0,
                skip_ahead: false,
            };

            let delta = core.swap(pool_key, params);

            let mut amount_in: u256 = 0;
            let mut amount_out: u256 = 0;

            if is_token1 {
                // token_out is token1
                amount_out = (-delta.amount1).try_into().unwrap();
                amount_in = delta.amount0.try_into().unwrap();
            } else {
                amount_out = (-delta.amount0).try_into().unwrap();
                amount_in = delta.amount1.try_into().unwrap();
            }

            assert(amount_out >= exact_out, 'insufficient-output');
            assert(amount_in <= max_in, 'slippage');

            core.withdraw(token_out, recipient, amount_out);

            let erc20 = IERC20Dispatcher { contract_address: token_in };
            assert(erc20.approve(self.core.read(), amount_in), 'approve failed');
            core.pay(token_in);

            let result = SwapResult { amount_in, amount_out };
            let mut ret = array![];
            Serde::serialize(@result, ref ret);
            ret
        }
    }
}
