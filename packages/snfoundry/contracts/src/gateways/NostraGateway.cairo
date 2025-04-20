use starknet::contract_address::ContractAddress;

#[starknet::interface]
pub trait INostraGateway<TContractState> {
    fn add_supported_asset(ref self: TContractState, underlying: ContractAddress, debt: ContractAddress, collateral: ContractAddress, ibcollateral: ContractAddress);
}

#[starknet::contract]
mod NostraGateway {
    use starknet::storage::{ Map, StorageMapReadAccess, StorageMapWriteAccess };
    use starknet::contract_address::ContractAddress;
    use crate::interfaces::IGateway::{
        ILendingInstructionProcessor,
        LendingInstruction,
    };
    use crate::interfaces::IGateway::{Deposit, Withdraw, Borrow, Repay};
    use crate::interfaces::nostra::{LentDebtTokenABIDispatcher, LentDebtTokenABIDispatcherTrait};
    use super::INostraGateway;
    use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
    use starknet::{contract_address_const, get_caller_address, get_contract_address};
    use core::num::traits::Zero;


    
    #[storage]
    struct Storage {
        underlying_to_ndebt: Map<ContractAddress, ContractAddress>, // underlying -> Nostra debt token
        underlying_to_ncollateral: Map<ContractAddress, ContractAddress>, // underlying -> Nostra collateral token
        underlying_to_nibcollateral: Map<ContractAddress, ContractAddress>, // underlying -> Nostra interest bearing collateral token
    }

    #[constructor]
    fn constructor(ref self:ContractState) {
    }

    #[generate_trait]
    impl NostraInternalFunctions of NostraInternalFunctionsTrait {
        fn deposit(ref self: ContractState, deposit: @Deposit) {
            let deposit = *deposit;
            let underlying = deposit.basic.token;
            let amount = deposit.basic.amount;
            let user = deposit.basic.user;

            let ibcollateral = self.underlying_to_nibcollateral.read(underlying);
            assert(ibcollateral != Zero::zero(), 'not-token');

            let ierc20 = IERC20Dispatcher { contract_address: underlying };
            println!("transferring from user {}", amount);
            assert(ierc20.transfer_from(user, get_contract_address(), amount), 'transfer failed');
            assert(ierc20.approve(ibcollateral, amount), 'approve failed');
            
            let collateral = LentDebtTokenABIDispatcher { contract_address: ibcollateral };
            println!("minting to user {}", amount);
            collateral.mint(user, amount);
        }

        fn withdraw(ref self: ContractState, withdraw: @Withdraw) {
            let withdraw = *withdraw;
            let underlying = withdraw.basic.token;
            let amount = withdraw.basic.amount;
            let user = withdraw.basic.user;

            let ibcollateral = self.underlying_to_nibcollateral.read(underlying);
            assert(ibcollateral != Zero::zero(), 'not-token');

            let collateral = LentDebtTokenABIDispatcher { contract_address: ibcollateral };
            println!("transferring from user {}", amount);
            collateral.transfer_from(user, get_contract_address(), amount);
            println!("burning {}", amount);
            collateral.burn(get_contract_address(), user, amount);
        }

        fn borrow(ref self: ContractState, borrow: @Borrow) {
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
            assert(underlying_token.transfer(user, amount), 'transfer failed');
        }

        fn repay(ref self: ContractState, repay: @Repay) {
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
    }

    #[abi(embed_v0)]
    impl INostraGatewayImpl of INostraGateway<ContractState> {
        fn add_supported_asset(ref self: ContractState, underlying: ContractAddress, debt: ContractAddress, collateral: ContractAddress, ibcollateral: ContractAddress) {
            self.underlying_to_ndebt.write(underlying, debt);
            self.underlying_to_ncollateral.write(underlying, collateral);
            self.underlying_to_nibcollateral.write(underlying, ibcollateral);
        }
    }
}
