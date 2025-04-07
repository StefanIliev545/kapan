use starknet::ContractAddress;

#[derive(Drop, Serde)]
pub struct Collateral {
    pub token: ContractAddress,
    pub amount: u256
}

#[starknet::interface]
pub trait IGateway<TContractState> {
    // Basic lending operations
    fn deposit(ref self: TContractState, token: ContractAddress, user: ContractAddress, amount: u256);
    fn borrow(ref self: TContractState, token: ContractAddress, user: ContractAddress, amount: u256);
    fn repay(ref self: TContractState, token: ContractAddress, user: ContractAddress, amount: u256);
     // Collateral management
     fn deposit_collateral(
        ref self: TContractState,
        market: ContractAddress,
        collateral: ContractAddress,
        amount: u256,
        receiver: ContractAddress
    );
    fn withdraw_collateral(
        ref self: TContractState,
        market: ContractAddress,
        collateral: ContractAddress,
        user: ContractAddress,
        amount: u256
    ) -> (ContractAddress, u256);

    // View functions for balances and rates
    fn get_balance(self: @TContractState, token: ContractAddress, user: ContractAddress) -> u256;
    fn get_borrow_balance(self: @TContractState, token: ContractAddress, user: ContractAddress) -> u256;
    fn get_borrow_balance_current(ref self: TContractState, token: ContractAddress, user: ContractAddress) -> u256;
    fn get_borrow_rate(self: @TContractState, token: ContractAddress) -> (u256, bool);
    fn get_supply_rate(self: @TContractState, token: ContractAddress) -> (u256, bool);
    fn get_ltv(self: @TContractState, token: ContractAddress, user: ContractAddress) -> u256;

    // Collateral information
    fn get_possible_collaterals(
        self: @TContractState,
        token: ContractAddress,
        user: ContractAddress
    ) -> (Array<ContractAddress>, Array<u256>, Array<felt252>, Array<u8>);

    fn is_collateral_supported(
        self: @TContractState,
        market: ContractAddress,
        collateral: ContractAddress
    ) -> bool;

    fn get_supported_collaterals(
        self: @TContractState,
        market: ContractAddress
    ) -> Array<ContractAddress>;

    // Approval and action functions
    fn get_encoded_collateral_approvals(
        self: @TContractState,
        token: ContractAddress,
        collaterals: Array<Collateral>
    ) -> (Array<ContractAddress>, Array<Span<felt252>>);

    fn get_encoded_debt_approval(
        self: @TContractState,
        token: ContractAddress,
        amount: u256,
        user: ContractAddress
    ) -> (Array<ContractAddress>, Array<Span<felt252>>);

    fn get_inbound_collateral_actions(
        self: @TContractState,
        token: ContractAddress,
        collaterals: Array<Collateral>
    ) -> (Array<ContractAddress>, Array<Span<felt252>>);
} 