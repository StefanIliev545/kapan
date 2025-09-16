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
    OutputPointer,
    Deposit,
    Borrow,
    Reborrow,
    Repay,
    Withdraw,
    Reswap,
    ReswapExactIn,
    Redeposit,
    BasicInstruction,
};
use kapan::gateways::avnu_gateway::{Route, SwapExactTokenToCalldata, MultiRouteSwapCalldata};
use kapan::gateways::vesu_gateway::{IVesuViewerDispatcher, IVesuViewerDispatcherTrait};
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
};
use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
use openzeppelin::utils::serde::SerializedAppend;
use core::num::traits::Zero;

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
    calldata.append_serde(AVNU_ROUTER_ADDRESS()); // router
    calldata.append_serde(USER_ADDRESS()); // owner
    calldata.append_serde(contract_address_const::<0>()); // fee_recipient (none)
    calldata.append_serde(0); // fee_bps
    let (contract_address, _) = contract_class.deploy(@calldata).unwrap();
    contract_address
}

// Deploy VesuGateway - same as in Ekubo tests
fn deploy_vesu_gateway(router: ContractAddress) -> ContractAddress {
    let contract_class = declare("VesuGateway").unwrap().contract_class();
    let mut calldata = array![];
    calldata.append_serde(contract_address_const::<0x000d8d6dfec4d33bfb6895de9f3852143a17c6f92fd2a21da3d6924d34870160>()); // SINGLETON_ADDRESS
    calldata.append_serde(2198503327643286920898110335698706244522220458610657370981979460625005526824);
    calldata.append_serde(router);
    calldata.append_serde(USER_ADDRESS());
    let mut supported_assets = array![];
    supported_assets.append(ETH_ADDRESS());
    supported_assets.append(USDC_ADDRESS());
    supported_assets.append(STRK_ADDRESS());
    calldata.append_serde(supported_assets);
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
    let router_address = deploy_router_gateway();

    let avnu_gateway_address = deploy_avnu_gateway();
    
    // Pre-fund the test user with tokens
    prefund_address(USER_ADDRESS(), RICH_ADDRESS(), ETH_ADDRESS(), 15000000000000000000); // 15 ETH
    prefund_address(USER_ADDRESS(), USDC_RICH_ADDRESS(), USDC_ADDRESS(), 1000000000); // 1000 USDC
    prefund_address(USER_ADDRESS(), RICH_ADDRESS(), STRK_ADDRESS(), 10000000000000000000000000); // 10000000000 STRK
    
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
#[ignore]
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
#[ignore]
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
    
    // Pass raw Avnu router swap_exact_token_to calldata as context (felts array)
    let mut context_data: Array<felt252> = array![
        // sell_token_address (ETH)
        0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7,
        // sell_token_amount (u256: low, high)
        0x4e92b5b26eecd4, 0x0,
        // sell_token_max_amount (u256: low, high)
        0x4ef7488686850d, 0x0,
        // buy_token_address (USDC)
        0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8,
        // buy_token_amount (u256: low, high)
        0x5f5e100, 0x0,
        // beneficiary (ignored in gateway, Avnu sets to gateway)
        0x052d8e9778d026588a51595e30b0f45609b4f771eecf0e335cdefed1d84a9d89,
        // integrator_fee_amount_bps
        0x0,
        // integrator_fee_recipient
        0x0,
        // routes len = 1
        0x1,
        // Route 0
        // sell_token
        0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7,
        // buy_token
        0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8,
        // exchange_address (Ekubo Core)
        0x05dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b,
        // percent
        0x0e8d4a51000,
        // additional_swap_params len = 6
        0x6,
        // token0
        0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7,
        // token1
        0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8,
        // fee (Q64.64)
        0x20c49ba5e353f80000000000000000,
        // tick_spacing
        0x3e8,
        // extension
        0x0,
        // sqrt_ratio_distance
        0x2df7c3f5bccaf6000000000000,
    ];
    
    // Create swap instruction: Swap ETH for USDC (exact out) - using real quote amounts
    let swap = Swap {
        token_in: eth,
        token_out: usdc,
        exact_out: 100000000, // 0x5f5e100
        max_in: 1000000000000000000, // 1 ETH max
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
    let scale_eth = 10000000000000000000;
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

    // Pass raw Avnu router multi_route_swap calldata as context (felts array)
    let mut context_data: Array<felt252> = array![
        // sell_token_address (ETH)
        0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7,
        // sell_token_amount (u256: low, high)
        0x2386f26fc10000, 0x0,
        // buy_token_address (USDC)
        0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8,
        // buy_token_amount (u256: low, high)
        0x2b133f1, 0x0,
        // buy_token_min_amount (u256: low, high)
        0x2adc1c2, 0x0,
        // beneficiary
        0x052d8e9778d026588a51595e30b0f45609b4f771eecf0e335cdefed1d84a9d89,
        // integrator_fee_amount_bps
        0x0,
        // integrator_fee_recipient
        0x0,
        // routes len = 1
        0x1,
        // Route 0
        // sell_token
        0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7,
        // buy_token
        0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8,
        // exchange_address (Ekubo Core)
        0x05dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b,
        // percent
        0x0e8d4a51000,
        // additional_swap_params len = 6
        0x6,
        // token0
        0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7,
        // token1
        0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8,
        // fee (Q64.64)
        0x20c49ba5e353f80000000000000000,
        // tick_spacing
        0x3e8,
        // extension
        0x0,
        // sqrt_ratio_distance
        0x2df7c3f5bccaf6000000000000,
    ];
    
    let swap = SwapExactIn {
        token_in: eth,
        token_out: usdc,
        exact_in: 10000000000000000, // 0x2386f26fc10000 (0.01 ETH)
        min_out: 45000002, // 0x2adc1c2 (~45.000002 USDC)
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
    eth_erc20.approve(context.router_address, 10000000000000000);

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
    assert(usdc_gained >= 45000002, 'USDC output below min');
    
    // Human-readable summary
    let scale_eth = 10000000000000000000;
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
fn test_avnu_create_position_and_move_debt_with_reswap() {
    println!("Setting up test context with Router and Vesu");
    let context = setup_avnu_test_context();

    // Register both gateways with router
    cheat_caller_address(context.router_address, USER_ADDRESS(), CheatSpan::TargetCalls(2));
    let router = RouterGatewayTraitDispatcher { contract_address: context.router_address };
    router.add_gateway('avnu', context.avnu_gateway_address);
    let vesu_gateway_address = deploy_vesu_gateway(context.router_address);
    router.add_gateway('vesu', vesu_gateway_address);

    // Check initial balances
    let eth_erc20 = IERC20Dispatcher { contract_address: ETH_ADDRESS() };
    let usdc_erc20 = IERC20Dispatcher { contract_address: USDC_ADDRESS() };

    let eth_balance_before = eth_erc20.balance_of(USER_ADDRESS());
    let usdc_balance_before = usdc_erc20.balance_of(USER_ADDRESS());

    println!("Initial ETH balance: {:?}", eth_balance_before);
    println!("Initial USDC balance: {:?}", usdc_balance_before);

    // Create instructions for ETH collateral deposit and USDC debt
    let mut protocol_instructions = array![];

    // First, deposit ETH as collateral in Vesu
    use kapan::gateways::vesu_gateway::VesuContext;
    let mut vesu_eth_context = array![];
    VesuContext { pool_id: 0, position_counterpart_token: ETH_ADDRESS() }.serialize(ref vesu_eth_context);

    let mut vesu_usdc_context = array![];
    VesuContext { pool_id: 0, position_counterpart_token: USDC_ADDRESS() }.serialize(ref vesu_usdc_context);

    let eth_deposit = LendingInstruction::Deposit(Deposit {
        basic: BasicInstruction {
            token: ETH_ADDRESS(),
            amount: 1000000000000000000, // 1 ETH
            user: USER_ADDRESS(),
        },
        context: Option::None,
    });

    // Then borrow USDC against ETH collateral
    let usdc_borrow = LendingInstruction::Borrow(Borrow {
        basic: BasicInstruction {
            token: USDC_ADDRESS(),
            amount: 200000000, // 200 USDC
            user: USER_ADDRESS(),
        },
        context: Option::Some(vesu_eth_context.span()),
    });

    protocol_instructions.append(ProtocolInstructions {
        protocol_name: 'vesu',
        instructions: array![eth_deposit, usdc_borrow].span(),
    });

    println!("Getting authorizations for instructions");
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

    println!("Executing ETH collateral deposit and USDC debt creation");

    // Execute the instructions
    cheat_caller_address(context.router_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    let _ = context.router_dispatcher.process_protocol_instructions(protocol_instructions.span());

    println!("ETH collateral/USDC debt position created successfully!");

    // Build Avnu calldata struct for ETH->USDC swap used in reswap (exact out flow)
    let mut routes = array![];
    let mut ekubo_params: Array<felt252> = array![];
    ekubo_params.append(ETH_ADDRESS().into());
    ekubo_params.append(USDC_ADDRESS().into());
    ekubo_params.append(170141183460469235273462165868118016); // 0.05%
    ekubo_params.append(1000); // tick spacing
    ekubo_params.append(starknet::contract_address_const::<0>().into()); // extension
    ekubo_params.append(6277100250585753475930931601400621808602321654880405518632); // sqrt_ratio_distance
    routes.append(Route {
        exchange_address: contract_address_const::<0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b>(),
        sell_token: ETH_ADDRESS(),
        buy_token: USDC_ADDRESS(),
        percent: 1000000000000,
        additional_swap_params: ekubo_params,
    });
    let swap_ctx = SwapExactTokenToCalldata {
        sell_token_address: ETH_ADDRESS(),
        sell_token_amount: 22058144364613168, // from previous context.amount
        sell_token_max_amount: 1000000000000000000,
        buy_token_address: USDC_ADDRESS(),
        buy_token_amount: 0, // actual exact_out taken from instruction
        beneficiary: USER_ADDRESS(),
        integrator_fee_amount_bps: 0,
        integrator_fee_recipient: USER_ADDRESS(),
        routes,
    };
    let mut avnu_ctx_data = array![];
    swap_ctx.serialize(ref avnu_ctx_data);

    // Now perform move_debt operation
    println!("\n=== Starting Move Debt Operation (Avnu) ===");

    let eth_balance_before_move = eth_erc20.balance_of(USER_ADDRESS());
    let usdc_balance_before_move = usdc_erc20.balance_of(USER_ADDRESS());

    // Create move_debt instructions: repay all USDC, withdraw all ETH, then reswap ETH->USDC to repay flashloan
    let mut move_debt_instructions = array![];

    let usdc_repay = LendingInstruction::Repay(Repay {
        basic: BasicInstruction { token: USDC_ADDRESS(), amount: 200000000, user: USER_ADDRESS() },
        repay_all: true,
        context: Option::Some(vesu_eth_context.span()),
    });
    let eth_withdraw = LendingInstruction::Withdraw(Withdraw {
        basic: BasicInstruction { token: ETH_ADDRESS(), amount: 1000000000000000000, user: USER_ADDRESS() },
        withdraw_all: true,
        context: Option::Some(vesu_usdc_context.span()),
    });

    let reswap_instruction = LendingInstruction::Reswap(Reswap {
        exact_out: OutputPointer { instruction_index: 0, output_index: 0 },
        max_in: OutputPointer { instruction_index: 1, output_index: 0 },
        user: USER_ADDRESS(),
        should_pay_out: false, // repay flash loan internally
        should_pay_in: true,
        context: Option::Some(avnu_ctx_data.span()),
    });

    move_debt_instructions.append(ProtocolInstructions { protocol_name: 'vesu', instructions: array![usdc_repay, eth_withdraw].span() });
    move_debt_instructions.append(ProtocolInstructions { protocol_name: 'avnu', instructions: array![reswap_instruction].span() });

    println!("Getting authorizations for move_debt instructions");
    let move_debt_authorizations = context.router_dispatcher.get_authorizations_for_instructions(move_debt_instructions.span(), true);
    println!("Move debt authorizations: {:?}", move_debt_authorizations);

    for authorization in move_debt_authorizations {
        let (token, selector, call_data) = authorization;
        cheat_caller_address(*token, USER_ADDRESS(), CheatSpan::TargetCalls(1));
        println!("Calling {:?} {:?} with {:?}", token, selector, call_data);
        let result = call_contract_syscall(*token, *selector, call_data.span());
        assert(result.is_ok(), 'call failed');
    };

    println!("Executing move_debt operation (Avnu)");
    cheat_caller_address(context.router_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    context.router_dispatcher.move_debt(move_debt_instructions.span());

    println!("Move debt operation completed successfully (Avnu)!");

    let eth_balance_final = eth_erc20.balance_of(USER_ADDRESS());
    let usdc_balance_final = usdc_erc20.balance_of(USER_ADDRESS());
    println!("Final balances after move_debt: ETH {:?}, USDC {:?}", eth_balance_final, usdc_balance_final);

    // ETH should have increased (collateral back), USDC adjusted by repay
    assert(eth_balance_final > eth_balance_before_move, 'ETH not increased withdraw');
    assert(usdc_balance_final == usdc_balance_before_move, 'USDC not increased repay');
}

#[test]
#[ignore]
#[fork("MAINNET_LATEST")]
fn test_avnu_move_debt_reswap_and_redeposit_kept_in_router() {
    println!("Setting up test context with Router and Vesu (redeposit flow, Avnu)");
    let context = setup_avnu_test_context();

    // Register both gateways with router
    cheat_caller_address(context.router_address, USER_ADDRESS(), CheatSpan::TargetCalls(3));
    let router = RouterGatewayTraitDispatcher { contract_address: context.router_address };
    router.add_gateway('avnu', context.avnu_gateway_address);
    let vesu_gateway_address = deploy_vesu_gateway(context.router_address);
    router.add_gateway('vesu', vesu_gateway_address);

    // 1) Create initial position: deposit 1 ETH collateral and borrow 200 USDC
    use kapan::gateways::vesu_gateway::VesuContext;
    let mut vesu_eth_context = array![];
    VesuContext { pool_id: 0, position_counterpart_token: ETH_ADDRESS() }.serialize(ref vesu_eth_context);
    let mut vesu_usdc_context = array![];
    VesuContext { pool_id: 0, position_counterpart_token: USDC_ADDRESS() }.serialize(ref vesu_usdc_context);

    let create_instructions = array![
        ProtocolInstructions {
            protocol_name: 'vesu',
            instructions: array![
                LendingInstruction::Deposit(Deposit { basic: BasicInstruction { token: ETH_ADDRESS(), amount: 1000000000000000000, user: USER_ADDRESS() }, context: Option::None }),
                LendingInstruction::Borrow(Borrow { basic: BasicInstruction { token: USDC_ADDRESS(), amount: 200000000, user: USER_ADDRESS() }, context: Option::Some(vesu_eth_context.span()) }),
            ].span(),
        }
    ];

    let create_auth = context.router_dispatcher.get_authorizations_for_instructions(create_instructions.span(), true);
    for authorization in create_auth {
        let (token, selector, call_data) = authorization;
        cheat_caller_address(*token, USER_ADDRESS(), CheatSpan::TargetCalls(1));
        let result = call_contract_syscall(*token, *selector, call_data.span());
        assert(result.is_ok(), 'create auth call failed');
    };

    println!("Executing creation");
    cheat_caller_address(context.router_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    let _ = context.router_dispatcher.process_protocol_instructions(create_instructions.span());
    println!("Creation completed successfully!");

    // 2) Build move_debt with reswap (both swap transfers disabled) and then redeposit the swap result
    // Build Avnu calldata struct for swap used in reswap (exact out flow)
    let mut routes2 = array![];
    let mut ekubo_params2: Array<felt252> = array![];
    ekubo_params2.append(ETH_ADDRESS().into());
    ekubo_params2.append(USDC_ADDRESS().into());
    ekubo_params2.append(170141183460469235273462165868118016); // 0.05%
    ekubo_params2.append(1000);
    ekubo_params2.append(starknet::contract_address_const::<0>().into());
    ekubo_params2.append(6277100250585753475930931601400621808602321654880405518632);
    routes2.append(Route {
        exchange_address: contract_address_const::<0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b>(),
        sell_token: ETH_ADDRESS(),
        buy_token: USDC_ADDRESS(),
        percent: 1000000000000,
        additional_swap_params: ekubo_params2,
    });
    let swap_ctx2 = SwapExactTokenToCalldata {
        sell_token_address: ETH_ADDRESS(),
        sell_token_amount: 22058144364613168,
        sell_token_max_amount: 1000000000000000000,
        buy_token_address: USDC_ADDRESS(),
        buy_token_amount: 0,
        beneficiary: USER_ADDRESS(),
        integrator_fee_amount_bps: 0, 
        integrator_fee_recipient: USER_ADDRESS(), 
        routes: routes2,
    };
    let mut avnu_ctx2_data = array![];
    swap_ctx2.serialize(ref avnu_ctx2_data);

    // Order vesu ops as repay then withdraw to match pointers below
    let withdraw_all_eth = LendingInstruction::Withdraw(Withdraw { basic: BasicInstruction { token: ETH_ADDRESS(), amount: 1000000000000000000, user: USER_ADDRESS() }, withdraw_all: true, context: Option::Some(vesu_usdc_context.span()) });
    let repay_all_usdc = LendingInstruction::Repay(Repay { basic: BasicInstruction { token: USDC_ADDRESS(), amount: 200000000, user: USER_ADDRESS() }, repay_all: true, context: Option::Some(vesu_eth_context.span()) });

    // Swap using Avnu: reference previous protocol outputs via indexes
    // exact_out = (withdraw ETH output 0), max_in = (repay USDC output 0)
    let reswap_instruction = LendingInstruction::Reswap(Reswap {
        exact_out: OutputPointer { instruction_index: 0, output_index: 0 },
        max_in: OutputPointer { instruction_index: 1, output_index: 0 },
        user: USER_ADDRESS(),
        should_pay_out: false,
        should_pay_in: false,
        context: Option::Some(avnu_ctx2_data.span()),
    });

    let mut md_instructions = array![];
    md_instructions.append(ProtocolInstructions { protocol_name: 'vesu', instructions: array![repay_all_usdc, withdraw_all_eth].span() });
    md_instructions.append(ProtocolInstructions { protocol_name: 'avnu', instructions: array![reswap_instruction].span() });
    // Redeposit using the swap output pointer (global order: 0 repay/withdraw, 1 avnu swap)
    let redeposit_from_swap = LendingInstruction::Redeposit(Redeposit { token: ETH_ADDRESS(), user: USER_ADDRESS(), target_output: OutputPointer { instruction_index: 2, output_index: 0 }, context: Option::None });
    md_instructions.append(ProtocolInstructions { protocol_name: 'vesu', instructions: array![redeposit_from_swap].span() });

    let md_auth = context.router_dispatcher.get_authorizations_for_instructions(md_instructions.span(), true);
    for authorization in md_auth {
        let (token, selector, call_data) = authorization;
        cheat_caller_address(*token, USER_ADDRESS(), CheatSpan::TargetCalls(1));
        let result = call_contract_syscall(*token, *selector, call_data.span());
        assert(result.is_ok(), 'move_debt auth call failed');
    };

    println!("Executing move_debt (Avnu)");
    cheat_caller_address(context.router_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    context.router_dispatcher.move_debt(md_instructions.span());
    println!("Move debt completed successfully (Avnu)!");

    // 3) Verify there is an active zero-debt position (collateral)
    let viewer = IVesuViewerDispatcher { contract_address: vesu_gateway_address };
    let positions = viewer.get_all_positions(USER_ADDRESS(), 0);
    let mut found_zero_debt = false;
    for pos in positions {
        let (collateral_asset, debt_asset, with_amounts) = pos;
        if collateral_asset == ETH_ADDRESS() && debt_asset == Zero::zero() && with_amounts.nominal_debt == 0 && with_amounts.collateral_shares > 0 {
            found_zero_debt = true;
        }
    };
    assert(found_zero_debt, 'expected-zero-debt');
}

#[test]
#[ignore]
#[fork("MAINNET_LATEST")]
fn test_avnu_switch_collateral_with_reswap_exact_in() {
    let context = setup_avnu_test_context();

    cheat_caller_address(context.router_address, USER_ADDRESS(), CheatSpan::TargetCalls(3));
    let router = RouterGatewayTraitDispatcher { contract_address: context.router_address };
    router.add_gateway('avnu', context.avnu_gateway_address);
    let vesu_gateway_address = deploy_vesu_gateway(context.router_address);
    router.add_gateway('vesu', vesu_gateway_address);

    // Seed position: deposit 1 ETH, borrow 200 USDC (STRK will be borrowed later)
    use kapan::gateways::vesu_gateway::VesuContext;
    let mut vesu_eth_context = array![];
    VesuContext { pool_id: 0, position_counterpart_token: ETH_ADDRESS() }.serialize(ref vesu_eth_context);
    let mut vesu_usdc_context = array![];
    VesuContext { pool_id: 0, position_counterpart_token: USDC_ADDRESS() }.serialize(ref vesu_usdc_context);
    let mut vesu_strk_context = array![];
    VesuContext { pool_id: 0, position_counterpart_token: STRK_ADDRESS() }.serialize(ref vesu_strk_context);


    let create_instructions = array![
        ProtocolInstructions {
            protocol_name: 'vesu',
            instructions: array![
                LendingInstruction::Deposit(Deposit { basic: BasicInstruction { token: ETH_ADDRESS(), amount: 1000000000000000000, user: USER_ADDRESS() }, context: Option::None }),
                LendingInstruction::Borrow(Borrow { basic: BasicInstruction { token: STRK_ADDRESS(), amount: 2500000000000000000000, user: USER_ADDRESS() }, context: Option::Some(vesu_eth_context.span()) }),
            ].span(),
        }
    ];
    let create_auth = context.router_dispatcher.get_authorizations_for_instructions(create_instructions.span(), true);
    for authorization in create_auth {
        let (token, selector, call_data) = authorization;
        cheat_caller_address(*token, USER_ADDRESS(), CheatSpan::TargetCalls(1));
        let _ = call_contract_syscall(*token, *selector, call_data.span());
    };
    println!("Executing creation");
    cheat_caller_address(context.router_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    let _ = context.router_dispatcher.process_protocol_instructions(create_instructions.span());
    println!("Creation completed successfully!");

    // Prepare Avnu context for exact-in swap: swap withdrawn ETH -> USDC, keep in router
    let mut routes = array![];
    let mut ekubo_params: Array<felt252> = array![];
    ekubo_params.append(ETH_ADDRESS().into());
    ekubo_params.append(USDC_ADDRESS().into());
    ekubo_params.append(170141183460469235273462165868118016);
    ekubo_params.append(1000);
    ekubo_params.append(starknet::contract_address_const::<0>().into());
    ekubo_params.append(6277100250585753475930931601400621808602321654880405518632);
    routes.append(Route { exchange_address: contract_address_const::<0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b>(), sell_token: ETH_ADDRESS(), buy_token: USDC_ADDRESS(), percent: 1000000000000, additional_swap_params: ekubo_params });
    let mr_ctx = MultiRouteSwapCalldata {
        sell_token_address: ETH_ADDRESS(),
        sell_token_amount: 0,
        buy_token_address: USDC_ADDRESS(),
        buy_token_amount: 4500000000,
        buy_token_min_amount: 4000000000,
        beneficiary: USER_ADDRESS(),
        integrator_fee_amount_bps: 0,
        integrator_fee_recipient: USER_ADDRESS(),
        routes,
    };
    let mut mr_ctx_data = array![];
    mr_ctx.serialize(ref mr_ctx_data);

    // Build move_debt: repay USDC, withdraw ETH, reswapExactIn withdrawn ETH -> USDC (keep in router), redeposit USDC, reborrow STRK
    let repay_all_usdc = LendingInstruction::Repay(Repay { 
        basic: BasicInstruction { token: STRK_ADDRESS(), amount: 2500000000000000000000, user: USER_ADDRESS() }, 
        repay_all: true, 
        context: Option::Some(vesu_eth_context.span())
    });
    let withdraw_all_eth = LendingInstruction::Withdraw(Withdraw { 
        basic: BasicInstruction { token: ETH_ADDRESS(), amount: 1000000000000000000, user: USER_ADDRESS() }, 
        withdraw_all: true, 
        context: Option::Some(vesu_strk_context.span()) 
    });

    // ReswapExactIn: exact_in from withdraw output (ETH), token_out = USDC, keep both transfers disabled
    let reswap_exact_in = LendingInstruction::ReswapExactIn(ReswapExactIn {
        exact_in: OutputPointer { instruction_index: 1, output_index: 0 },
        min_out: 4000000000,
        token_out: USDC_ADDRESS(),
        user: USER_ADDRESS(),
        should_pay_out: false,
        should_pay_in: false,
        context: Option::Some(mr_ctx_data.span()),
    });

    let redeposit_usdc = LendingInstruction::Redeposit(Redeposit { 
        token: USDC_ADDRESS(), 
        user: USER_ADDRESS(), 
        target_output: OutputPointer { instruction_index: 2, output_index: 1 }, 
        context: Option::Some(vesu_strk_context.span()) 
    });
    // Reborrow STRK against new USDC collateral using reborrow pattern (approval amount can be same as min_out)
    let reborrow_strk = LendingInstruction::Reborrow(Reborrow { 
        token: STRK_ADDRESS(),
        target_output: OutputPointer { instruction_index: 0, output_index: 0 }, 
        approval_amount: 2600000000000000000000, 
        user: USER_ADDRESS(), 
        context: Option::Some(vesu_usdc_context.span()) 
    });

    let mut md_instructions = array![];
    md_instructions.append(ProtocolInstructions { protocol_name: 'vesu', instructions: array![repay_all_usdc, withdraw_all_eth].span() });
    md_instructions.append(ProtocolInstructions { protocol_name: 'avnu', instructions: array![reswap_exact_in].span() });
    md_instructions.append(ProtocolInstructions { protocol_name: 'vesu', instructions: array![redeposit_usdc, reborrow_strk].span() });

    let md_auth = context.router_dispatcher.get_authorizations_for_instructions(array![*md_instructions.at(0), *md_instructions.at(1)].span(), true);
    for authorization in md_auth {
        let (token, selector, call_data) = authorization;
        cheat_caller_address(*token, USER_ADDRESS(), CheatSpan::TargetCalls(1));
        let result = call_contract_syscall(*token, *selector, call_data.span());
        assert(result.is_ok(), 'switch-collateral auth failed');
    };

    println!("Executing move_debt");
    cheat_caller_address(context.router_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    context.router_dispatcher.move_debt(md_instructions.span());
    println!("Move debt completed successfully!");

    // Verify positions: no ETH/STRK, yes USDC/STRK; print amounts and check STRK debt ~ expected
    let viewer = IVesuViewerDispatcher { contract_address: vesu_gateway_address };
    // Fetch ETH/STRK position directly
    let eth_strk_ctx = VesuContext { pool_id: 0, position_counterpart_token: STRK_ADDRESS() };
    let (eth_collateral, eth_debt, eth_pos) = viewer.get_position_from_context(USER_ADDRESS(), eth_strk_ctx, ETH_ADDRESS(), true);
    println!("ETH/STRK pos: coll{:?}, debt {:?}", eth_pos.collateral_amount, eth_pos.nominal_debt);
    let has_eth_strk = eth_pos.collateral_shares > 0 || eth_pos.nominal_debt > 0;

    // Fetch USDC/STRK position directly
    let usdc_strk_ctx = VesuContext { pool_id: 0, position_counterpart_token: STRK_ADDRESS() };
    let (usdc_collateral, usdc_debt, usdc_pos) = viewer.get_position_from_context(USER_ADDRESS(), usdc_strk_ctx, USDC_ADDRESS(), true);
    println!("USDC/STRK pos: coll {:?}, debt {:?}", usdc_pos.collateral_amount, usdc_pos.nominal_debt);
    let has_usdc_strk = usdc_pos.collateral_shares > 0 || usdc_pos.nominal_debt > 0;
    let usdc_strk_debt: u256 = usdc_pos.nominal_debt;
    assert(!has_eth_strk, 'unexpected-eth-strk');
    assert(has_usdc_strk, 'missing-usdc-strk');

    // Expect roughly the same STRK debt as initial (2_500 STRK), allow 10% tolerance
    let expected_strk: u256 = 2500000000000000000000;
    let ten_percent: u256 = expected_strk / 10;
    let mut lower_bound = expected_strk - ten_percent;
    let mut upper_bound = expected_strk + ten_percent;
    assert(usdc_strk_debt >= lower_bound, 'strk-debt-too-low');
    assert(usdc_strk_debt <= upper_bound, 'strk-debt-too-high');
}

#[test]
#[ignore]
#[fork("MAINNET_LATEST")]
fn test_avnu_switch_debt_with_reswap_exact_out() {
    let context = setup_avnu_test_context();

    cheat_caller_address(context.router_address, USER_ADDRESS(), CheatSpan::TargetCalls(3));
    let router = RouterGatewayTraitDispatcher { contract_address: context.router_address };
    router.add_gateway('avnu', context.avnu_gateway_address);
    let vesu_gateway_address = deploy_vesu_gateway(context.router_address);
    router.add_gateway('vesu', vesu_gateway_address);

    // 1) Create initial position: deposit huge STRK collateral and borrow a bit of ETH debt (to be repaid)
    use kapan::gateways::vesu_gateway::VesuContext;
    let mut vesu_strk_ctx = array![];
    let vesu_strk = VesuContext { pool_id: 0, position_counterpart_token: STRK_ADDRESS() };
    vesu_strk.serialize(ref vesu_strk_ctx);
    let mut vesu_eth_context = array![];
    let vesu_eth = VesuContext { pool_id: 0, position_counterpart_token: ETH_ADDRESS() };
    vesu_eth.serialize(ref vesu_eth_context);
    let mut vesu_usdc_context = array![];
    let vesu_usdc = VesuContext { pool_id: 0, position_counterpart_token: USDC_ADDRESS() };
    vesu_usdc.serialize(ref vesu_usdc_context);

    // Deposit STRK (use previous amount with a leading 1)
    let deposit_strk = LendingInstruction::Deposit(Deposit { basic: BasicInstruction {
         token: STRK_ADDRESS(), amount: 10000000000000000000000000, user: USER_ADDRESS() }, 
         context: Option::None 
    });
    // Borrow small ETH (will be repaid via exact_out swap)
    let repay_eth_amount: u256 = 50000000000000000; // 0.01 ETH
    let borrow_eth = LendingInstruction::Borrow(Borrow { 
        basic: BasicInstruction { token: ETH_ADDRESS(), amount: repay_eth_amount, user: USER_ADDRESS() }, 
        context: Option::Some(vesu_strk_ctx.span()) 
    });

    let create_instructions = array![ ProtocolInstructions { protocol_name: 'vesu', instructions: array![deposit_strk, borrow_eth].span() } ];
    let create_auth = context.router_dispatcher.get_authorizations_for_instructions(create_instructions.span(), true);
    for authorization in create_auth { let (token, selector, call_data) = authorization; cheat_caller_address(*token, USER_ADDRESS(), CheatSpan::TargetCalls(1)); let _ = call_contract_syscall(*token, *selector, call_data.span()); };
    cheat_caller_address(context.router_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    let _ = context.router_dispatcher.process_protocol_instructions(create_instructions.span());
    println!("Creation completed successfully!");

    // 2) Build Avnu exact-out context: swap USDC -> ETH, exact_out = repay_eth_amount, max_in = 100 USDC
    let mut routes = array![];
    let mut ekubo_params: Array<felt252> = array![];
    ekubo_params.append(ETH_ADDRESS().into());
    ekubo_params.append(USDC_ADDRESS().into());
    ekubo_params.append(170141183460469235273462165868118016); // 0.05%
    ekubo_params.append(1000);
    ekubo_params.append(starknet::contract_address_const::<0>().into());
    ekubo_params.append(6277100250585753475930931601400621808602321654880405518632);
    routes.append(Route { 
        exchange_address: contract_address_const::<0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b>(), 
        sell_token: USDC_ADDRESS(), 
        buy_token: ETH_ADDRESS(), 
        percent: 1000000000000, 
        additional_swap_params: ekubo_params });
    let exact_out_ctx = SwapExactTokenToCalldata {
        sell_token_address: USDC_ADDRESS(),
        sell_token_amount: 100000000, // 100 USDC
        sell_token_max_amount: 300000000, // max_in = what we borrow
        buy_token_address: ETH_ADDRESS(),
        buy_token_amount: repay_eth_amount, // exact_out
        beneficiary: USER_ADDRESS(),
        integrator_fee_amount_bps: 0,
        integrator_fee_recipient: USER_ADDRESS(),
        routes,
    };
    let mut exact_out_ctx_data = array![];
    exact_out_ctx.serialize(ref exact_out_ctx_data);

    // 3) Move debt: repay ETH, optional withdraw/redeposit STRK (no-op), borrow 100 USDC, reswap USDC->ETH exact_out
    let repay_eth = LendingInstruction::Repay(Repay { 
        basic: BasicInstruction { token: ETH_ADDRESS(), amount: repay_eth_amount, user: USER_ADDRESS() }, 
        repay_all: true, 
        context: Option::Some(vesu_strk_ctx.span()) 
    });
    let withdraw_zero_strk = LendingInstruction::Withdraw(Withdraw { 
        basic: BasicInstruction { token: STRK_ADDRESS(), amount: 10000000000000000000000000, user: USER_ADDRESS() }, 
        withdraw_all: true, 
        context: Option::Some(vesu_eth_context.span()) 
    });
    let redeposit_zero_strk = LendingInstruction::Redeposit(Redeposit { 
        token: STRK_ADDRESS(), 
        user: USER_ADDRESS(), 
        target_output: OutputPointer { instruction_index: 1, output_index: 0 }, 
        context: Option::Some(vesu_usdc_context.span()) 
    });
    let borrow_usdc = LendingInstruction::Borrow(Borrow { 
        basic: BasicInstruction { token: USDC_ADDRESS(), amount: 450000000, user: USER_ADDRESS() }, 
        context: Option::Some(vesu_strk_ctx.span()) 
    });

    // Avnu reswap: exact_out from repay (idx 0), max_in from borrow (idx 3)
    let reswap_exact_out = LendingInstruction::Reswap(Reswap {
        exact_out: OutputPointer { instruction_index: 0, output_index: 0 },
        max_in: OutputPointer { instruction_index: 3, output_index: 0 },
        user: USER_ADDRESS(),
        should_pay_out: false,
        should_pay_in: false,
        context: Option::Some(exact_out_ctx_data.span()),
    });

    let mut md_instructions = array![];
    md_instructions.append(ProtocolInstructions { protocol_name: 'vesu', instructions: array![repay_eth, withdraw_zero_strk].span() });
    md_instructions.append(ProtocolInstructions { protocol_name: 'vesu', instructions: array![redeposit_zero_strk, borrow_usdc].span() });
    md_instructions.append(ProtocolInstructions { protocol_name: 'avnu', instructions: array![reswap_exact_out].span() });

    let md_auth = context.router_dispatcher.get_authorizations_for_instructions(array![*md_instructions.at(0), *md_instructions.at(1)].span(), true);
    for authorization in md_auth { let (token, selector, call_data) = authorization; cheat_caller_address(*token, USER_ADDRESS(), CheatSpan::TargetCalls(1)); let result = call_contract_syscall(*token, *selector, call_data.span()); assert(result.is_ok(), 'switch-debt auth failed'); };

    cheat_caller_address(context.router_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    context.router_dispatcher.move_debt(md_instructions.span());
    println!("Move debt completed successfully (switch debt)!");
    
    let viewer = IVesuViewerDispatcher { contract_address: vesu_gateway_address };
    let (_c2, _d2, pos_usdc) = viewer.get_position_from_context(USER_ADDRESS(), vesu_strk, USDC_ADDRESS(), false);
    assert(pos_usdc.nominal_debt != 0, 'usdc-debt-too-low');
    println!("STRK/USDC after: coll {:?}, debt {:?}", pos_usdc.collateral_amount, pos_usdc.nominal_debt);
}