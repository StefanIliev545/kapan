
use starknet::ContractAddress;

#[starknet::interface]
trait IUIHelper<TContractState> {
    fn get_token_decimals(self: @TContractState, token_address: Span<ContractAddress>) -> Span<u8>;
}

#[starknet::contract]
mod UiHelper {
    use super::*;
    use openzeppelin::token::erc20::interface::{IERC20MetadataDispatcher, IERC20MetadataDispatcherTrait};

    #[storage]
    struct Storage {
    }

    #[abi(embed_v0)]
    impl ImplUIHelper of IUIHelper<ContractState> {
        fn get_token_decimals(self: @ContractState, token_address: Span<ContractAddress>) -> Span<u8> {
            let mut decimals = array![];
            let mut i = 0;
            while i != token_address.len() {
                let token = *token_address.at(i);
                let erc20 = IERC20MetadataDispatcher { contract_address: token };
                decimals.append(erc20.decimals());
                i += 1;
            }
            decimals.span()
        }
    }
}