use starknet::ContractAddress;

#[starknet::interface]
trait IOptimalInterestRateFinder<TContractState> {
    fn find_optimal_borrow_rate(self: @TContractState, token_address: ContractAddress) -> (felt252, u256);
    fn find_optimal_supply_rate(self: @TContractState, token_address: ContractAddress) -> (felt252, u256);
    fn findOptimalSupplyRate(self: @TContractState, token_address: ContractAddress) -> (felt252, u256);
    fn findOptimalBorrowRate(self: @TContractState, token_address: ContractAddress) -> (felt252, u256);
}

#[starknet::contract]
mod OptimalInterestRateFinder {
    use super::IOptimalInterestRateFinder;
    use super::ContractAddress;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use crate::interfaces::IGateway::{InterestRateViewDispatcher, InterestRateViewDispatcherTrait};

    #[storage]
    struct Storage{
        nostra_gateway: ContractAddress,
        vesu_gateway: ContractAddress,
    }

    #[constructor]
    fn constructor(ref self:ContractState, nostra_gateway: ContractAddress, vesu_gateway: ContractAddress) {
        self.nostra_gateway.write(nostra_gateway);
        self.vesu_gateway.write(vesu_gateway);
    }

    #[abi(embed_v0)]
    impl IOptimalInterestRateFinderImpl of IOptimalInterestRateFinder<ContractState> {
        fn find_optimal_borrow_rate(self: @ContractState, token_address: ContractAddress) -> (felt252, u256) {
            let nostra_gateway = self.nostra_gateway.read();
            let vesu_gateway = self.vesu_gateway.read();
            let nostra_interest_rate_view = InterestRateViewDispatcher { contract_address: nostra_gateway };
            let vesu_interest_rate_view = InterestRateViewDispatcher { contract_address: vesu_gateway };
            let nostra_borrow_rate = nostra_interest_rate_view.get_borrow_rate(token_address);
            let vesu_borrow_rate= vesu_interest_rate_view.get_borrow_rate(token_address);
            if nostra_borrow_rate < vesu_borrow_rate {
                ('nostra', nostra_borrow_rate)
            } else {
                ('vesu', vesu_borrow_rate)
            }
        }

        fn find_optimal_supply_rate(self: @ContractState, token_address: ContractAddress) -> (felt252, u256) {
            let nostra_gateway = self.nostra_gateway.read();
            let vesu_gateway = self.vesu_gateway.read();
            let nostra_interest_rate_view = InterestRateViewDispatcher { contract_address: nostra_gateway };
            let vesu_interest_rate_view = InterestRateViewDispatcher { contract_address: vesu_gateway };
            let nostra_supply_rate = nostra_interest_rate_view.get_supply_rate(token_address);
            let vesu_supply_rate= vesu_interest_rate_view.get_supply_rate(token_address);
            if nostra_supply_rate > vesu_supply_rate {
                ('nostra', nostra_supply_rate)
            } else {
                ('vesu', vesu_supply_rate)
            }
        }

        fn findOptimalSupplyRate(self: @ContractState, token_address: ContractAddress) -> (felt252, u256) {
            return self.find_optimal_supply_rate(token_address);
        }

        fn findOptimalBorrowRate(self: @ContractState, token_address: ContractAddress) -> (felt252, u256) {
            return self.find_optimal_borrow_rate(token_address);
        }
    }
}