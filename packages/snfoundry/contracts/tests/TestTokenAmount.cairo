use core::array::{Array, ArrayTrait, Span};
use core::integer::u256;
use core::result::Result;
use starknet::{ContractAddress, contract_address_const};

use kapan::interfaces::IGateway::{InstructionOutput, OutputPointer};
use kapan::router::token_amount::{
    TokenAmountResolutionErrorKind,
    resolve_token_amount,
    token_amount_pointer,
    token_amount_static,
};

#[test]
fn resolves_static_token_amount() {
    let token: ContractAddress = contract_address_const::<0x1>();
    let amount = u256 { low: 100, high: 0 };
    let token_amount = token_amount_static(token, amount);
    let instruction_outputs: Span<Span<InstructionOutput>> = array![].span();

    match resolve_token_amount(token_amount, instruction_outputs) {
        Result::Ok(value) => {
            assert(value.token == token, 'static token mismatch');
            assert(value.amount == amount, 'static amount mismatch');
        }
        Result::Err(_) => {
            assert(0 == 1, 'expected static resolution to succeed');
        }
    }
}

#[test]
fn resolves_pointer_token_amount() {
    let token: ContractAddress = contract_address_const::<0x2>();
    let amount = u256 { low: 42, high: 0 };
    let pointer = OutputPointer { instruction_index: 0, output_index: 0 };

    let mut outputs_for_instruction: Array<InstructionOutput> = ArrayTrait::new();
    outputs_for_instruction.append(InstructionOutput { token, balance: amount });
    let outputs_span = outputs_for_instruction.span();

    let mut instruction_outputs: Array<Span<InstructionOutput>> = ArrayTrait::new();
    instruction_outputs.append(outputs_span);

    match resolve_token_amount(token_amount_pointer(pointer), instruction_outputs.span()) {
        Result::Ok(value) => {
            assert(value.token == token, 'pointer token mismatch');
            assert(value.amount == amount, 'pointer amount mismatch');
        }
        Result::Err(_) => {
            assert(0 == 1, 'expected pointer resolution to succeed');
        }
    }
}

#[test]
fn fails_when_pointer_instruction_index_out_of_bounds() {
    let pointer = OutputPointer { instruction_index: 1, output_index: 0 };
    let instruction_outputs: Span<Span<InstructionOutput>> = array![].span();

    match resolve_token_amount(token_amount_pointer(pointer), instruction_outputs) {
        Result::Ok(_) => {
            assert(0 == 1, 'expected pointer resolution to fail');
        }
        Result::Err(error) => {
            assert(
                error.kind == TokenAmountResolutionErrorKind::InstructionIndexOutOfBounds,
                'unexpected error kind',
            );
        }
    }
}
