
use starknet::ContractAddress;

#[starknet::interface]
trait IUIHelper<TContractState> {
    fn get_token_decimals(self: @TContractState, token_address: Span<ContractAddress>) -> Span<u8>;
    fn get_asset_prices(self: @TContractState, token_addresses: Span<ContractAddress>) -> Span<u256>;
}

#[starknet::contract]
mod UiHelper {
    use super::*;
    use openzeppelin::token::erc20::interface::{IERC20MetadataDispatcher, IERC20MetadataDispatcherTrait};
    use starknet::storage::{StoragePointerWriteAccess, StoragePointerReadAccess};
    use crate::gateways::vesu_gateway::{IVesuViewerDispatcher, IVesuViewerDispatcherTrait};

    #[storage]
    struct Storage {
        vesu_gateway: ContractAddress,
    }

    #[constructor]
    fn constructor(ref self: ContractState, vesu_gateway: ContractAddress) {
        self.vesu_gateway.write(vesu_gateway);
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

        fn get_asset_prices(self: @ContractState, token_addresses: Span<ContractAddress>) -> Span<u256> {
            let mut prices = array![];
            let vesu_gateway = self.vesu_gateway.read();
            let vesu_viewer = IVesuViewerDispatcher { contract_address: vesu_gateway };
            for address in token_addresses {
                prices.append(vesu_viewer.get_asset_price(*address));
            }
            prices.span()
        }
    }
}