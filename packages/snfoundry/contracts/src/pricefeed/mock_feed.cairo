
#[starknet::interface]
trait IMockFeed<TContractState> {
    fn get_price(self: @TContractState) -> Result<u256, felt252>;
}

#[starknet::contract]
mod MockFeed {
    use super::IMockFeed;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use core::result::Result;

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
    }
}