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
        vesu_gateway_v2: ContractAddress,
    }

    #[constructor]
    fn constructor(ref self:ContractState, nostra_gateway: ContractAddress, vesu_gateway: ContractAddress, vesu_gateway_v2: ContractAddress) {
        self.nostra_gateway.write(nostra_gateway);
        self.vesu_gateway.write(vesu_gateway);
        self.vesu_gateway_v2.write(vesu_gateway_v2);
    }

    #[abi(embed_v0)]
    impl IOptimalInterestRateFinderImpl of IOptimalInterestRateFinder<ContractState> {
        fn find_optimal_borrow_rate(self: @ContractState, token_address: ContractAddress) -> (felt252, u256) {
            let nostra_gateway = self.nostra_gateway.read();
            let vesu_gateway = self.vesu_gateway.read();
            let vesu_gateway_v2 = self.vesu_gateway_v2.read();
            
            let nostra_interest_rate_view = InterestRateViewDispatcher { contract_address: nostra_gateway };
            let vesu_interest_rate_view = InterestRateViewDispatcher { contract_address: vesu_gateway };
            let vesu_v2_interest_rate_view = InterestRateViewDispatcher { contract_address: vesu_gateway_v2 };
            
            let nostra_borrow_rate = nostra_interest_rate_view.get_borrow_rate(token_address);
            let vesu_borrow_rate = vesu_interest_rate_view.get_borrow_rate(token_address);
            let vesu_v2_borrow_rate = vesu_v2_interest_rate_view.get_borrow_rate(token_address);
            
            // Find the minimum borrow rate among all protocols
            if nostra_borrow_rate <= vesu_borrow_rate && nostra_borrow_rate <= vesu_v2_borrow_rate {
                ('nostra', nostra_borrow_rate)
            } else if vesu_borrow_rate <= vesu_v2_borrow_rate {
                ('vesu', vesu_borrow_rate)
            } else {
                ('vesu_v2', vesu_v2_borrow_rate)
            }
        }

        fn find_optimal_supply_rate(self: @ContractState, token_address: ContractAddress) -> (felt252, u256) {
            let nostra_gateway = self.nostra_gateway.read();
            let vesu_gateway = self.vesu_gateway.read();
            let vesu_gateway_v2 = self.vesu_gateway_v2.read();
            
            let nostra_interest_rate_view = InterestRateViewDispatcher { contract_address: nostra_gateway };
            let vesu_interest_rate_view = InterestRateViewDispatcher { contract_address: vesu_gateway };
            let vesu_v2_interest_rate_view = InterestRateViewDispatcher { contract_address: vesu_gateway_v2 };
            
            let nostra_supply_rate = nostra_interest_rate_view.get_supply_rate(token_address);
            let vesu_supply_rate = vesu_interest_rate_view.get_supply_rate(token_address);
            let vesu_v2_supply_rate = vesu_v2_interest_rate_view.get_supply_rate(token_address);
            
            // Find the maximum supply rate among all protocols
            if nostra_supply_rate >= vesu_supply_rate && nostra_supply_rate >= vesu_v2_supply_rate {
                ('nostra', nostra_supply_rate)
            } else if vesu_supply_rate >= vesu_v2_supply_rate {
                ('vesu', vesu_supply_rate)
            } else {
                ('vesu_v2', vesu_v2_supply_rate)
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