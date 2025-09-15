use core::option::Option;
use kapan::gateways::RouterGateway::{
    ProtocolInstructions,
    RouterGatewayTraitDispatcher,
    RouterGatewayTraitDispatcherTrait,
};
use kapan::interfaces::IGateway::{
    LendingInstruction,
    Swap,
    SwapExactIn,
};
use kapan::gateways::avnu_gateway::{Route, AvnuContext};
use starknet::{
    ContractAddress, 
    contract_address_const
};
use starknet::syscalls::call_contract_syscall;
use snforge_std::{
    declare, 
    ContractClassTrait, 
    DeclareResultTrait,
    CheatSpan,
    cheat_caller_address,
    start_cheat_caller_address,
    stop_cheat_caller_address,
};
use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
use openzeppelin::utils::serde::SerializedAppend;

// Avnu Router mainnet address: 0x04270219d365d6b017231b52e92b3fb5d7c8378b05e9abc97724537a80e93b0f
fn AVNU_ROUTER_ADDRESS() -> ContractAddress {
    contract_address_const::<0x04270219d365d6b017231b52e92b3fb5d7c8378b05e9abc97724537a80e93b0f>()
}

// Token addresses - same as TestEkuboGateway for consistency
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

struct TestContext {
    router_address: ContractAddress,
    avnu_gateway_address: ContractAddress,
    router_dispatcher: RouterGatewayTraitDispatcher,
}

fn deploy_router_gateway() -> ContractAddress {
    let contract_class = declare("RouterGateway").unwrap().contract_class();
    let mut calldata = array![];
    calldata.append_serde(USER_ADDRESS());
    calldata.append_serde(contract_address_const::<0x000d8d6dfec4d33bfb6895de9f3852143a17c6f92fd2a21da3d6924d34870160>());
    let (contract_address, _) = contract_class.deploy(@calldata).unwrap();
    contract_address
}

fn deploy_avnu_gateway() -> ContractAddress {
    let contract_class = declare("AvnuGateway").unwrap().contract_class();
    let mut calldata = array![];
    calldata.append_serde(AVNU_ROUTER_ADDRESS()); // Mainnet Avnu router address
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

fn setup_avnu_test_context() -> TestContext {
    println!("Deploying RouterGateway");
    let router_address = deploy_router_gateway();

    println!("Deploying AvnuGateway");
    let avnu_gateway_address = deploy_avnu_gateway();
    
    // Pre-fund the test user with tokens
    println!("Pre-funding user address");
    prefund_address(USER_ADDRESS(), RICH_ADDRESS(), ETH_ADDRESS(), 15000000000000000000); // 15 ETH
    prefund_address(USER_ADDRESS(), USDC_RICH_ADDRESS(), USDC_ADDRESS(), 1000000000); // 1000 USDC
    prefund_address(USER_ADDRESS(), RICH_ADDRESS(), STRK_ADDRESS(), 10000000000000000000000); // 10000 STRK
    
    let router_dispatcher = RouterGatewayTraitDispatcher {
        contract_address: router_address
    };
    
    TestContext {
        router_address,
        avnu_gateway_address,
        router_dispatcher,
    }
}

#[test]
#[fork("MAINNET_LATEST")]
fn test_avnu_gateway_deployment() {
    println!("Testing AvnuGateway deployment");
    let context = setup_avnu_test_context();
    
    // Verify deployment
    assert(context.router_address != contract_address_const::<0>(), 'Router not deployed');
    assert(context.avnu_gateway_address != contract_address_const::<0>(), 'AvnuGateway not deployed');
    
    // Check token balances
    let eth_erc20 = IERC20Dispatcher { contract_address: ETH_ADDRESS() };
    let usdc_erc20 = IERC20Dispatcher { contract_address: USDC_ADDRESS() };
    let strk_erc20 = IERC20Dispatcher { contract_address: STRK_ADDRESS() };
    
    let eth_balance = eth_erc20.balance_of(USER_ADDRESS());
    let usdc_balance = usdc_erc20.balance_of(USER_ADDRESS());
    let strk_balance = strk_erc20.balance_of(USER_ADDRESS());
    
    println!("ETH balance: {:?}", eth_balance);
    println!("USDC balance: {:?}", usdc_balance);
    println!("STRK balance: {:?}", strk_balance);
    
    assert(eth_balance > 0, 'ETH balance should be > 0');
    assert(usdc_balance > 0, 'USDC balance should be > 0');
    assert(strk_balance > 0, 'STRK balance should be > 0');
    
    println!("AvnuGateway deployment test completed successfully!");
}

#[test]
#[fork("MAINNET_LATEST")]
fn test_avnu_swap_exact_out() {
    let context = setup_avnu_test_context();
    
    // Register Avnu gateway with router
    cheat_caller_address(context.router_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    let router = RouterGatewayTraitDispatcher { contract_address: context.router_address };
    router.add_gateway('avnu', context.avnu_gateway_address);
    
    // ETH (ERC20 on Starknet)
    let eth: ContractAddress = ETH_ADDRESS();
    
    // USDC (ERC20 on Starknet)
    let usdc: ContractAddress = USDC_ADDRESS();
    
    // Create Avnu context with routes from the ETH→USDC quote
    // Note: Routes are recursive/branching in JSON but we just pick one path (Ekubo)
    let mut routes = array![];
    // Ekubo route (97% of the swap) - from original ETH→USDC quote
    let mut ekubo_params: Array<felt252> = array![];
    ekubo_params.append(eth.into()); // token0
    ekubo_params.append(usdc.into()); // token1  
    ekubo_params.append(170141183460469235273462165868118016); // fee (0.05% in fixed-point)
    ekubo_params.append(1000); // tick_spacing
    ekubo_params.append(starknet::contract_address_const::<0>().into()); // extension
    // Allow full-range price movement to avoid artificial reverts in tests
    ekubo_params.append(6277100250585753475930931601400621808602321654880405518632); // sqrt_ratio_distance (MAX)
    
    routes.append(Route {
        exchange_address: contract_address_const::<0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b>(), // Ekubo Core
        sell_token: eth,
        buy_token: usdc,
        percent: 1000000000000, // We use 12 decimals precision, 100%
        additional_swap_params: ekubo_params,
    });
    
    let avnu_context = AvnuContext {
        routes,
        integrator_fee_amount_bps: 0, // No integrator fees
        integrator_fee_recipient: USER_ADDRESS(),
    };
    
    // Serialize Avnu context
    let mut context_data = array![];
    avnu_context.serialize(ref context_data);
    println!("DEBUG: Serialized context data length: {:?}", context_data.len());
    
    // Create swap instruction: Swap ETH for USDC (exact out) - using real quote amounts
    let swap = Swap {
        token_in: eth,
        token_out: usdc,
        exact_out: 100000000, // 100 USDC (exact amount we want from quote)
        max_in: 1000000000000000000, // 1 ETH max (from quote sellAmount)
        user: USER_ADDRESS(),
        should_pay_out: true,
        should_pay_in: true,
        context: Option::Some(context_data.span()),
    };
    
    // Approve tokens before swap
    let eth_erc20 = IERC20Dispatcher { contract_address: eth };
    // Record balances before swap
    let eth_balance_before = eth_erc20.balance_of(USER_ADDRESS());
    let usdc_erc20 = IERC20Dispatcher { contract_address: usdc };
    let usdc_balance_before = usdc_erc20.balance_of(USER_ADDRESS());
    println!("ETH balance before swap: {:?}", eth_balance_before);
    println!("USDC balance before swap: {:?}", usdc_balance_before);
    
    cheat_caller_address(eth, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    eth_erc20.approve(context.router_address, 1000000000000000000); // 1 ETH max
    
    let mut protocol_instructions = array![];
    protocol_instructions.append(ProtocolInstructions {
        protocol_name: 'avnu',
        instructions: array![LendingInstruction::Swap(swap)].span(),
    });
    
    println!("Getting authorizations for swap instructions");
    let authorizations = context.router_dispatcher.get_authorizations_for_instructions(protocol_instructions.span(), true);
    println!("Authorizations: {:?}", authorizations);
    
    // Execute authorizations
    for authorization in authorizations {
        let (token, selector, call_data) = authorization;
        cheat_caller_address(*token, USER_ADDRESS(), CheatSpan::TargetCalls(1));
        println!("Calling {:?} {:?} with {:?}", token, selector, call_data);
        let result = call_contract_syscall(*token, *selector, call_data.span());
        assert(result.is_ok(), 'call failed');
    };
    
    println!("Executing ETH to USDC swap via Avnu gateway");
    
    // Execute the swap
    cheat_caller_address(context.router_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    let _ = context.router_dispatcher.process_protocol_instructions(protocol_instructions.span());
    
    println!("ETH to USDC swap completed successfully!");
    
    // Check balances
    let eth_balance_after = eth_erc20.balance_of(USER_ADDRESS());
    let usdc_balance_after = usdc_erc20.balance_of(USER_ADDRESS());
    
    println!("ETH balance after swap: {:?}", eth_balance_after);
    println!("USDC balance after swap: {:?}", usdc_balance_after);
    
    // Ensure balances moved in the correct direction
    assert(eth_balance_after < eth_balance_before, 'ETH balance should decrease');
    let eth_spent = eth_balance_before - eth_balance_after;
    assert(eth_spent > 0, 'ETH spent must be > 0');
    assert(eth_spent <= 1000000000000000000, 'ETH spent exceeds max_in');
    
    // For exact out, we should get exactly the amount we requested
    let usdc_gained = usdc_balance_after - usdc_balance_before;
    assert(usdc_gained == 100000000, 'usdc-balance-exact-out');
    
    // Human-readable summary
    let scale_eth = 1000000000000000000;
    let scale_usdc = 1000000;
    let eth_int = eth_spent / scale_eth;
    let eth_frac = eth_spent % scale_eth;
    let usdc_int = usdc_gained / scale_usdc;
    let usdc_frac = usdc_gained % scale_usdc;
    println!("Swap: ETH {:?}.{:?} -> USDC {:?}.{:?}", eth_int, eth_frac, usdc_int, usdc_frac);
}

#[test]
#[ignore]
#[fork("MAINNET_LATEST")]
fn test_avnu_swap_exact_in() {
    let context = setup_avnu_test_context();

    cheat_caller_address(context.router_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    let router = RouterGatewayTraitDispatcher { contract_address: context.router_address };
    router.add_gateway('avnu', context.avnu_gateway_address);

    let eth: ContractAddress = ETH_ADDRESS();
    let usdc: ContractAddress = USDC_ADDRESS();

    // Create Avnu context with routes from the ETH→USDC quote for exact in test
    let mut routes = array![];
    
    // Ekubo route (97% of the swap) - from original ETH→USDC quote
    let mut ekubo_params: Array<felt252> = array![];
    ekubo_params.append(eth.into()); // token0
    ekubo_params.append(usdc.into()); // token1  
    ekubo_params.append(170141183460469235273462165868118016); // fee (0.05% in fixed-point)
    ekubo_params.append(1000); // tick_spacing
    ekubo_params.append(starknet::contract_address_const::<0>().into()); // extension
    // Allow full-range price movement to avoid artificial reverts in tests
    ekubo_params.append(6277100250585753475930931601400621808602321654880405518632); // sqrt_ratio_distance (MAX)
    
    routes.append(Route {
        exchange_address: contract_address_const::<0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b>(), // Ekubo Core
        sell_token: eth,
        buy_token: usdc,
        percent: 9700, // 97% (9700 basis points)
        additional_swap_params: ekubo_params,
    });
    
    // StarkDefi route (3% of the swap) - from original ETH→USDC quote
    routes.append(Route {
        sell_token: eth,
        buy_token: usdc,
        exchange_address: contract_address_const::<0x7eee624919fae668387d0d34d86d67795e5c919bc994841581144977ef21c32>(), // StarkDefi
        percent: 300, // 3% (300 basis points)
        additional_swap_params: array![], // StarkDefi doesn't need pool params
    });
    
    let avnu_context = AvnuContext {
        routes,
        integrator_fee_amount_bps: 0, // No integrator fees
        integrator_fee_recipient: USER_ADDRESS(),
    };
    
    // Serialize Avnu context
    let mut context_data = array![];
    avnu_context.serialize(ref context_data);
    println!("DEBUG: Serialized context data length: {:?}", context_data.len());
    
    let swap = SwapExactIn {
        token_in: eth,
        token_out: usdc,
        exact_in: 1000000000000000000, // 1 ETH (from quote)
        min_out: 100000000, // 100 USDC minimum (from quote)
        user: USER_ADDRESS(),
        should_pay_out: true,
        should_pay_in: true,
        context: Option::Some(context_data.span()),
    };

    let eth_erc20 = IERC20Dispatcher { contract_address: eth };
    let usdc_erc20 = IERC20Dispatcher { contract_address: usdc };
    let eth_balance_before = eth_erc20.balance_of(USER_ADDRESS());
    let usdc_balance_before = usdc_erc20.balance_of(USER_ADDRESS());
    
    println!("ETH balance before swap: {:?}", eth_balance_before);
    println!("USDC balance before swap: {:?}", usdc_balance_before);
    
    cheat_caller_address(eth, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    eth_erc20.approve(context.router_address, 1000000000000000000);

    let mut protocol_instructions = array![];
    protocol_instructions.append(ProtocolInstructions {
        protocol_name: 'avnu',
        instructions: array![LendingInstruction::SwapExactIn(swap)].span(),
    });

    let authorizations = context.router_dispatcher.get_authorizations_for_instructions(protocol_instructions.span(), true);
    for authorization in authorizations {
        let (token, selector, call_data) = authorization;
        cheat_caller_address(*token, USER_ADDRESS(), CheatSpan::TargetCalls(1));
        let _ = call_contract_syscall(*token, *selector, call_data.span());
    }

    cheat_caller_address(context.router_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    let _ = context.router_dispatcher.process_protocol_instructions(protocol_instructions.span());

    let eth_balance_after = eth_erc20.balance_of(USER_ADDRESS());
    let usdc_balance_after = usdc_erc20.balance_of(USER_ADDRESS());
    
    println!("ETH balance after swap: {:?}", eth_balance_after);
    println!("USDC balance after swap: {:?}", usdc_balance_after);

    let eth_spent = eth_balance_before - eth_balance_after;
    assert(eth_spent <= 1000000000000000000, 'ETH spent exceeds exact_in');
    let usdc_gained = usdc_balance_after - usdc_balance_before;
    assert(usdc_gained >= 100000000, 'USDC output below min');
    
    // Human-readable summary
    let scale_eth = 1000000000000000000;
    let scale_usdc = 1000000;
    let eth_int = eth_spent / scale_eth;
    let eth_frac = eth_spent % scale_eth;
    let usdc_int = usdc_gained / scale_usdc;
    let usdc_frac = usdc_gained % scale_usdc;
    println!("Swap: ETH {:?}.{:?} -> USDC {:?}.{:?}", eth_int, eth_frac, usdc_int, usdc_frac);
}
