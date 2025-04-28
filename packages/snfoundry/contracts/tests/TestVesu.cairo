use core::num::traits::Zero;
use core::option::Option;
use core::traits::Drop;
use kapan::gateways::VesuGateway::{
    IVesuGatewayAdminDispatcher, IVesuGatewayAdminDispatcherTrait, IVesuViewerDispatcher,
    IVesuViewerDispatcherTrait, VesuContext,
};
use kapan::interfaces::IGateway::{
    BasicInstruction, Borrow, Deposit, ILendingInstructionProcessorDispatcher,
    ILendingInstructionProcessorDispatcherTrait, LendingInstruction, Repay, Withdraw,
};
use kapan::interfaces::vesu::{
    IERC4626Dispatcher, IERC4626DispatcherTrait, ISingletonDispatcher, ISingletonDispatcherTrait,
};
use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
use openzeppelin::utils::serde::SerializedAppend;
use snforge_std::{CheatSpan, ContractClassTrait, DeclareResultTrait, cheat_caller_address, declare};
use starknet::{ContractAddress, contract_address_const, get_caller_address};

// Real contract address deployed on Sepolia
fn SINGLETON_ADDRESS() -> ContractAddress {
    contract_address_const::<0x2545b2e5d519fc230e9cd781046d3a64e092114f07e44771e0d719d148725ef>()
}

const POOL_ID: felt252 =
    2198503327643286920898110335698706244522220458610657370981979460625005526824;

const ETH_CONTRACT_ADDRESS: felt252 =
    0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7;
const USDC_CONTRACT_ADDRESS: felt252 =
    0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8;
const VTOKEN_ETH_ADDRESS: felt252 =
    0x21fe2ca1b7e731e4a5ef7df2881356070c5d72db4b2d19f9195f6b641f75df0;

fn VTOKEN_ERC4626_ADDRESS() -> ContractAddress {
    contract_address_const::<VTOKEN_ETH_ADDRESS>()
}

fn USDC_ERC20_ADDRESS() -> ContractAddress {
    contract_address_const::<USDC_CONTRACT_ADDRESS>()
}

fn RICH_ADDRESS() -> ContractAddress {
    contract_address_const::<0x0213c67ed78bc280887234fe5ed5e77272465317978ae86c25a71531d9332a2d>()
}

fn USER_ADDRESS() -> ContractAddress {
    contract_address_const::<0x0113c67ed78bc280887234fe5ed5e77272465317978ae86c25a71531d9332a2d>()
}

// Helper struct to organize test context
#[derive(Drop)]
struct TestContext {
    gateway_address: ContractAddress,
    token_address: ContractAddress,
    token_erc20: IERC20Dispatcher,
    gateway_dispatcher: ILendingInstructionProcessorDispatcher,
    vtoken_address: ContractAddress,
    vtoken_erc20: IERC20Dispatcher,
    vtoken_erc4626: IERC4626Dispatcher,
}

fn setup_test_context() -> TestContext {
    println!("deploying gateway");
    let gateway_address = deploy_vesu_gateway("VesuGateway");
    let token_address = contract_address_const::<ETH_CONTRACT_ADDRESS>();
    let token_erc20 = IERC20Dispatcher { contract_address: token_address };
    let gateway_dispatcher = ILendingInstructionProcessorDispatcher {
        contract_address: gateway_address,
    };
    let vtoken_address = contract_address_const::<VTOKEN_ETH_ADDRESS>();
    let vtoken_erc20 = IERC20Dispatcher { contract_address: vtoken_address };
    let vtoken_erc4626 = IERC4626Dispatcher { contract_address: vtoken_address };

    // Pre-fund the test user
    println!("pre-funding address");
    prefund_address(USER_ADDRESS());

    TestContext {
        gateway_address,
        token_address,
        token_erc20,
        gateway_dispatcher,
        vtoken_address,
        vtoken_erc20,
        vtoken_erc4626,
    }
}

fn deploy_vesu_gateway(name: ByteArray) -> ContractAddress {
    let eth_address = contract_address_const::<ETH_CONTRACT_ADDRESS>();
    let usdc_address = contract_address_const::<USDC_CONTRACT_ADDRESS>();

    let contract_class = declare(name).unwrap().contract_class();
    let mut calldata = array![];
    calldata.append_serde(SINGLETON_ADDRESS());
    calldata.append_serde(POOL_ID);
    // Add supported assets array
    let mut supported_assets = array![];
    supported_assets.append(eth_address);
    supported_assets.append(usdc_address);
    calldata.append_serde(supported_assets);
    let (contract_address, _) = contract_class.deploy(@calldata).unwrap();
    contract_address
}

fn prefund_address(address: ContractAddress) {
    let ethAddress = contract_address_const::<ETH_CONTRACT_ADDRESS>();
    let ethERC = IERC20Dispatcher { contract_address: ethAddress };
    cheat_caller_address(ethAddress, RICH_ADDRESS(), CheatSpan::TargetCalls(1));
    ethERC.transfer(address, 15000000000000000000);
}

fn modify_delegation(
    gateway: ContractAddress, user: ContractAddress, delegatee: ContractAddress, delegation: bool,
) {
    let vesuDispatcher = ISingletonDispatcher { contract_address: gateway };
    cheat_caller_address(gateway, user, CheatSpan::TargetCalls(1));
    vesuDispatcher.modify_delegation(POOL_ID, delegatee, delegation);
}

// Helper function to create a basic instruction
fn create_basic_instruction(
    token: ContractAddress, amount: u256, user: ContractAddress,
) -> BasicInstruction {
    BasicInstruction { token, amount, user }
}

// Perform deposit operation with provided context and amount
fn perform_deposit(ref context: TestContext, amount: u256) -> u256 {
    let basic = create_basic_instruction(context.token_address, amount, USER_ADDRESS());
    let deposit = Deposit { basic, context: Option::None };

    let initial_balance = context.token_erc20.balance_of(USER_ADDRESS());
    assert(initial_balance >= amount, 'insufficient balance');

    // Approve and deposit
    cheat_caller_address(context.token_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    context.token_erc20.approve(context.gateway_address, amount);

    cheat_caller_address(context.gateway_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    let instructions = array![LendingInstruction::Deposit(deposit)];
    context.gateway_dispatcher.process_instructions(instructions.span());

    // Return initial balance for verification
    initial_balance
}

// Perform withdrawal operation with provided context and amount
fn perform_withdrawal(ref context: TestContext, amount: u256) -> u256 {
    // Convert amount to shares
    let shares = context.vtoken_erc4626.convert_to_shares(amount);

    // Approve vToken transfer
    cheat_caller_address(context.vtoken_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    context.vtoken_erc20.approve(context.gateway_address, shares);

    // Enable delegation
    modify_delegation(SINGLETON_ADDRESS(), USER_ADDRESS(), context.gateway_address, true);

    // Record initial balance for verification
    let initial_balance = context.token_erc20.balance_of(USER_ADDRESS());

    // Create and process withdrawal instruction
    let withdraw = Withdraw {
        basic: create_basic_instruction(context.token_address, amount, USER_ADDRESS()),
        context: Option::None,
    };

    cheat_caller_address(context.gateway_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    let instructions = array![LendingInstruction::Withdraw(withdraw)];
    context.gateway_dispatcher.process_instructions(instructions.span());

    // Return initial balance for verification
    initial_balance
}

#[test]
#[ignore]
#[fork("MAINNET_LATEST")]
fn test_deposit() {
    let mut context = setup_test_context();
    let amount = 100000;
    let initial_balance = perform_deposit(ref context, amount);

    // Verify balance change
    let current_balance = context.token_erc20.balance_of(USER_ADDRESS());
    assert(current_balance < initial_balance, 'balance not decreased');
}

#[test]
#[ignore]
#[fork("MAINNET_LATEST")]
fn test_basic_withdraw() {
    let mut context = setup_test_context();
    let amount = 100000;

    // First perform a deposit
    perform_deposit(ref context, amount);

    // Now perform a withdrawal
    let initial_balance = perform_withdrawal(ref context, amount);

    // Verify balance change
    let current_balance = context.token_erc20.balance_of(USER_ADDRESS());
    println!("balance: {}", current_balance);
    assert(current_balance > initial_balance, 'balance not increased');
}

#[test]
#[ignore]
#[fork("MAINNET_LATEST")]
fn test_borrow() {
    let mut context = setup_test_context();
    let amount = 5000000000000000000;
    perform_deposit(ref context, amount);

    println!("deposited!");
    let mut context_array = array![];
    VesuContext { pool_id: POOL_ID, position_counterpart_token: context.token_address }
        .serialize(ref context_array);

    let usdcERC20 = IERC20Dispatcher { contract_address: USDC_ERC20_ADDRESS() };
    let initial_usdc_balance = usdcERC20.balance_of(USER_ADDRESS());
    println!("usdc balance: {}", initial_usdc_balance);

    let borrow = Borrow {
        basic: create_basic_instruction(USDC_ERC20_ADDRESS(), 110000000, USER_ADDRESS()),
        context: Option::Some(context_array.span()),
    };
    println!("delegating!");
    modify_delegation(SINGLETON_ADDRESS(), USER_ADDRESS(), context.gateway_address, true);
    println!("borrowing!");
    cheat_caller_address(context.gateway_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    let instructions = array![LendingInstruction::Borrow(borrow)];
    context.gateway_dispatcher.process_instructions(instructions.span());

    let current_usdc_balance = usdcERC20.balance_of(USER_ADDRESS());
    println!("usdc balance: {}", current_usdc_balance);
    assert(current_usdc_balance > initial_usdc_balance, 'usdc balance not increased');

    // Create another ETH deposit position since borrowing moved the collateral
    let eth_amount_2 = 3000000000000000000; // 3 ETH
    perform_deposit(ref context, eth_amount_2);
}

#[test]
#[ignore]
#[fork("MAINNET_LATEST")]
fn test_repay() {
    println!("testing repay");
    let mut context = setup_test_context();
    let amount = 5000000000000000000;

    // First perform a deposit
    perform_deposit(ref context, amount);

    println!("deposited!");
    let mut context_array = array![];
    VesuContext { pool_id: POOL_ID, position_counterpart_token: context.token_address }
        .serialize(ref context_array);

    let usdcERC20 = IERC20Dispatcher { contract_address: USDC_ERC20_ADDRESS() };

    // First borrow some USDC
    let borrow_amount = 220000000;
    let borrow = Borrow {
        basic: create_basic_instruction(USDC_ERC20_ADDRESS(), borrow_amount, USER_ADDRESS()),
        context: Option::Some(context_array.span()),
    };

    println!("delegating!");
    modify_delegation(SINGLETON_ADDRESS(), USER_ADDRESS(), context.gateway_address, true);
    println!("borrowing!");
    cheat_caller_address(context.gateway_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    let instructions = array![LendingInstruction::Borrow(borrow)];
    context.gateway_dispatcher.process_instructions(instructions.span());

    let initial_usdc_balance = usdcERC20.balance_of(USER_ADDRESS());
    println!("usdc balance after borrow: {}", initial_usdc_balance);

    // Now repay half of the borrowed amount
    let repay_amount = borrow_amount / 2;

    // Approve gateway to spend USDC
    cheat_caller_address(USDC_ERC20_ADDRESS(), USER_ADDRESS(), CheatSpan::TargetCalls(1));
    usdcERC20.approve(context.gateway_address, repay_amount);

    // Create and process repay instruction
    let repay = Repay {
        basic: create_basic_instruction(USDC_ERC20_ADDRESS(), repay_amount, USER_ADDRESS()),
        context: Option::Some(context_array.span()),
    };

    cheat_caller_address(context.gateway_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    let instructions = array![LendingInstruction::Repay(repay)];
    context.gateway_dispatcher.process_instructions(instructions.span());

    let final_usdc_balance = usdcERC20.balance_of(USER_ADDRESS());
    println!("usdc balance after repay: {}", final_usdc_balance);

    // Verify that the balance decreased by the repay amount
    assert(final_usdc_balance == initial_usdc_balance - repay_amount, 'no-decrease');
}

#[test]
#[ignore]
#[fork("MAINNET_LATEST")]
fn test_get_all_positions() {
    let mut context = setup_test_context();

    // Create ETH deposit position (collateral: ETH, debt: Zero)
    let eth_amount = 5000000000000000000; // 5 ETH
    perform_deposit(ref context, eth_amount);

    // Create ETH-USDC borrow position
    let mut context_array = array![];
    VesuContext { pool_id: POOL_ID, position_counterpart_token: context.token_address }
        .serialize(ref context_array);

    let borrow_amount = 110000000; // 110 USDC
    let borrow = Borrow {
        basic: create_basic_instruction(USDC_ERC20_ADDRESS(), borrow_amount, USER_ADDRESS()),
        context: Option::Some(context_array.span()),
    };

    modify_delegation(SINGLETON_ADDRESS(), USER_ADDRESS(), context.gateway_address, true);
    cheat_caller_address(context.gateway_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    let instructions = array![LendingInstruction::Borrow(borrow)];
    context.gateway_dispatcher.process_instructions(instructions.span());

    // Create another ETH deposit position since borrowing moved the collateral
    let eth_amount_2 = 3000000000000000000; // 3 ETH
    perform_deposit(ref context, eth_amount_2);

    // Create USDC deposit position
    let usdc_amount = 100000000; // 100 USDC
    let usdc_erc20 = IERC20Dispatcher { contract_address: USDC_ERC20_ADDRESS() };

    // Approve and deposit USDC
    cheat_caller_address(USDC_ERC20_ADDRESS(), USER_ADDRESS(), CheatSpan::TargetCalls(1));
    usdc_erc20.approve(context.gateway_address, usdc_amount);

    let usdc_deposit = Deposit {
        basic: create_basic_instruction(USDC_ERC20_ADDRESS(), usdc_amount, USER_ADDRESS()),
        context: Option::None,
    };

    cheat_caller_address(context.gateway_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    let instructions = array![LendingInstruction::Deposit(usdc_deposit)];
    context.gateway_dispatcher.process_instructions(instructions.span());

    // Get all positions
    let vesuViewerDispatcher = IVesuViewerDispatcher { contract_address: context.gateway_address };
    let positions = vesuViewerDispatcher.get_all_positions(USER_ADDRESS());

    // Verify positions
    let mut found_eth_deposit = false;
    let mut found_eth_usdc_borrow = false;
    let mut found_usdc_deposit = false;

    assert(positions.len() == 3, 'wrong number of positions');
    for i in 0..positions.len() {
        let (collateral, debt, position) = *positions.at(i);

        if collateral == context.token_address && debt == Zero::zero() {
            assert(position.collateral_shares > 0, 'ETH deposit position not found');
            found_eth_deposit = true;
        }

        if collateral == context.token_address && debt == USDC_ERC20_ADDRESS() {
            assert(position.collateral_shares > 0, 'ETH-USDCc nf');
            assert(position.nominal_debt > 0, 'ETH-USDCb nf');
            found_eth_usdc_borrow = true;
        }

        if collateral == USDC_ERC20_ADDRESS() && debt == Zero::zero() {
            assert(position.collateral_shares > 0, 'USDC deposit position not found');
            found_usdc_deposit = true;
        }
    }

    assert(found_eth_deposit, 'ETH deposit position missing');
    assert(found_eth_usdc_borrow, 'ETH-USDCb position missing');
    assert(found_usdc_deposit, 'USDC deposit position missing');
}

#[test]
#[ignore]
#[fork("MAINNET_LATEST")]
fn test_get_supported_assets_ui() {
    let context = setup_test_context();
    let vesuViewerDispatcher = IVesuViewerDispatcher { contract_address: context.gateway_address };
    let assets = vesuViewerDispatcher.get_supported_assets_ui();
    let crossCheckAssets = vesuViewerDispatcher.get_supported_assets_array();

    assert(crossCheckAssets.len() == 2, 'sumtin-wrong');
    assert(assets.len() == crossCheckAssets.len(), 'assets length mismatch');
    // Verify we got some assets back
    assert(assets.len() > 0, 'no assets returned');

    // Print the assets for debugging
    for i in 0..assets.len() {
        let asset = assets.at(i);
        println!("Asset {}: symbol={}, decimals={}", i, asset.symbol, asset.decimals);
    };
}

use kapan::interfaces::IGateway::{InterestRateViewDispatcher, InterestRateViewDispatcherTrait};

#[test]
#[fork("MAINNET_LATEST")]
fn test_get_borrow_rate() {
    let mut context = setup_test_context();
    let interestRateViewDispatcher = InterestRateViewDispatcher { contract_address: context.gateway_address };
    let borrow_rate = interestRateViewDispatcher.get_borrow_rate(context.token_address);
    println!("borrow rate: {}", borrow_rate);
    let supply_rate = interestRateViewDispatcher.get_supply_rate(context.token_address);
    println!("supply rate: {}", supply_rate);
}