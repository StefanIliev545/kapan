use starknet::contract_address::ContractAddress;
use crate::interfaces::nostra::{InterestRateConfig, InterestRateModelABI};

#[starknet::interface]
pub trait INostraGateway<TContractState> {
    fn add_supported_asset(ref self: TContractState, underlying: ContractAddress, debt: ContractAddress, collateral: ContractAddress, ibcollateral: ContractAddress);
    fn get_user_positions(self: @TContractState, user: ContractAddress) -> Array<(ContractAddress, u256, u256)>;
    fn get_interest_rates(self: @TContractState, underlyings: Span<ContractAddress>) -> Array<InterestRateConfig>;
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
    use crate::interfaces::nostra::{LentDebtTokenABIDispatcher, LentDebtTokenABIDispatcherTrait, InterestRateModelABIDispatcher, InterestRateModelABIDispatcherTrait, InterestRateConfig};
    use super::INostraGateway;
    use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
    use starknet::{contract_address_const, get_caller_address, get_contract_address};
    use core::num::traits::Zero;


    
    #[storage]
    struct Storage {
        underlying_to_ndebt: Map<ContractAddress, ContractAddress>, // underlying -> Nostra debt token
        underlying_to_ncollateral: Map<ContractAddress, ContractAddress>, // underlying -> Nostra collateral token
        underlying_to_nibcollateral: Map<ContractAddress, ContractAddress>, // underlying -> Nostra interest bearing collateral token
        supported_assets: Vec<ContractAddress>, // underlying tokens
        interest_rate_model: ContractAddress,
    }

    #[constructor]
    fn constructor(ref self:ContractState, interest_rate_model: ContractAddress) {
        self.interest_rate_model.write(interest_rate_model);
    }

    #[generate_trait]
    impl NostraInternalFunctions of NostraInternalFunctionsTrait {
        fn deposit(ref self: ContractState, deposit: @Deposit) {
            println!("deposit");
            let deposit = *deposit;
            let underlying = deposit.basic.token;
            let amount = deposit.basic.amount;
            let user = deposit.basic.user;

            let ibcollateral = self.underlying_to_nibcollateral.read(underlying);
            assert(ibcollateral != Zero::zero(), 'not-token');

            let ierc20 = IERC20Dispatcher { contract_address: underlying };
            println!("transferring from user {}", amount);
            assert(ierc20.transfer_from(get_caller_address(), get_contract_address(), amount), 'transfer failed');
            assert(ierc20.approve(ibcollateral, amount), 'approve failed');
            
            let collateral = LentDebtTokenABIDispatcher { contract_address: ibcollateral };
            println!("minting to user {}", amount);
            collateral.mint(user, amount);
        }

        fn withdraw(ref self: ContractState, withdraw: @Withdraw) {
            println!("withdraw");
            let withdraw = *withdraw;
            let underlying = withdraw.basic.token;
            let amount = withdraw.basic.amount;
            let user = withdraw.basic.user;

            let ibcollateral = self.underlying_to_nibcollateral.read(underlying);
            assert(ibcollateral != Zero::zero(), 'not-token');

            let collateral = LentDebtTokenABIDispatcher { contract_address: ibcollateral };
            println!("transferring from user {}", amount);
            collateral.transfer_from(withdraw.basic.user, get_contract_address(), amount);
            println!("burning {}", amount);
            collateral.burn(get_contract_address(), get_caller_address(), amount);
        }

        fn borrow(ref self: ContractState, borrow: @Borrow) {
            println!("borrow");
            let borrow = *borrow;
            let underlying = borrow.basic.token;
            let amount = borrow.basic.amount;
            let user = borrow.basic.user;

            let debt = self.underlying_to_ndebt.read(underlying);
            assert(debt != Zero::zero(), 'not-token');

            let debt_token = LentDebtTokenABIDispatcher { contract_address: debt };
            debt_token.borrow(user, amount);
            let underlying_token = IERC20Dispatcher { contract_address: underlying };
            assert(underlying_token.balance_of(get_contract_address()) >= amount, 'insufficient balance');
            assert(underlying_token.transfer(get_caller_address(), amount), 'transfer failed');
        }

        fn repay(ref self: ContractState, repay: @Repay) {
            println!("repay");
            let repay = *repay;
            let underlying = repay.basic.token;
            let amount = repay.basic.amount;
            let user = repay.basic.user;

            let debt = self.underlying_to_ndebt.read(underlying);
            assert(debt != Zero::zero(), 'not-token');

            let underlying_token = IERC20Dispatcher { contract_address: underlying };
            underlying_token.transfer_from(get_caller_address(), get_contract_address(), amount);
            underlying_token.approve(debt, amount);
            
            let debt_token = LentDebtTokenABIDispatcher { contract_address: debt };
            debt_token.repay(user, amount);
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
                    }
                }
            }
        }

        fn get_authorizations_for_instructions(ref self: ContractState, instructions: Span<LendingInstruction>) -> Span<(ContractAddress, felt252, Array<felt252>)> {
            let mut authorizations = ArrayTrait::new();
            for instruction in instructions {
                match instruction {
                    LendingInstruction::Deposit(instruction) => {
                        let token = *instruction.basic.token;
                        let amount = instruction.basic.amount;
                        let mut call_data: Array<felt252> = array![];
                        Serde::serialize(@get_caller_address(), ref call_data); //todo - this is a hack to get the address of the router..
                        Serde::serialize(amount, ref call_data);
                        authorizations.append((token, selector!("approve"), call_data));
                    },
                    LendingInstruction::Borrow(instruction) => {
                        let mut call_data: Array<felt252> = array![];
                        Serde::serialize(@get_contract_address(), ref call_data);
                        Serde::serialize(instruction.basic.amount, ref call_data);
                        Serde::serialize(instruction.basic.user, ref call_data);
                        let debt_token = self.underlying_to_ndebt.read(*instruction.basic.token);
                        assert(debt_token != Zero::zero(), 'not-token');
                        authorizations.append((debt_token, selector!("approve_delegation"), call_data));
                    },
                    LendingInstruction::Repay(instruction) => {
                        let mut call_data: Array<felt252> = array![];
                        Serde::serialize(@get_caller_address(), ref call_data); //todo - this is a hack to get the address of the router..
                        Serde::serialize(instruction.basic.amount, ref call_data);
                        authorizations.append((*instruction.basic.token, selector!("approve"), call_data));
                    },
                    LendingInstruction::Withdraw(instruction) => {
                        let ibtoken = self.underlying_to_nibcollateral.read(*instruction.basic.token);
                        assert(ibtoken != Zero::zero(), 'not-token');
                        let mut call_data: Array<felt252> = array![];
                        Serde::serialize(@get_contract_address(), ref call_data); //todo - this is a hack to get the address of the router..
                        Serde::serialize(instruction.basic.amount, ref call_data);
                        authorizations.append((ibtoken, selector!("approve"), call_data));
                    },
                    _ => {}
                }
            }
            return authorizations.span();
        }
    }

    #[abi(embed_v0)]
    impl INostraGatewayImpl of INostraGateway<ContractState> {
        fn add_supported_asset(ref self: ContractState, underlying: ContractAddress, debt: ContractAddress, collateral: ContractAddress, ibcollateral: ContractAddress) {
            self.underlying_to_ndebt.write(underlying, debt);
            self.underlying_to_ncollateral.write(underlying, collateral);
            self.underlying_to_nibcollateral.write(underlying, ibcollateral);
            self.supported_assets.push(underlying);
        }

        fn get_user_positions(self: @ContractState, user: ContractAddress) -> Array<(ContractAddress, u256, u256)> {
            let mut positions = array![];
            let mut i = 0;
            println!("supported_assets.len() {}", self.supported_assets.len());
            while i != self.supported_assets.len() {
                let underlying = self.supported_assets.at(i).read();
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
                positions.append((underlying, debt_balance, collateral_balance));
                i += 1;
            }
            return positions;
        }

        fn get_interest_rates(self: @ContractState, underlyings: Span<ContractAddress>) -> Array<InterestRateConfig> {
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
            }
            return rates;
        }
    }
}
