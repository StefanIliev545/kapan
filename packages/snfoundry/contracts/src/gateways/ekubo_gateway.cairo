use core::array::{Array, ArrayTrait, Span};
use core::traits::{Into, TryInto};
use core::integer::u128;
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
    pub amount: u256,
    pub limit: u256,
    pub token_in: ContractAddress,
    pub token_out: ContractAddress,
    pub is_token1: bool,
    pub recipient: ContractAddress,
    pub is_exact_in: bool,
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
        fn execute_swap(ref self: ContractState, swap: @Swap) -> (u256, u256) {
            // backwards compatibility - exact out swap
            self.execute_swap_exact_out(swap)
        }

        fn execute_swap_exact_out(ref self: ContractState, swap: @Swap) -> (u256, u256) {
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
                amount: swap.exact_out,
                limit: swap.max_in,
                token_in: swap.token_in,
                token_out: swap.token_out,
                // Orient by output token: does token_out equal token1?
                is_token1: swap.token_out == token1,
                recipient: get_contract_address(),
                is_exact_in: false,
            };

            // Serialize swap data for the lock call
            let mut call_data = array![];
            Serde::serialize(@swap_data, ref call_data);

            // Call core.lock which will trigger our locked callback
            self.core.read().lock(call_data.span());
            
            // Deserialize the result
            
            // Refund any leftover token_in back to the caller
            let in_balance = erc20.balance_of(get_contract_address());
            if in_balance > 0 {
                println!("refund in_balance: {}", in_balance);
                assert(erc20.transfer(get_caller_address(), in_balance), 'refund failed');
            }

            let outErc20 = IERC20Dispatcher { contract_address: swap.token_out };
            let out_balance = outErc20.balance_of(get_contract_address());
            if out_balance > 0 {
                println!("refund out_balance: {}", out_balance);
                assert(outErc20.transfer(get_caller_address(), out_balance), 'refund failed');
            }
            
            (in_balance, out_balance)
        }

        fn execute_swap_exact_in(ref self: ContractState, swap: @SwapExactIn) -> (u256, u256) {
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
                let mut context_span = context_data;
                let fee: u128 = Serde::deserialize(ref context_span).unwrap();
                let tick_spacing: u128 = Serde::deserialize(ref context_span).unwrap();
                let extension: ContractAddress = Serde::deserialize(ref context_span).unwrap();
                (fee, tick_spacing, extension)
            } else {
                (170141183460469235273462165868118016, 1000, starknet::contract_address_const::<0>())
            };

            // Transfer exact_in tokens from caller to this contract
            let erc20 = IERC20Dispatcher { contract_address: swap.token_in };
            assert(erc20.transfer_from(get_caller_address(), get_contract_address(), swap.exact_in), 'transfer failed');

            // Create swap data for callback
            let swap_data = SwapData {
                pool_key: PoolKey {
                    token0,
                    token1,
                    fee,
                    tick_spacing,
                    extension,
                },
                amount: swap.exact_in,
                limit: swap.min_out,
                token_in: swap.token_in,
                token_out: swap.token_out,
                // For exact IN, the signed amount refers to token_in
                is_token1: swap.token_in == token1,
                recipient: get_contract_address(),
                is_exact_in: true,
            };

            // Serialize swap data for the lock call
            let mut call_data = array![];
            Serde::serialize(@swap_data, ref call_data);

            // Call core.lock which will trigger our locked callback
            self.core.read().lock(call_data.span());

            // Refund any leftover token_in back to the caller
            let in_balance = erc20.balance_of(get_contract_address());
            if in_balance > 0 {
                println!("refund in_balance: {}", in_balance);
                assert(erc20.transfer(get_caller_address(), in_balance), 'refund failed');
            }

            let outErc20 = IERC20Dispatcher { contract_address: swap.token_out };
            let out_balance = outErc20.balance_of(get_contract_address());
            if out_balance > 0 {
                println!("refund out_balance: {}", out_balance);
                assert(outErc20.transfer(get_caller_address(), out_balance), 'refund failed');
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

            let SwapData { pool_key, amount, limit, recipient, token_in, token_out, is_token1, is_exact_in } = swap_data;

            let amount_u128: u128 = amount.try_into().unwrap();
            let signed_amount = if is_exact_in {
                i129_new(amount_u128, false)
            } else {
                i129_new(amount_u128, true)
            };

            // Ekubo's documented bounds for sqrt_ratio_limit
            const MIN_SQRT_RATIO: u256 = 18446748437148339061;
            const MAX_SQRT_RATIO: u256 = 6277100250585753475930931601400621808602321654880405518632;

            // Direction comes from the token the POOL receives (token_in)
            let token_in_is_token0 = token_in == pool_key.token0;

            // LIMIT_DIRECTION depends on which side the pool receives (token_in):
            // token0-in → price goes down → use MIN; token1-in → price goes up → use MAX
            let sqrt_limit: u256 = if token_in_is_token0 { MIN_SQRT_RATIO } else { MAX_SQRT_RATIO };

            // (Optional safety) Ensure your is_token1 flag matches pool orientation of the *output*
            if is_exact_in {
                assert(is_token1 == (token_in == pool_key.token1), 'is_token1-mismatch');
            } else {
                assert(is_token1 == (token_out == pool_key.token1), 'is_token1-mismatch');
            }
            
            let params = SwapParameters {
                amount: signed_amount,
                is_token1,
                sqrt_ratio_limit: sqrt_limit,
                skip_ahead: 0,
            };

            let delta = core.swap(pool_key, params);
            println!("Swapped");

            // Compute in/out amounts by token identity and sign, without brittle assertions
            let d0 = delta.amount0; // token0
            let d1 = delta.amount1; // token1
            let in_mag0: u128 = if !d0.sign { d0.mag } else { 0 };   // positive => pool received token0
            let in_mag1: u128 = if !d1.sign { d1.mag } else { 0 };   // positive => pool received token1
            let out_mag0: u128 = if d0.sign { d0.mag } else { 0 };   // negative => pool sent token0
            let out_mag1: u128 = if d1.sign { d1.mag } else { 0 };   // negative => pool sent token1

            let amount_in: u128 = if token_in == pool_key.token1 { in_mag1 } else { in_mag0 };
            let amount_out: u128 = if token_out == pool_key.token1 { out_mag1 } else { out_mag0 };

            if is_exact_in {
                let min_out_u128: u128 = limit.try_into().unwrap();
                assert(amount_out >= min_out_u128, 'insufficient-output');
                assert(amount_in <= amount_u128, 'overspent');
            } else {
                assert(amount_out >= amount_u128, 'insufficient-output');
                assert(amount_in.into() <= limit, 'slippage');
            }

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
