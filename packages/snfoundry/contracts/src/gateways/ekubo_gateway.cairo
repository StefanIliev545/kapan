use core::array::{Array, ArrayTrait, Span};
use core::num::traits::Zero;
use core::traits::{Into, TryInto};
use core::result::ResultTrait;
use core::integer::i256;
use starknet::ContractAddress;
use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
use crate::interfaces::ekubo::{ICoreDispatcher, ICoreDispatcherTrait, PoolKey, SwapParameters, Delta, ILocker};

#[starknet::interface]
pub trait IEkuboGateway<TContractState> {
    fn execute(ref self: TContractState, instruction: Array<felt252>, ctx: felt252) -> Array<felt252>;
}

#[derive(Drop, Serde)]
pub struct SwapInstruction {
    pub token_in: ContractAddress,
    pub token_out: ContractAddress,
    pub exact_out: u256,
    pub max_in: u256,
    pub slippage_bps: u16,
    pub recipient: ContractAddress,
    pub extra: felt252,
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

#[derive(Drop, Serde)]
struct SwapResult {
    pub amount_in: u256,
    pub amount_out: u256,
}

#[starknet::contract]
mod EkuboGateway {
    use super::*;
    use starknet::{get_caller_address};

    #[storage]
    struct Storage {
        core: ContractAddress,
    }

    #[constructor]
    fn constructor(ref self: ContractState, core: ContractAddress) {
        self.core.write(core);
    }

    #[external(v0)]
    impl IEkuboGatewayImpl of super::IEkuboGateway<ContractState> {
        fn execute(ref self: ContractState, instruction: Array<felt252>, ctx: felt252) -> Array<felt252> {
            let mut span = instruction.span();
            let instr = SwapInstruction::deserialize(ref span).unwrap();

            let token_in_felt: felt252 = instr.token_in.into();
            let token_out_felt: felt252 = instr.token_out.into();
            let (token0, token1) = if token_in_felt < token_out_felt {
                (instr.token_in, instr.token_out)
            } else {
                (instr.token_out, instr.token_in)
            };
            let is_token1 = instr.token_out == token1;

            let swap_data = SwapData {
                pool_key: PoolKey { token0, token1 },
                exact_out: instr.exact_out,
                max_in: instr.max_in,
                recipient: instr.recipient,
                token_in: instr.token_in,
                token_out: instr.token_out,
                is_token1,
            };

            let mut call_data = array![];
            Serde::serialize(@swap_data, ref call_data);

            let core = ICoreDispatcher { contract_address: self.core.read() };
            let result = core.lock(call_data.span());

            let mut res_span = result.span();
            let swap_result = SwapResult::deserialize(ref res_span).unwrap();

            if swap_result.amount_in < instr.max_in {
                let leftover = instr.max_in - swap_result.amount_in;
                if leftover != Zero::zero() {
                    let erc20 = IERC20Dispatcher { contract_address: instr.token_in };
                    assert(erc20.transfer(get_caller_address(), leftover), 'transfer failed');
                }
            }

            let mut ret = array![];
            Serde::serialize(@swap_result, ref ret);
            ret
        }
    }

    #[external]
    impl LockerImpl of ILocker<ContractState> {
        fn locked(ref self: ContractState, id: u32, data: Span<felt252>) -> Array<felt252> {
            assert(get_caller_address() == self.core.read(), 'unauthorized');
            let mut span = data;
            let swap_data = SwapData::deserialize(ref span).unwrap();

            let core = ICoreDispatcher { contract_address: self.core.read() };

            let exact_out_i256: i256 = swap_data.exact_out.try_into().unwrap();
            let neg_amount = -exact_out_i256;
            let params = SwapParameters {
                amount: neg_amount,
                is_token1: swap_data.is_token1,
                sqrt_ratio_limit: 0,
                skip_ahead: false,
            };

            let delta = core.swap(swap_data.pool_key, params);

            let mut amount_in: u256 = 0;
            let mut amount_out: u256 = 0;

            if swap_data.is_token1 {
                // token_out is token1
                amount_out = (-delta.amount1).try_into().unwrap();
                amount_in = delta.amount0.try_into().unwrap();
            } else {
                amount_out = (-delta.amount0).try_into().unwrap();
                amount_in = delta.amount1.try_into().unwrap();
            }

            assert(amount_out >= swap_data.exact_out, 'insufficient-output');
            assert(amount_in <= swap_data.max_in, 'slippage');

            core.withdraw(swap_data.token_out, swap_data.recipient, amount_out);

            let erc20 = IERC20Dispatcher { contract_address: swap_data.token_in };
            assert(erc20.approve(self.core.read(), amount_in), 'approve failed');
            core.pay(swap_data.token_in);

            let result = SwapResult { amount_in, amount_out };
            let mut ret = array![];
            Serde::serialize(@result, ref ret);
            ret
        }
    }
}
