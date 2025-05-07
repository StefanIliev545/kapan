use starknet::contract_address::ContractAddress;
use crate::interfaces::nostra::{InterestState};

#[starknet::interface]
pub trait INostraGateway<TContractState> {
    fn add_supported_asset(ref self: TContractState, underlying: ContractAddress, debt: ContractAddress, collateral: ContractAddress, ibcollateral: ContractAddress);
    fn get_supported_assets_array(self: @TContractState) -> Array<ContractAddress>;
    fn get_supported_assets_info(self: @TContractState, user: ContractAddress) -> Array<(ContractAddress, felt252, u8, u256)>;
    fn get_user_positions(self: @TContractState, user: ContractAddress) -> Array<(ContractAddress, felt252, u256, u256)>;
    fn get_interest_rates(self: @TContractState, underlyings: Span<ContractAddress>) -> Array<InterestState>;
}


#[starknet::interface]
trait IERC20Symbol<TContractState> {
    fn symbol(self: @TContractState) -> felt252;
}

#[starknet::contract]
mod NostraGateway {
    use starknet::storage::{ Map, Vec, VecTrait, MutableVecTrait, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerWriteAccess, StoragePointerReadAccess };
    use starknet::contract_address::ContractAddress;
    use crate::interfaces::IGateway::{
        ILendingInstructionProcessor,
        LendingInstruction,
    };
    use crate::interfaces::IGateway::{Deposit, Withdraw, Borrow, Repay};
    use crate::interfaces::nostra::{
        LentDebtTokenABIDispatcher, 
        LentDebtTokenABIDispatcherTrait, 
        InterestRateModelABIDispatcher, 
        InterestRateModelABIDispatcherTrait, 
        InterestRateConfig,
        DebtTokenABIDispatcher,
        DebtTokenABIDispatcherTrait,
    };
    use super::INostraGateway;
    use super::{IERC20SymbolDispatcher, IERC20SymbolDispatcherTrait};
    use openzeppelin::token::erc20::interface::{IERC20MetadataDispatcher, IERC20MetadataDispatcherTrait};
    use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
    use starknet::{contract_address_const, get_caller_address, get_contract_address};
    use core::num::traits::Zero;
    use super::InterestState;

    use openzeppelin::access::ownable::OwnableComponent;

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    #[abi(embed_v0)]
    impl OwnableMixinImpl = OwnableComponent::OwnableMixinImpl<ContractState>;
    impl InternalImpl = OwnableComponent::InternalImpl<ContractState>;
    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        OwnableEvent: OwnableComponent::Event,
    }

    #[storage]
    struct Storage {
        underlying_to_ndebt: Map<ContractAddress, ContractAddress>, // underlying -> Nostra debt token
        underlying_to_ncollateral: Map<ContractAddress, ContractAddress>, // underlying -> Nostra collateral token
        underlying_to_nibcollateral: Map<ContractAddress, ContractAddress>, // underlying -> Nostra interest bearing collateral token
        supported_assets: Vec<ContractAddress>, // underlying tokens
        interest_rate_model: ContractAddress,
        router: ContractAddress,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
    }

    #[constructor]
    fn constructor(ref self:ContractState, interest_rate_model: ContractAddress, router: ContractAddress, owner: ContractAddress) {
        self.interest_rate_model.write(interest_rate_model);
        self.router.write(router);
        self.ownable.initializer(owner); 
    }

    #[generate_trait]
    impl NostraInternalFunctions of NostraInternalFunctionsTrait {
        fn deposit(ref self: ContractState, deposit: @Deposit) {
            let deposit = *deposit;
            let underlying = deposit.basic.token;
            let amount = deposit.basic.amount;
            let user = deposit.basic.user;
            if (amount == 0) {
                return;
            }

            let ibcollateral = self.underlying_to_nibcollateral.read(underlying);
            assert(ibcollateral != Zero::zero(), 'not-token');

            let ierc20 = IERC20Dispatcher { contract_address: underlying };
            assert(ierc20.transfer_from(get_caller_address(), get_contract_address(), amount), 'transfer failed');
            assert(ierc20.approve(ibcollateral, amount), 'approve failed');
            
            let collateral = LentDebtTokenABIDispatcher { contract_address: ibcollateral };
            collateral.mint(user, amount);
        }

        fn withdraw(ref self: ContractState, withdraw: @Withdraw) {
            let withdraw = *withdraw;
            let underlying = withdraw.basic.token;
            let mut amount = withdraw.basic.amount;
            let user = withdraw.basic.user;

            self.assert_router_or_user(user);

            let ibcollateral = self.underlying_to_nibcollateral.read(underlying);
            assert(ibcollateral != Zero::zero(), 'not-token');

            if withdraw.withdraw_all {
                let collateralERC20 = IERC20Dispatcher { contract_address: ibcollateral };
                amount = collateralERC20.balance_of(user);
            }

            let collateral = LentDebtTokenABIDispatcher { contract_address: ibcollateral };
            collateral.transfer_from(user, get_contract_address(), amount);
            collateral.burn(get_contract_address(), get_caller_address(), amount);
        }

        fn borrow(ref self: ContractState, borrow: @Borrow) {
            let borrow = *borrow;
            let underlying = borrow.basic.token;
            let amount = borrow.basic.amount;
            let user = borrow.basic.user;

            self.assert_router_or_user(user);

            let debt = self.underlying_to_ndebt.read(underlying);
            assert(debt != Zero::zero(), 'not-token');

            let underlying_token = IERC20Dispatcher { contract_address: underlying };
            let debt_token = DebtTokenABIDispatcher { contract_address: debt };

            let balance_before = underlying_token.balance_of(get_contract_address());
            debt_token.mint(user, amount);
            let balance_after = underlying_token.balance_of(get_contract_address());
            assert(balance_after > balance_before, 'mint failed');

            assert(underlying_token.balance_of(get_contract_address()) >= amount, 'insufficient balance');
            assert(underlying_token.transfer(get_caller_address(), amount), 'transfer failed');
        }

        fn repay(ref self: ContractState, repay: @Repay) {
            let repay = *repay;
            let underlying = repay.basic.token;
            let mut amount = repay.basic.amount;
            let user = repay.basic.user;

            let debt = self.underlying_to_ndebt.read(underlying);
            assert(debt != Zero::zero(), 'not-token');

            if repay.repay_all {
                let debt_token_erc20 = IERC20Dispatcher { contract_address: debt };
                amount = debt_token_erc20.balance_of(user);
            }

            let underlying_token = IERC20Dispatcher { contract_address: underlying };
            underlying_token.transfer_from(get_caller_address(), get_contract_address(), amount);
            underlying_token.approve(debt, amount);
            
            let debt_token = DebtTokenABIDispatcher { contract_address: debt };
            debt_token.burn(user, amount);
        }

        fn assert_router_or_user(self: @ContractState, user: ContractAddress) {
            let router = self.router.read();
            assert(router == get_caller_address() || user == get_caller_address(), 'unauthorized');
        }
    }
    

    #[abi(embed_v0)]
    impl ILendingInstructionProcessorImpl of ILendingInstructionProcessor<ContractState> {        
        fn process_instructions(ref self: ContractState, instructions: Span<LendingInstruction>) {
            for instruction in instructions {
                match instruction {
                    LendingInstruction::Deposit(instruction) => {
                        self.deposit(instruction);
                    },
                    LendingInstruction::Withdraw(instruction) => {
                        self.withdraw(instruction);
                    },
                    LendingInstruction::Borrow(instruction) => {
                        self.borrow(instruction);
                    },
                    LendingInstruction::Repay(instruction) => {
                        self.repay(instruction);
                    },
                    _ => {}
                }
            }
        }

        fn get_authorizations_for_instructions(ref self: ContractState, instructions: Span<LendingInstruction>, rawSelectors: bool) -> Span<(ContractAddress, felt252, Array<felt252>)> {
            let mut authorizations = ArrayTrait::new();
            for instruction in instructions {
                match instruction {
                    LendingInstruction::Deposit(instruction) => {
                        let token = *instruction.basic.token;
                        let amount = instruction.basic.amount;
                        let mut call_data: Array<felt252> = array![];
                        Serde::serialize(@get_caller_address(), ref call_data); //todo - this is a hack to get the address of the router..
                        Serde::serialize(amount, ref call_data);
                        let selector = if !rawSelectors { 'approve' } else { selector!("approve") };
                        authorizations.append((token, selector, call_data));
                    },
                    LendingInstruction::Borrow(instruction) => {
                        let mut call_data: Array<felt252> = array![];
                        Serde::serialize(@get_contract_address(), ref call_data);
                        Serde::serialize(instruction.basic.amount, ref call_data);
                        Serde::serialize(instruction.basic.user, ref call_data);
                        let debt_token = self.underlying_to_ndebt.read(*instruction.basic.token);
                        assert(debt_token != Zero::zero(), 'not-token');
                        let selector = if !rawSelectors { 'approve_delegation' } else { selector!("approve_delegation") };
                        authorizations.append((debt_token, selector, call_data));
                    },
                    LendingInstruction::Repay(instruction) => {
                        let mut call_data: Array<felt252> = array![];
                        Serde::serialize(@get_caller_address(), ref call_data); //todo - this is a hack to get the address of the router..
                        Serde::serialize(instruction.basic.amount, ref call_data);
                        let selector = if !rawSelectors { 'approve' } else { selector!("approve") };
                        authorizations.append((*instruction.basic.token, selector, call_data));
                    },
                    LendingInstruction::Withdraw(instruction) => {
                        let ibtoken = self.underlying_to_nibcollateral.read(*instruction.basic.token);
                        assert(ibtoken != Zero::zero(), 'not-token');
                        let mut call_data: Array<felt252> = array![];
                        Serde::serialize(@get_contract_address(), ref call_data); //todo - this is a hack to get the address of the router..
                        Serde::serialize(instruction.basic.amount, ref call_data);
                        let selector = if !rawSelectors { 'approve' } else { selector!("approve") };
                        authorizations.append((ibtoken, selector, call_data));
                    },
                    LendingInstruction::Reborrow(instruction) => {
                        let mut call_data: Array<felt252> = array![];
                        Serde::serialize(@get_contract_address(), ref call_data); //todo - this is a hack to get the address of the router..
                        Serde::serialize(instruction.approval_amount, ref call_data);
                        Serde::serialize(instruction.user, ref call_data);
                        let selector = if !rawSelectors { 'approve_delegation' } else { selector!("approve_delegation") };
                        let debt_token = self.underlying_to_ndebt.read(*instruction.token);
                        assert(debt_token != Zero::zero(), 'not-token');
                        authorizations.append((debt_token, selector, call_data));
                    },
                    _ => {}
                }
            };
            return authorizations.span();
        }

        fn get_flash_loan_amount(ref self: ContractState, repay: Repay) -> u256 {
            if repay.repay_all {
                let debt_token = IERC20Dispatcher { contract_address: self.underlying_to_ndebt.read(repay.basic.token) };
                debt_token.balance_of(repay.basic.user)
            } else {
                repay.basic.amount
            }
        }
    }

    #[abi(embed_v0)]
    impl INostraGatewayImpl of INostraGateway<ContractState> {
        fn add_supported_asset(ref self: ContractState, underlying: ContractAddress, debt: ContractAddress, collateral: ContractAddress, ibcollateral: ContractAddress) {
            self.ownable.assert_only_owner();
            self.underlying_to_ndebt.write(underlying, debt);
            self.underlying_to_ncollateral.write(underlying, collateral);
            self.underlying_to_nibcollateral.write(underlying, ibcollateral);
            self.supported_assets.append().write(underlying);
        }

        fn get_supported_assets_array(self: @ContractState) -> Array<ContractAddress> {
            let mut assets = array![];
            let supported_assets = self.supported_assets;
            let len = supported_assets.len();
            for i in 0..len {
                assets.append(self.supported_assets.at(i).read());
            };
            assets
        }

        fn get_supported_assets_info(self: @ContractState, user: ContractAddress) -> Array<(ContractAddress, felt252, u8, u256)> {
            let mut assets = array![];
            let supported_assets = self.supported_assets;
            let len = supported_assets.len();
            for i in 0..len {
                let underlying = self.supported_assets.at(i).read();
                let symbol = IERC20SymbolDispatcher { contract_address: underlying }.symbol();
                let decimals = IERC20MetadataDispatcher { contract_address: underlying }.decimals();
                let nibcollateral = self.underlying_to_nibcollateral.read(underlying);
                let nib_token = IERC20Dispatcher { contract_address: nibcollateral };
                let mut balance = nib_token.balance_of(user);
                if balance == 0 {
                    let ncollateral = self.underlying_to_ncollateral.read(underlying);
                    let ncollateral_token = IERC20Dispatcher { contract_address: ncollateral };
                    balance = ncollateral_token.balance_of(user);
                };
                assets.append((underlying, symbol, decimals, balance));
            };
            assets
        }

        fn get_user_positions(self: @ContractState, user: ContractAddress) -> Array<(ContractAddress, felt252, u256, u256)> {
            let mut positions = array![];
            let mut i = 0;
            while i != self.supported_assets.len() {
                let underlying = self.supported_assets.at(i).read();
                let symbol = IERC20SymbolDispatcher { contract_address: underlying }.symbol();
                
                let debt = self.underlying_to_ndebt.read(underlying);
                let collateral = self.underlying_to_ncollateral.read(underlying);
                let ibcollateral = self.underlying_to_nibcollateral.read(underlying);

                let debt_balance = IERC20Dispatcher { contract_address: debt }.balance_of(user);
                let collateral_raw = IERC20Dispatcher { contract_address: collateral }.balance_of(user);
                let collateral_balance = if collateral_raw == 0 {
                    IERC20Dispatcher { contract_address: ibcollateral }.balance_of(user)
                } else {
                    collateral_raw
                };
                positions.append((underlying, symbol, debt_balance, collateral_balance));
                i += 1;
            };
            return positions;
        }

        fn get_interest_rates(self: @ContractState, underlyings: Span<ContractAddress>) -> Array<InterestState> {
            let mut rates = array![];
            let mut i = 0;
            while i != underlyings.len() {
                let underlying = *underlyings.at(i);
                let debt = self.underlying_to_ndebt.read(underlying);
                let interest_rate_model = self.interest_rate_model.read();
                let model = InterestRateModelABIDispatcher { contract_address: interest_rate_model };
                let config = model.get_interest_state(debt);
                rates.append(config);
                i += 1;
            };
            return rates;
        }
    }


    use crate::interfaces::IGateway::InterestRateView;

    #[abi(embed_v0)]
    impl InterestRateViewImpl of InterestRateView<ContractState> {
        fn get_borrow_rate(ref self: ContractState, token_address: ContractAddress) -> u256 {
            let interest_rate_model = self.interest_rate_model.read();
            let debt = self.underlying_to_ndebt.read(token_address);
            let model = InterestRateModelABIDispatcher { contract_address: interest_rate_model };
            let config = model.get_interest_state(debt);
            config.borrowing_rate
        }

        fn get_supply_rate(ref self: ContractState, token_address: ContractAddress) -> u256 {
            let interest_rate_model = self.interest_rate_model.read();
            let debt = self.underlying_to_ndebt.read(token_address);
            let model = InterestRateModelABIDispatcher { contract_address: interest_rate_model };
            let config = model.get_interest_state(debt);
            config.lending_rate
        }
    }
}
