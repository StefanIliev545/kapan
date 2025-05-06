use starknet::{ContractAddress};

#[starknet::interface]
trait IMockFeed<TContractState> {
    fn get_price(self: @TContractState) -> Result<u256, felt252>;
    fn get_asset_price(self: @TContractState, asset: felt252) -> u256;
    fn getAssetPrice(self: @TContractState, asset: felt252) -> u256;
    fn main_oracle(self: @TContractState) -> ContractAddress;
    fn fallback_oracle(self: @TContractState) -> ContractAddress;
    fn mainOracle(self: @TContractState) -> ContractAddress;
    fn fallbackOracle(self: @TContractState) -> ContractAddress;
}

#[starknet::contract]
mod MockFeed {
    use super::*;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use core::result::Result;
    use starknet::get_contract_address;

    #[storage]
    struct Storage {
        price: u256,
    }
    
    #[constructor]
    fn constructor(ref self: ContractState, price: u256) {
        self.price.write(price);
    }

    #[abi(embed_v0)]
    impl MockFeedImpl of IMockFeed<ContractState> {
        fn get_price(self: @ContractState) -> Result<u256, felt252> {
            Ok(self.price.read())
        }
        fn get_asset_price(self: @ContractState, asset: felt252) -> u256 {
            self.price.read()
        }
        
        fn getAssetPrice(self: @ContractState, asset: felt252) -> u256 {
            self.price.read()
        }

        fn main_oracle(self: @ContractState) -> ContractAddress {
            get_contract_address()
        }

        fn fallback_oracle(self: @ContractState) -> ContractAddress {
            get_contract_address()
        }

        fn mainOracle(self: @ContractState) -> ContractAddress {
            get_contract_address()
        }

        fn fallbackOracle(self: @ContractState) -> ContractAddress {
            get_contract_address()
        }
    }
}