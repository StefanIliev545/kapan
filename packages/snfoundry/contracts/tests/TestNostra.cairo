use core::traits::Drop;
use core::option::Option;
use kapan::gateways::NostraGateway::{
    INostraGatewayDispatcherTrait,
    INostraGatewayDispatcher,
};
use kapan::interfaces::IGateway::{
    ILendingInstructionProcessorDispatcher, 
    ILendingInstructionProcessorDispatcherTrait,
    LendingInstruction,
    Deposit,
    Withdraw,
    Borrow,
    Repay,
    BasicInstruction,
};
use starknet::{
    ContractAddress, 
    contract_address_const, 
    get_caller_address,
    class_hash::ClassHash
};
use snforge_std::{
    declare, 
    ContractClassTrait, 
    DeclareResultTrait,
    CheatSpan,
    cheat_caller_address,
};
use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};

// Nostra Finance tokens

// ETH
fn ETH_ADDRESS() -> ContractAddress {
    contract_address_const::<0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7>()
}
fn ETH_DEBT_TOKEN() -> ContractAddress {
    contract_address_const::<0x00ba3037d968790ac486f70acaa9a1cab10cf5843bb85c986624b4d0e5a82e74>()
}
fn ETH_COLLATERAL_TOKEN() -> ContractAddress {
    contract_address_const::<0x044debfe17e4d9a5a1e226dabaf286e72c9cc36abbe71c5b847e669da4503893>()
}
fn ETH_IBCOLLATERAL_TOKEN() -> ContractAddress {
    contract_address_const::<0x057146f6409deb4c9fa12866915dd952aa07c1eb2752e451d7f3b042086bdeb8>()
}

// USDC
fn USDC_ADDRESS() -> ContractAddress {
    contract_address_const::<0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8>()
}
fn USDC_DEBT_TOKEN() -> ContractAddress {
    contract_address_const::<0x063d69ae657bd2f40337c39bf35a870ac27ddf91e6623c2f52529db4c1619a51>()
}
fn USDC_COLLATERAL_TOKEN() -> ContractAddress {
    contract_address_const::<0x073f6addc9339de9822cab4dac8c9431779c09077f02ba7bc36904ea342dd9eb>()
}
fn USDC_IBCOLLATERAL_TOKEN() -> ContractAddress {
    contract_address_const::<0x073f6addc9339de9822cab4dac8c9431779c09077f02ba7bc36904ea342dd9eb>()
}

// WBTC
fn WBTC_ADDRESS() -> ContractAddress {
    contract_address_const::<0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac>()
}
fn WBTC_DEBT_TOKEN() -> ContractAddress {
    contract_address_const::<0x0491480f21299223b9ce770f23a2c383437f9fbf57abc2ac952e9af8cdb12c97>()
}
fn WBTC_COLLATERAL_TOKEN() -> ContractAddress {
    contract_address_const::<0x036b68238f3a90639d062669fdec08c4d0bdd09826b1b6d24ef49de6d8141eaa>()
}
fn WBTC_IBCOLLATERAL_TOKEN() -> ContractAddress {
    contract_address_const::<0x05b7d301fa769274f20e89222169c0fad4d846c366440afc160aafadd6f88f0c>()
}

fn RICH_ADDRESS() -> ContractAddress {
    contract_address_const::<0x0213c67ed78bc280887234fe5ed5e77272465317978ae86c25a71531d9332a2d>()
}

fn USER_ADDRESS() -> ContractAddress {
    contract_address_const::<0x0113c67ed78bc280887234fe5ed5e77272465317978ae86c25a71531d9332a2d>()
}

// Helper struct for test context
#[derive(Drop)]
struct TestContext {
    gateway_address: ContractAddress,
    gateway_dispatcher: ILendingInstructionProcessorDispatcher,
}

// Deploy NostraGateway
fn deploy_nostra_gateway() -> ContractAddress {
    let contract_class = declare("NostraGateway").unwrap().contract_class();
    let calldata = array![];
    let (contract_address, _) = contract_class.deploy(@calldata).unwrap();
    contract_address
}

// Add supported assets to NostraGateway
fn add_supported_assets(gateway_address: ContractAddress) {
    let mut nostra_gateway = INostraGatewayDispatcher{ contract_address: gateway_address };
    // Add ETH
    nostra_gateway.add_supported_asset(
        ETH_ADDRESS(),
        ETH_DEBT_TOKEN(),
        ETH_COLLATERAL_TOKEN(),
        ETH_IBCOLLATERAL_TOKEN()
    );
    
    // Add USDC
    nostra_gateway.add_supported_asset(
        USDC_ADDRESS(),
        USDC_DEBT_TOKEN(),
        USDC_COLLATERAL_TOKEN(),
        USDC_IBCOLLATERAL_TOKEN()
    );
    
    // Add WBTC
    nostra_gateway.add_supported_asset(
        WBTC_ADDRESS(),
        WBTC_DEBT_TOKEN(),
        WBTC_COLLATERAL_TOKEN(),
        WBTC_IBCOLLATERAL_TOKEN()
    );
}

fn prefund_address(recipient: ContractAddress, token_address: ContractAddress, amount: u256) {
    let token_erc20 = IERC20Dispatcher { contract_address: token_address };
    cheat_caller_address(token_address, RICH_ADDRESS(), CheatSpan::TargetCalls(1));
    token_erc20.transfer(recipient, amount);
    
    println!("Prefunded with token");
}

fn setup_test_context() -> TestContext {
    println!("Deploying NostraGateway");
    let gateway_address = deploy_nostra_gateway();
    
    println!("Adding supported assets");
    add_supported_assets(gateway_address);
    
    // Pre-fund the test user with ETH and USDC
    println!("Pre-funding user address");
    prefund_address(USER_ADDRESS(), ETH_ADDRESS(), 15000000000000000000); // 15 ETH
    
    let gateway_dispatcher = ILendingInstructionProcessorDispatcher {
        contract_address: gateway_address
    };
    
    TestContext {
        gateway_address,
        gateway_dispatcher,
    }
}

#[test]
#[ignore]
#[fork("MAINNET_LATEST")]
fn test_deploy_and_add_supported_assets() {
    // Setup test context
    let context = setup_test_context();
    
    // For now just check that the deployment succeeds
    // In the future, we can add more verification of the supported assets
} 

#[test]
#[ignore]
#[fork("MAINNET_LATEST")]
fn test_deposit() {
    let context = setup_test_context();
    let depositERC20 = ETH_ADDRESS();

    let deposit_amount = 5000000; // 500 USDC (we prefunded 1000 USDC)
    let erc20 = IERC20Dispatcher { contract_address: depositERC20 };
    
    // Check initial balance
    let initial_balance = erc20.balance_of(USER_ADDRESS());
    println!("Initial USDC balance: {}", initial_balance);
    assert(initial_balance >= deposit_amount, 'insufficient balance');
    
    // Approve the gateway to spend tokens
    cheat_caller_address(depositERC20, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    erc20.approve(context.gateway_address, deposit_amount);
    
    // Create deposit instruction
    let deposit = Deposit {
        basic: BasicInstruction {
            token: depositERC20,
            amount: deposit_amount, 
            user: USER_ADDRESS(),
        },
        context: Option::None,
    };
    
    // Process the deposit instruction
    cheat_caller_address(context.gateway_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    let instructions = array![LendingInstruction::Deposit(deposit)];
    context.gateway_dispatcher.process_instructions(instructions.span());
    
    // Verify balance decreased
    let final_balance = erc20.balance_of(USER_ADDRESS());
    println!("Final USDC balance: {}", final_balance);
    assert(final_balance < initial_balance, 'balance not decreased');
    assert(initial_balance - final_balance == deposit_amount, 'incorrect amount deducted');
}

use kapan::interfaces::nostra::{LentDebtTokenABIDispatcher, LentDebtTokenABIDispatcherTrait};

#[test]
#[ignore]
#[fork("MAINNET_LATEST")]
fn test_withdraw() {
    let context = setup_test_context();
    let depositERC20 = ETH_ADDRESS();

    let deposit_amount = 5000000; // 500 USDC (we prefunded 1000 USDC)
    let erc20 = IERC20Dispatcher { contract_address: depositERC20 };
    
    // Check initial balance
    let initial_balance = erc20.balance_of(USER_ADDRESS());
    println!("Initial USDC balance: {}", initial_balance);
    assert(initial_balance >= deposit_amount, 'insufficient balance');
    
    // Approve the gateway to spend tokens
    cheat_caller_address(depositERC20, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    erc20.approve(context.gateway_address, deposit_amount);
    
    // Create deposit instruction
    let deposit = Deposit {
        basic: BasicInstruction {
            token: depositERC20,
            amount: deposit_amount, 
            user: USER_ADDRESS(),
        },
        context: Option::None,
    };
    
    // Process the deposit instruction
    cheat_caller_address(context.gateway_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    let instructions = array![LendingInstruction::Deposit(deposit)];
    context.gateway_dispatcher.process_instructions(instructions.span());
    
    // Verify balance decreased
    let final_balance = erc20.balance_of(USER_ADDRESS());
    println!("Final USDC balance: {}", final_balance);
    assert(final_balance < initial_balance, 'balance not decreased');
    assert(initial_balance - final_balance == deposit_amount, 'incorrect amount deducted');

    let withdraw = Withdraw {
        basic: BasicInstruction {
            token: depositERC20,
            amount: deposit_amount,
            user: USER_ADDRESS(),
        },
        context: Option::None,
    };

    cheat_caller_address(ETH_IBCOLLATERAL_TOKEN(), USER_ADDRESS(), CheatSpan::TargetCalls(1));
    let ibcollateral = LentDebtTokenABIDispatcher { contract_address: ETH_IBCOLLATERAL_TOKEN() };
    ibcollateral.approve(context.gateway_address, deposit_amount);
    
    cheat_caller_address(context.gateway_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    let instructions = array![LendingInstruction::Withdraw(withdraw)];
    context.gateway_dispatcher.process_instructions(instructions.span());    
    let after_balance = erc20.balance_of(USER_ADDRESS());
    println!("After USDC balance: {}", after_balance);
    assert(after_balance > final_balance, 'balance not increased');
}


#[test]
#[ignore]
#[fork("MAINNET_LATEST")]
fn test_full_flow() {
    let context = setup_test_context();
    let depositERC20 = ETH_ADDRESS();

    let deposit_amount = 5000000000000000000; // 500 USDC (we prefunded 1000 USDC)
    let erc20 = IERC20Dispatcher { contract_address: depositERC20 };
    
    // Check initial balance
    let initial_balance = erc20.balance_of(USER_ADDRESS());
    println!("Initial USDC balance: {}", initial_balance);
    assert(initial_balance >= deposit_amount, 'insufficient balance');
    
    // Approve the gateway to spend tokens
    cheat_caller_address(depositERC20, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    erc20.approve(context.gateway_address, deposit_amount);
    
    // Create deposit instruction
    let deposit = Deposit {
        basic: BasicInstruction {
            token: depositERC20,
            amount: deposit_amount, 
            user: USER_ADDRESS(),
        },
        context: Option::None,
    };
    
    // Process the deposit instruction
    cheat_caller_address(context.gateway_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    let instructions = array![LendingInstruction::Deposit(deposit)];
    context.gateway_dispatcher.process_instructions(instructions.span());
    
    // Verify balance decreased
    let final_balance = erc20.balance_of(USER_ADDRESS());
    println!("Final ETH balance: {}", final_balance);
    assert(final_balance < initial_balance, 'balance not decreased');
    assert(initial_balance - final_balance == deposit_amount, 'incorrect amount deducted');

    let borrow = Borrow {
        basic: BasicInstruction {
            token: USDC_ADDRESS(),
            amount: 250000000,
            user: USER_ADDRESS(),
        },
        context: Option::None,
    };

    println!("approving delegation");
    let debt_token = LentDebtTokenABIDispatcher { contract_address: USDC_DEBT_TOKEN() };
    cheat_caller_address(USDC_DEBT_TOKEN(), USER_ADDRESS(), CheatSpan::TargetCalls(1));
    debt_token.approve_delegation(context.gateway_address, 250000000, USER_ADDRESS());
    
    println!("borrowing");
    cheat_caller_address(context.gateway_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    let instructions = array![LendingInstruction::Borrow(borrow)];
    context.gateway_dispatcher.process_instructions(instructions.span());
    let usdc_erc20 = IERC20Dispatcher { contract_address: USDC_ADDRESS() };
    let user_balance = usdc_erc20.balance_of(USER_ADDRESS());
    println!("User USDC balance: {}", user_balance);
    assert(user_balance > 0, 'user balance not increased');

    let repay = Repay {
        basic: BasicInstruction {
            token: USDC_ADDRESS(),
            amount: 50000000,
            user: USER_ADDRESS(),
        },
        context: Option::None,
    };

    println!("approving");
    cheat_caller_address(USDC_ADDRESS(), USER_ADDRESS(), CheatSpan::TargetCalls(1));
    usdc_erc20.approve(context.gateway_address, 50000000);

    println!("repaying");
    cheat_caller_address(context.gateway_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    let instructions = array![LendingInstruction::Repay(repay)];
    context.gateway_dispatcher.process_instructions(instructions.span());
    let new_usdc_balance = usdc_erc20.balance_of(USER_ADDRESS());
    println!("New USDC balance: {}", new_usdc_balance);
    assert(new_usdc_balance < user_balance, 'balance not decreased');

    //cur:  0_162_090_880
    //max:  5_000_000_000
    //test: 2_793_898_880
}