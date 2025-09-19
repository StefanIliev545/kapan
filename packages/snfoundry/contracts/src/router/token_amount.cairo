use core::array::{Span, SpanTrait};
use core::integer::u256;
use core::option::OptionTrait;
use core::result::Result;
use core::traits::TryInto;
use starknet::ContractAddress;

use crate::interfaces::IGateway::{InstructionOutput, OutputPointer};

#[derive(Copy, Drop, Serde)]
pub struct TokenAmountValue {
    pub token: ContractAddress,
    pub amount: u256,
}

#[derive(Copy, Drop, Serde)]
pub enum TokenAmount {
    Static(TokenAmountValue),
    Pointer(OutputPointer),
}

#[derive(Copy, Drop, Serde)]
pub enum TokenAmountResolutionErrorKind {
    InstructionIndexOverflow,
    InstructionIndexOutOfBounds,
    OutputIndexOverflow,
    OutputIndexOutOfBounds,
}

#[derive(Copy, Drop, Serde)]
pub struct TokenAmountResolutionError {
    pub pointer: OutputPointer,
    pub kind: TokenAmountResolutionErrorKind,
}

pub fn token_amount_static(token: ContractAddress, amount: u256) -> TokenAmount {
    TokenAmount::Static(TokenAmountValue { token, amount })
}

pub fn token_amount_pointer(pointer: OutputPointer) -> TokenAmount {
    TokenAmount::Pointer(pointer)
}

pub fn resolve_token_amount(
    token_amount: TokenAmount,
    instruction_outputs: Span<Span<InstructionOutput>>,
) -> Result<TokenAmountValue, TokenAmountResolutionError> {
    match token_amount {
        TokenAmount::Static(value) => Result::Ok(value),
        TokenAmount::Pointer(pointer) => resolve_pointer(pointer, instruction_outputs),
    }
}

pub fn to_instruction_output(value: TokenAmountValue) -> InstructionOutput {
    InstructionOutput { token: value.token, balance: value.amount }
}

fn resolve_pointer(
    pointer: OutputPointer,
    instruction_outputs: Span<Span<InstructionOutput>>,
) -> Result<TokenAmountValue, TokenAmountResolutionError> {
    match pointer.instruction_index.try_into() {
        Option::Some(instruction_index) => {
            match instruction_outputs.get(instruction_index) {
                Option::Some(outputs) => match pointer.output_index.try_into() {
                    Option::Some(output_index) => {
                        match outputs.get(output_index) {
                            Option::Some(output) => Result::Ok(TokenAmountValue {
                                token: output.token,
                                amount: output.balance,
                            }),
                            Option::None => Result::Err(TokenAmountResolutionError {
                                pointer,
                                kind: TokenAmountResolutionErrorKind::OutputIndexOutOfBounds,
                            }),
                        }
                    }
                    Option::None => Result::Err(TokenAmountResolutionError {
                        pointer,
                        kind: TokenAmountResolutionErrorKind::OutputIndexOverflow,
                    }),
                },
                Option::None => Result::Err(TokenAmountResolutionError {
                    pointer,
                    kind: TokenAmountResolutionErrorKind::InstructionIndexOutOfBounds,
                }),
            }
        }
        Option::None => Result::Err(TokenAmountResolutionError {
            pointer,
            kind: TokenAmountResolutionErrorKind::InstructionIndexOverflow,
        }),
    }
}
