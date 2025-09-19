use core::array::{Array, ArrayTrait, Span};
use core::integer::u256;
use core::result::Result;
use starknet::{ContractAddress, contract_address_const};

use kapan::interfaces::IGateway::{InstructionOutput, OutputPointer};
use kapan::router::token_amount::token_amount_pointer;
use kapan::router::v3::instructions::{
    AccountInteraction,
    FlashLoanInstruction,
    Instruction,
    TransferInstruction,
};
use kapan::router::v3::resolver::resolve_instruction;
use kapan::router::v3::resolved_instruction::{
    ResolvedFlashLoanInstruction,
    ResolvedInstruction,
    ResolvedTransferInstruction,
};
use kapan::router::v3::state::InstructionOutputsState;

fn build_instruction_outputs() -> InstructionOutputsState {
    let mut outputs: InstructionOutputsState = InstructionOutputsState::new();

    let mut first_instruction_outputs: Array<InstructionOutput> = ArrayTrait::new();
    let token: ContractAddress = contract_address_const::<0x1>();
    let amount = u256 { low: 100, high: 0 };
    first_instruction_outputs.append(InstructionOutput { token, balance: amount });

    outputs.push_outputs(first_instruction_outputs);
    outputs
}

#[test]
fn resolves_transfer_pointer() {
    let outputs = build_instruction_outputs();
    let recipient: ContractAddress = contract_address_const::<0x20>();
    let pointer = OutputPointer { instruction_index: 0, output_index: 0 };

    let instruction = Instruction::Transfer(TransferInstruction {
        asset: token_amount_pointer(pointer),
        recipient,
    });

    match resolve_instruction(@outputs, instruction) {
        Result::Ok(resolved) => {
            match resolved {
                ResolvedInstruction::Transfer(resolved_transfer) => {
                    let ResolvedTransferInstruction { asset, recipient: resolved_recipient } = resolved_transfer;
                    assert(asset.amount == u256 { low: 100, high: 0 }, 'transfer amount mismatch');
                    assert(asset.token == contract_address_const::<0x1>(), 'transfer token mismatch');
                    assert(resolved_recipient == recipient, 'transfer recipient mismatch');
                }
                _ => {
                    assert(0 == 1, 'expected transfer resolution');
                }
            }
        }
        Result::Err(_) => {
            assert(0 == 1, 'expected transfer instruction to resolve');
        }
    }
}

#[test]
fn resolves_flash_loan_assets() {
    let outputs = build_instruction_outputs();
    let interaction = AccountInteraction::new(contract_address_const::<0x30>(), 1);

    let pointer = OutputPointer { instruction_index: 0, output_index: 0 };
    let assets: Span<_> = array![token_amount_pointer(pointer)].span();

    let instruction = Instruction::FlashLoan(FlashLoanInstruction {
        interaction,
        assets,
        nested: array![].span(),
    });

    match resolve_instruction(@outputs, instruction) {
        Result::Ok(resolved) => {
            match resolved {
                ResolvedInstruction::FlashLoan(flash_loan) => {
                    let ResolvedFlashLoanInstruction { assets, interaction: resolved_interaction, nested } = flash_loan;
                    assert(assets.len() == 1, 'flash loan asset length mismatch');
                    let resolved_asset = *assets.at(0);
                    assert(resolved_asset.amount == u256 { low: 100, high: 0 }, 'flash loan amount mismatch');
                    assert(resolved_asset.token == contract_address_const::<0x1>(), 'flash loan token mismatch');
                    assert(resolved_interaction.account == interaction.account, 'interaction account mismatch');
                    assert(resolved_interaction.protocol == interaction.protocol, 'interaction protocol mismatch');
                    assert(nested.len() == 0, 'flash loan nested instructions mismatch');
                }
                _ => {
                    assert(0 == 1, 'expected flash loan resolution');
                }
            }
        }
        Result::Err(_) => {
            assert(0 == 1, 'expected flash loan instruction to resolve');
        }
    }
}

#[test]
fn fails_to_resolve_missing_pointer() {
    let outputs = InstructionOutputsState::new();
    let pointer = OutputPointer { instruction_index: 0, output_index: 0 };

    let instruction = Instruction::Transfer(TransferInstruction {
        asset: token_amount_pointer(pointer),
        recipient: contract_address_const::<0x40>(),
    });

    match resolve_instruction(@outputs, instruction) {
        Result::Ok(_) => {
            assert(0 == 1, 'expected resolution failure for missing pointer');
        }
        Result::Err(error) => {
            assert(error.kind == kapan::router::token_amount::TokenAmountResolutionErrorKind::InstructionIndexOutOfBounds, 'unexpected error kind');
        }
    }
}
