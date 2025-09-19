use core::array::{Array, ArrayTrait, Span};
use core::result::Result;

use crate::interfaces::IGateway::InstructionOutput;
use crate::router::token_amount::{
    TokenAmount,
    TokenAmountResolutionError,
    TokenAmountValue,
    resolve_token_amount,
};

#[derive(Drop)]
pub struct InstructionOutputsState {
    outputs: Array<Array<InstructionOutput>>,
}

impl InstructionOutputsState {
    pub fn new() -> InstructionOutputsState {
        InstructionOutputsState { outputs: ArrayTrait::new() }
    }

    pub fn push_outputs(ref self: InstructionOutputsState, outputs: Array<InstructionOutput>) {
        self.outputs.append(outputs);
    }

    pub fn len(self: @InstructionOutputsState) -> usize {
        self.outputs.len()
    }

    pub fn is_empty(self: @InstructionOutputsState) -> bool {
        self.len() == 0
    }

    pub fn resolve_token_amount(
        self: @InstructionOutputsState,
        token_amount: TokenAmount,
    ) -> Result<TokenAmountValue, TokenAmountResolutionError> {
        let output_spans = self.collect_output_spans();
        resolve_token_amount(token_amount, output_spans.span())
    }

    pub fn collect_output_spans(
        self: @InstructionOutputsState,
    ) -> Array<Span<InstructionOutput>> {
        let mut spans: Array<Span<InstructionOutput>> = ArrayTrait::new();
        for outputs in self.outputs.span() {
            spans.append(outputs.span());
        }
        spans
    }

    pub fn resolve_token_amounts(
        self: @InstructionOutputsState,
        token_amounts: Span<TokenAmount>,
    ) -> Result<Array<TokenAmountValue>, TokenAmountResolutionError> {
        let mut resolved: Array<TokenAmountValue> = ArrayTrait::new();
        for token_amount in token_amounts {
            match self.resolve_token_amount(*token_amount) {
                Result::Ok(value) => {
                    resolved.append(value);
                }
                Result::Err(error) => {
                    return Result::Err(error);
                }
            }
        }
        Result::Ok(resolved)
    }
}
