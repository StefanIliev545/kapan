use core::option::Option;
use kapan::gateways::RouterGateway::{
    ProtocolInstructions,
    RouterGatewayTraitDispatcher,
    RouterGatewayTraitDispatcherTrait,
};
use kapan::interfaces::IGateway::{
    LendingInstruction,
    Swap,
};
use ekubo::types::keys::PoolKey;
use starknet::{
    ContractAddress, 
    contract_address_const
};
use snforge_std::{
    declare, 
    ContractClassTrait, 
    DeclareResultTrait,
    CheatSpan,
    cheat_caller_address,
};
use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
use openzeppelin::utils::serde::SerializedAppend;

// Ekubo Core contract address provided by user
fn EKUBO_CORE_ADDRESS() -> ContractAddress {
    contract_address_const::<0x00000005dd3D2F4429AF886cD1a3b08289DBcEa99A294197E9eB43b0e0325b4b>()
}

// Token addresses - same as TestRouter for consistency
fn ETH_ADDRESS() -> ContractAddress {
    contract_address_const::<0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7>()
}

fn USDC_ADDRESS() -> ContractAddress {
    contract_address_const::<0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8>()
}

fn STRK_ADDRESS() -> ContractAddress {
    contract_address_const::<0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d>()
}

// Rich addresses for funding
fn RICH_ADDRESS() -> ContractAddress {
    contract_address_const::<0x0213c67ed78bc280887234fe5ed5e77272465317978ae86c25a71531d9332a2d>()
}

fn USDC_RICH_ADDRESS() -> ContractAddress {
    contract_address_const::<0x0123b911db94d6dbeeed051ff3605ba463dfafa78ae10c0e56989f3eda8255cf>()
}

fn USER_ADDRESS() -> ContractAddress {
    contract_address_const::<0x0113c67ed78bc280887234fe5ed5e77272465317978ae86c25a71531d9332a2d>()
}

// Helper struct for test context
#[derive(Drop)]
struct EkuboTestContext {
    router_address: ContractAddress,
    ekubo_gateway_address: ContractAddress,
    router_dispatcher: RouterGatewayTraitDispatcher,
}

// Deploy RouterGateway - similar to TestRouter
fn deploy_router_gateway() -> ContractAddress {
    let contract_class = declare("RouterGateway").unwrap().contract_class();
    let mut calldata = array![];
    calldata.append_serde(USER_ADDRESS());
    calldata.append_serde(contract_address_const::<0x000d8d6dfec4d33bfb6895de9f3852143a17c6f92fd2a21da3d6924d34870160>());
    let (contract_address, _) = contract_class.deploy(@calldata).unwrap();
    contract_address
}

// Deploy EkuboGateway
fn deploy_ekubo_gateway() -> ContractAddress {
    let contract_class = declare("EkuboGateway").unwrap().contract_class();
    let mut calldata = array![];
    calldata.append_serde(EKUBO_CORE_ADDRESS());
    let (contract_address, _) = contract_class.deploy(@calldata).unwrap();
    contract_address
}

// Prefund addresses with tokens
fn prefund_address(recipient: ContractAddress, rich_address: ContractAddress, token_address: ContractAddress, amount: u256) {
    let token_erc20 = IERC20Dispatcher { contract_address: token_address };
    cheat_caller_address(token_address, rich_address, CheatSpan::TargetCalls(1));
    token_erc20.transfer(recipient, amount);
    println!("Prefunded {:?} with {:?} of token {:?}", recipient, amount, token_address);
}

// Setup test context
fn setup_ekubo_test_context() -> EkuboTestContext {
    println!("Deploying RouterGateway");
    let router_address = deploy_router_gateway();

    println!("Deploying EkuboGateway");
    let ekubo_gateway_address = deploy_ekubo_gateway();
    
    // Pre-fund the test user with tokens
    println!("Pre-funding user address");
    prefund_address(USER_ADDRESS(), RICH_ADDRESS(), ETH_ADDRESS(), 15000000000000000000); // 15 ETH
    prefund_address(USER_ADDRESS(), USDC_RICH_ADDRESS(), USDC_ADDRESS(), 1000000000); // 1000 USDC
    prefund_address(USER_ADDRESS(), RICH_ADDRESS(), STRK_ADDRESS(), 10000000000000000000000); // 10000 STRK
    
    let router_dispatcher = RouterGatewayTraitDispatcher {
        contract_address: router_address
    };
    
    EkuboTestContext {
        router_address,
        ekubo_gateway_address,
        router_dispatcher,
    }
}

#[test]
#[fork("MAINNET_LATEST")]
fn test_ekubo_gateway_deployment() {
    println!("Setting up Ekubo test context");
    let context = setup_ekubo_test_context();
    
    // Register Ekubo gateway with router
    cheat_caller_address(context.router_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    let router = RouterGatewayTraitDispatcher { contract_address: context.router_address };
    println!("Adding EkuboGateway to router");
    router.add_gateway('ekubo', context.ekubo_gateway_address);
    
    // Verify deployment by checking addresses
    println!("Router Gateway deployed at: {:?}", context.router_address);
    println!("Ekubo Gateway deployed at: {:?}", context.ekubo_gateway_address);
    println!("Ekubo Core address: {:?}", EKUBO_CORE_ADDRESS());
    
    // Check that user has been funded
    let eth_erc20 = IERC20Dispatcher { contract_address: ETH_ADDRESS() };
    let usdc_erc20 = IERC20Dispatcher { contract_address: USDC_ADDRESS() };
    let strk_erc20 = IERC20Dispatcher { contract_address: STRK_ADDRESS() };
    
    let eth_balance = eth_erc20.balance_of(USER_ADDRESS());
    let usdc_balance = usdc_erc20.balance_of(USER_ADDRESS());
    let strk_balance = strk_erc20.balance_of(USER_ADDRESS());
    
    println!("User ETH balance: {:?}", eth_balance);
    println!("User USDC balance: {:?}", usdc_balance);
    println!("User STRK balance: {:?}", strk_balance);
    
    // Verify balances are correct
    assert(eth_balance == 15000000000000000000, 'ETH balance incorrect');
    assert(usdc_balance == 1000000000, 'USDC balance incorrect');
    assert(strk_balance == 10000000000000000000000, 'STRK balance incorrect');
    
    println!("EkuboGateway deployment test completed successfully!");
}

#[test]
#[fork("MAINNET_LATEST")]
fn test_ekubo_swap_eth_usdc() {
    println!("Setting up Ekubo test context for ETH/USDC swap");
    let context = setup_ekubo_test_context();
    
    // Register Ekubo gateway with router
    cheat_caller_address(context.router_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    let router = RouterGatewayTraitDispatcher { contract_address: context.router_address };
    router.add_gateway('ekubo', context.ekubo_gateway_address);
    
    // ETH (ERC20 on Starknet)
    let eth: ContractAddress = contract_address_const::<0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7>();
    
    // USDC (ERC20 on Starknet) - Updated address
    let usdc: ContractAddress = contract_address_const::<0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8>();
    
    // Canonical order: token0 = lower address, token1 = higher address
    // Here USDC < ETH, so:
    let pool_key = PoolKey {
        token0: usdc,
        token1: eth,
        // 0.05% fee encoded in 0.128 fixed-point (u128)
        fee: 170141183460469235273462165868118016,
        // Tick spacing used by the popular ETH/USDC pool
        tick_spacing: 1000,
        // No extension
        extension: starknet::contract_address_const::<0>(),
    };
    
    println!("Pool Key: token0={:?}, token1={:?}, fee={:?}, tick_spacing={:?}", 
             pool_key.token0, pool_key.token1, pool_key.fee, pool_key.tick_spacing);
    
    // Serialize pool parameters for context
    let mut pool_context = array![];
    pool_context.append_serde(pool_key.fee);
    pool_context.append_serde(pool_key.tick_spacing);
    pool_context.append_serde(pool_key.extension);
    
    // Create swap instruction: Swap ETH for USDC
    let swap = Swap {
        token_in: eth,
        token_out: usdc,
        exact_out: 2000000000, // 2000 USDC (example amount)
        max_in: 2000000000000000000, // 2 ETH max (100% slippage tolerance)
        slippage_bps: 10000, // 100% slippage tolerance (10000 basis points)
        recipient: USER_ADDRESS(),
        context: Option::Some(pool_context.span()),
    };
    
    // Approve tokens before swap
    let eth_erc20 = IERC20Dispatcher { contract_address: eth };
    cheat_caller_address(eth, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    eth_erc20.approve(context.router_address, 2000000000000000000); // 2 ETH max
    
    let mut protocol_instructions = array![];
    protocol_instructions.append(ProtocolInstructions {
        protocol_name: 'ekubo',
        instructions: array![LendingInstruction::Swap(swap)].span(),
    });
    
    println!("Executing ETH to USDC swap via Ekubo gateway");
    
    // Execute the swap
    cheat_caller_address(context.router_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    context.router_dispatcher.process_protocol_instructions(protocol_instructions.span());
    
    println!("ETH to USDC swap completed successfully!");
    
    // Check balances
    let eth_balance_after = eth_erc20.balance_of(USER_ADDRESS());
    let usdc_erc20 = IERC20Dispatcher { contract_address: usdc };
    let usdc_balance_after = usdc_erc20.balance_of(USER_ADDRESS());
    
    println!("ETH balance after swap: {:?}", eth_balance_after);
    println!("USDC balance after swap: {:?}", usdc_balance_after);
}
