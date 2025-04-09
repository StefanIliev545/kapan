use kapan::interfaces::IGateway::{
    ILendingInstructionProcessorDispatcher, 
    ILendingInstructionProcessorDispatcherTrait, 
    LendingInstruction, 
    Deposit, 
    BasicInstruction, 
    Withdraw
};
use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
use openzeppelin::utils::serde::SerializedAppend;
use snforge_std::{CheatSpan, ContractClassTrait, DeclareResultTrait, cheat_caller_address, declare};
use starknet::{ContractAddress, contract_address_const, get_caller_address};
use core::option::Option;
use kapan::interfaces::vesu::{ISingletonDispatcher, ISingletonDispatcherTrait, IERC4626Dispatcher, IERC4626DispatcherTrait};

// Real contract address deployed on Sepolia
fn SINGLETON_ADDRESS() -> ContractAddress {
    contract_address_const::<0x2545b2e5d519fc230e9cd781046d3a64e092114f07e44771e0d719d148725ef>()
}

const POOL_ID: felt252 =
    2198503327643286920898110335698706244522220458610657370981979460625005526824;

const ETH_CONTRACT_ADDRESS: felt252 =
    0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7;
const VTOKEN_ETH_ADDRESS: felt252 =
    0x21fe2ca1b7e731e4a5ef7df2881356070c5d72db4b2d19f9195f6b641f75df0;

fn VTOKEN_ERC4626_ADDRESS() -> ContractAddress {
    contract_address_const::<VTOKEN_ETH_ADDRESS>()
}

fn RICH_ADDRESS() -> ContractAddress {
    contract_address_const::<0x0213c67ed78bc280887234fe5ed5e77272465317978ae86c25a71531d9332a2d>()
}

fn USER_ADDRESS() -> ContractAddress {
    contract_address_const::<0x0113c67ed78bc280887234fe5ed5e77272465317978ae86c25a71531d9332a2d>()
}

fn deploy_vesu_gateway(name: ByteArray) -> ContractAddress {
    let contract_class = declare(name).unwrap().contract_class();
    let mut calldata = array![];
    calldata.append_serde(SINGLETON_ADDRESS());
    calldata.append_serde(POOL_ID);
    let (contract_address, _) = contract_class.deploy(@calldata).unwrap();
    contract_address
}

fn prefund_address(address: ContractAddress) {
    let ethAddress = contract_address_const::<ETH_CONTRACT_ADDRESS>();
    let ethERC = IERC20Dispatcher { contract_address: ethAddress };
    cheat_caller_address(ethAddress, RICH_ADDRESS(), CheatSpan::TargetCalls(1));
    ethERC.transfer(address, 1000000000000000000);
}

fn modify_delegation(gateway: ContractAddress, user: ContractAddress, delegatee: ContractAddress, delegation: bool) {
    let vesuDispatcher = ISingletonDispatcher { contract_address: gateway };
    cheat_caller_address(gateway, user, CheatSpan::TargetCalls(1));
    vesuDispatcher.modify_delegation(POOL_ID, delegatee, delegation);
}

#[test]
#[fork("MAINNET_LATEST")]
fn test_deposit() {
    let contract_address = deploy_vesu_gateway("VesuGateway");
    let ethAddress = contract_address_const::<ETH_CONTRACT_ADDRESS>();
    let dispatcher = ILendingInstructionProcessorDispatcher { contract_address };
    let basic = BasicInstruction {
        token: ethAddress,
        amount: 100000, 
        user: USER_ADDRESS(),
    };
    let deposit = Deposit {
        basic: basic,
        context: Option::None,
    };
    prefund_address(USER_ADDRESS());
    let ethERC = IERC20Dispatcher { contract_address: ethAddress };
    let initial_balance = ethERC.balance_of(USER_ADDRESS());
    assert(initial_balance > basic.amount, 'insufficient balance');
    

    cheat_caller_address(contract_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    cheat_caller_address(ethAddress, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    ethERC.approve(contract_address, basic.amount);
    let instructions = array![LendingInstruction::Deposit(deposit)];
    dispatcher.process_instructions(instructions.span());
    let balance = ethERC.balance_of(USER_ADDRESS());
    assert(balance < initial_balance, 'balance not decreased');
}

#[test]
#[fork("MAINNET_LATEST")]
fn test_basic_withdraw() {
    let contract_address = deploy_vesu_gateway("VesuGateway");
    let ethAddress = contract_address_const::<ETH_CONTRACT_ADDRESS>();
    let ethERC = IERC20Dispatcher { contract_address: ethAddress };
    let dispatcher = ILendingInstructionProcessorDispatcher { contract_address };
    let amount = 100000;
    let deposit = Deposit {
        basic: BasicInstruction{
            token: ethAddress,
            amount: amount,
            user: USER_ADDRESS(),
        },
        context: Option::None,
    };
    prefund_address(USER_ADDRESS());
    cheat_caller_address(ethAddress, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    ethERC.approve(contract_address, deposit.basic.amount);

    cheat_caller_address(contract_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    let instructions = array![LendingInstruction::Deposit(deposit)];
    dispatcher.process_instructions(instructions.span());
    println!("deposit done");

    let vToken = IERC20Dispatcher { contract_address: contract_address_const::<VTOKEN_ETH_ADDRESS>() };
    let vTokenERC4626 = IERC4626Dispatcher { contract_address: contract_address_const::<VTOKEN_ETH_ADDRESS>() };
    assert(vToken.balance_of(USER_ADDRESS()) > 0, 'vToken balance not increased');
    println!("vToken balance: {}", vToken.balance_of(USER_ADDRESS()));
    let shares = vTokenERC4626.convert_to_shares(amount);
    let assets = vTokenERC4626.convert_to_assets(shares);
    println!("shares: {}", shares);
    println!("assets: {}", assets);

    cheat_caller_address(VTOKEN_ERC4626_ADDRESS(), USER_ADDRESS(), CheatSpan::TargetCalls(1));
    vToken.approve(contract_address, shares);
    let allowance = vToken.allowance(USER_ADDRESS(), contract_address);
    println!("allowance: {}", allowance);

    modify_delegation(SINGLETON_ADDRESS(), USER_ADDRESS(), contract_address, true);
    let initialBalance = ethERC.balance_of(USER_ADDRESS());
    println!("initial balance: {}", initialBalance);

    cheat_caller_address(contract_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    let withdraw = Withdraw {
        basic: BasicInstruction{
            token: ethAddress,
            amount: amount,
            user: USER_ADDRESS(),
        },
        context: Option::None,
    };
    let instructions = array![LendingInstruction::Withdraw(withdraw)];
    dispatcher.process_instructions(instructions.span());
    
    let balance = ethERC.balance_of(USER_ADDRESS());
    println!("balance: {}", balance);
    assert(balance > initialBalance, 'balance not increased');
}
