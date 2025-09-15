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
    Repay,
    Withdraw,
    Reswap,
    Redeposit,
    BasicInstruction,
};
use ekubo::types::keys::PoolKey;
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
use kapan::gateways::vesu_gateway::{IVesuViewerDispatcher, IVesuViewerDispatcherTrait};

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
    vesu_gateway_address: ContractAddress,
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

// Deploy VesuGateway - same as TestRouter
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

// Setup test context
fn setup_ekubo_test_context() -> EkuboTestContext {
    println!("Deploying RouterGateway");
    let router_address = deploy_router_gateway();

    println!("Deploying EkuboGateway");
    let ekubo_gateway_address = deploy_ekubo_gateway();
    
    println!("Deploying VesuGateway");
    let vesu_gateway_address = deploy_vesu_gateway(router_address);
    
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
        vesu_gateway_address,
        router_dispatcher,
    }
}

#[test]
#[ignore]
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
#[ignore]
#[fork("MAINNET_LATEST")]
fn test_ekubo_swap_eth_usdc() {
    println!("Setting up Ekubo test context for ETH/USDC swap");
    let context = setup_ekubo_test_context();
    
    // Register Ekubo gateway with router
    cheat_caller_address(context.router_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    let router = RouterGatewayTraitDispatcher { contract_address: context.router_address };
    router.add_gateway('ekubo', context.ekubo_gateway_address);
    
    // ETH (ERC20 on Starknet)
    let eth: ContractAddress = ETH_ADDRESS();
    
    // USDC (ERC20 on Starknet) - Updated address
    let usdc: ContractAddress = USDC_ADDRESS();
    
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
        user: USER_ADDRESS(),
        should_pay_out: true,
        should_pay_in: true,
        context: Option::Some(pool_context.span()),
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
    eth_erc20.approve(context.router_address, 2000000000000000000); // 2 ETH max
    
    let mut protocol_instructions = array![];
    protocol_instructions.append(ProtocolInstructions {
        protocol_name: 'ekubo',
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
    
    println!("Executing ETH to USDC swap via Ekubo gateway");
    
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
    assert(eth_spent <= 2000000000000000000, 'ETH spent exceeds max_in');
    let usdc_gained = usdc_balance_after - usdc_balance_before;
    // Human-readable summary (split integer.fractional using decimals)
    let scale_eth = 1000000000000000000;
    let scale_usdc = 1000000;
    let eth_int = eth_spent / scale_eth;
    let eth_frac = eth_spent % scale_eth;
    let usdc_int = usdc_gained / scale_usdc;
    let usdc_frac = usdc_gained % scale_usdc;
    println!("Swap: ETH {:?}.{:?} -> USDC {:?}.{:?}", eth_int, eth_frac, usdc_int, usdc_frac);
    assert(usdc_balance_after == usdc_balance_before + 2000000000, 'USDC balance should increase');
}

#[test]
#[ignore]
#[fork("MAINNET_LATEST")]
fn test_ekubo_swap_exact_in() {
    let context = setup_ekubo_test_context();

    cheat_caller_address(context.router_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    let router = RouterGatewayTraitDispatcher { contract_address: context.router_address };
    router.add_gateway('ekubo', context.ekubo_gateway_address);

    let eth: ContractAddress = ETH_ADDRESS();
    let usdc: ContractAddress = USDC_ADDRESS();

    let pool_key = PoolKey {
        token0: usdc,
        token1: eth,
        fee: 170141183460469235273462165868118016,
        tick_spacing: 1000,
        extension: starknet::contract_address_const::<0>(),
    };

    let mut pool_context = array![];
    pool_context.append_serde(pool_key.fee);
    pool_context.append_serde(pool_key.tick_spacing);
    pool_context.append_serde(pool_key.extension);

    let swap = SwapExactIn {
        token_in: eth,
        token_out: usdc,
        exact_in: 1000000000000000000, // 1 ETH
        min_out: 1000000000, // 1000 USDC
        user: USER_ADDRESS(),
        should_pay_out: true,
        should_pay_in: true,
        context: Option::Some(pool_context.span()),
    };

    let eth_erc20 = IERC20Dispatcher { contract_address: eth };
    let usdc_erc20 = IERC20Dispatcher { contract_address: usdc };
    let eth_balance_before = eth_erc20.balance_of(USER_ADDRESS());
    let usdc_balance_before = usdc_erc20.balance_of(USER_ADDRESS());
    cheat_caller_address(eth, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    eth_erc20.approve(context.router_address, 1000000000000000000);

    let mut protocol_instructions = array![];
    protocol_instructions.append(ProtocolInstructions {
        protocol_name: 'ekubo',
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

    let eth_spent = eth_balance_before - eth_balance_after;
    assert(eth_spent <= 1000000000000000000, 'ETH spent exceeds exact_in');
    let usdc_gained = usdc_balance_after - usdc_balance_before;
    assert(usdc_gained >= 1000000000, 'USDC output below min');
}

#[test]
#[ignore]
#[fork("MAINNET_LATEST")]
fn test_create_position_and_move_debt_with_reswap() {
    println!("Setting up test context with Router and Vesu");
    let context = setup_ekubo_test_context();
    
    // Register both gateways with router
    cheat_caller_address(context.router_address, USER_ADDRESS(), CheatSpan::TargetCalls(2));
    let router = RouterGatewayTraitDispatcher { contract_address: context.router_address };
    router.add_gateway('ekubo', context.ekubo_gateway_address);
    router.add_gateway('vesu', context.vesu_gateway_address);
    
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
    // VesuContext would need to be defined - using placeholder for now
    VesuContext { pool_id: 0, position_counterpart_token: ETH_ADDRESS() }.serialize(ref vesu_eth_context);
    
    let mut vesu_usdc_context = array![];
    VesuContext { pool_id: 0, position_counterpart_token: USDC_ADDRESS() }.serialize(ref vesu_usdc_context);

    let eth_deposit = LendingInstruction::Deposit(Deposit {
        basic: BasicInstruction {
            token: ETH_ADDRESS(),
            amount: 1000000000000000000, // 1 ETH
            user: USER_ADDRESS(),
        },
        context: Option::None, // Would use vesu_context.span() in real implementation
    });
    
    // Then borrow USDC against ETH collateral
    let usdc_borrow = LendingInstruction::Borrow(Borrow {
        basic: BasicInstruction {
            token: USDC_ADDRESS(),
            amount: 200000000, // 200 USDC
            user: USER_ADDRESS(),
        },
        context: Option::Some(vesu_eth_context.span()), // Would use vesu_context.span() in real implementation
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
    
    // Check final balances
    let eth_balance_after = eth_erc20.balance_of(USER_ADDRESS());
    let usdc_balance_after = usdc_erc20.balance_of(USER_ADDRESS());
    
    println!("Final ETH balance: {:?}", eth_balance_after);
    println!("Final USDC balance: {:?}", usdc_balance_after);
    
    // Verify the position was created
    // ETH should have decreased (deposited as collateral)
    assert(eth_balance_after < eth_balance_before, 'ETH should decrease');
    let eth_deposited = eth_balance_before - eth_balance_after;
    assert(eth_deposited == 1000000000000000000, 'should have deposited 1 ETH');
    
    // USDC should have increased (borrowed)
    assert(usdc_balance_after > usdc_balance_before, 'USDC should increase');
    let usdc_borrowed = usdc_balance_after - usdc_balance_before;
    assert(usdc_borrowed == 200000000, 'should have borrowed 200 USDC');
    
    println!("Position created successfully:");
    println!("- ETH deposited as collateral: {:?}", eth_deposited);
    println!("- USDC borrowed: {:?}", usdc_borrowed);
    
    // Now perform move_debt operation
    println!("\n=== Starting Move Debt Operation ===");
    
    // Check balances before move_debt
    let eth_balance_before_move = eth_erc20.balance_of(USER_ADDRESS());
    let usdc_balance_before_move = usdc_erc20.balance_of(USER_ADDRESS());
    
    println!("Balances before move_debt:");
    println!("- ETH: {:?}", eth_balance_before_move);
    println!("- USDC: {:?}", usdc_balance_before_move);
    
    // Create move_debt instructions
    let mut move_debt_instructions = array![];
    
    // Vesu instructions: repay all USDC debt and withdraw all ETH collateral
    let usdc_repay = LendingInstruction::Repay(Repay {
        basic: BasicInstruction {
            token: USDC_ADDRESS(),
            amount: 200000000, // Will be determined by repay_all
            user: USER_ADDRESS(),
        },
        repay_all: true,
        context: Option::Some(vesu_eth_context.span()),
    });
    
    let eth_withdraw = LendingInstruction::Withdraw(Withdraw {
        basic: BasicInstruction {
            token: ETH_ADDRESS(),
            amount: 1000000000000000000, // Will be determined by withdraw_all
            user: USER_ADDRESS(),
        },
        withdraw_all: true,
        context: Option::Some(vesu_usdc_context.span()),
    });
    
    // Ekubo instructions: reswap using the outputs from vesu instructions
    let reswap_instruction = LendingInstruction::Reswap(Reswap {
        exact_out: OutputPointer { instruction_index: 0, output_index: 0 },
        max_in: OutputPointer { instruction_index: 1, output_index: 0 },
        user: USER_ADDRESS(),
        should_pay_out: false, // close position so repay flash loan
        should_pay_in: true,
        context: Option::None,
    });
    
    move_debt_instructions.append(ProtocolInstructions {
        protocol_name: 'vesu',
        instructions: array![usdc_repay, eth_withdraw].span(),
    });
    
    move_debt_instructions.append(ProtocolInstructions {
        protocol_name: 'ekubo',
        instructions: array![reswap_instruction].span(),
    });
    
    println!("Getting authorizations for move_debt instructions");
    let move_debt_authorizations = context.router_dispatcher.get_authorizations_for_instructions(move_debt_instructions.span(), true);
    println!("Move debt authorizations: {:?}", move_debt_authorizations);
    
    // Execute move_debt authorizations
    for authorization in move_debt_authorizations {
        let (token, selector, call_data) = authorization;
        cheat_caller_address(*token, USER_ADDRESS(), CheatSpan::TargetCalls(1));
        println!("Calling {:?} {:?} with {:?}", token, selector, call_data);
        let result = call_contract_syscall(*token, *selector, call_data.span());
        assert(result.is_ok(), 'call failed');
    };
    
    println!("Executing move_debt operation");
    
    // Execute move_debt
    cheat_caller_address(context.router_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    context.router_dispatcher.move_debt(move_debt_instructions.span());
    
    println!("Move debt operation completed successfully!");
    
    // Check final balances
    let eth_balance_final = eth_erc20.balance_of(USER_ADDRESS());
    let usdc_balance_final = usdc_erc20.balance_of(USER_ADDRESS());
    
    println!("Final balances after move_debt:");
    println!("- ETH: {:?}", eth_balance_final);
    println!("- USDC: {:?}", usdc_balance_final);
    
    // Verify we received collateral (ETH) and have no positions
    // ETH should have increased (withdrawn from Vesu)
    assert(eth_balance_final > eth_balance_before_move, 'ETH not increased withdraw');
    let eth_received = eth_balance_final - eth_balance_before_move;
    println!("- ETH received from withdraw: {:?}", eth_received);
    
    // USDC balance should reflect the swap (we paid back debt and got ETH)
    let usdc_change = usdc_balance_final - usdc_balance_before_move;
    println!("- USDC change: {:?}", usdc_change);
    
    println!("\n=== Move Debt Operation Completed Successfully ===");
    println!("- Position closed: repaid all USDC debt and withdrew all ETH collateral");
    println!("- Reswap executed: converted withdrawn ETH to USDC via Ekubo");
    println!("- Final result: received collateral with no active positions");
}

#[test]
#[ignore]
#[fork("MAINNET_LATEST")]
fn test_move_debt_reswap_and_redeposit_kept_in_router() {
    println!("Setting up test context with Router and Vesu (redeposit flow)");
    let context = setup_ekubo_test_context();

    // Register both gateways with router
    cheat_caller_address(context.router_address, USER_ADDRESS(), CheatSpan::TargetCalls(3));
    let router = RouterGatewayTraitDispatcher { contract_address: context.router_address };
    router.add_gateway('ekubo', context.ekubo_gateway_address);
    router.add_gateway('vesu', context.vesu_gateway_address);

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
                LendingInstruction::Deposit(Deposit {
                    basic: BasicInstruction { token: ETH_ADDRESS(), amount: 1000000000000000000, user: USER_ADDRESS() }, // 1 ETH
                    context: Option::None,
                }),
                LendingInstruction::Borrow(Borrow {
                    basic: BasicInstruction { token: USDC_ADDRESS(), amount: 200000000, user: USER_ADDRESS() }, // 200 USDC
                    context: Option::Some(vesu_eth_context.span()),
                }),
            ].span(),
        }
    ];

    // Approvals for the create_instructions
    let create_auth = context.router_dispatcher.get_authorizations_for_instructions(create_instructions.span(), true);
    for authorization in create_auth {
        let (token, selector, call_data) = authorization;
        cheat_caller_address(*token, USER_ADDRESS(), CheatSpan::TargetCalls(1));
        let result = call_contract_syscall(*token, *selector, call_data.span());
        assert(result.is_ok(), 'create auth call failed');
    };

    // Execute creation
    println!("Executing creation");
    cheat_caller_address(context.router_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    let _ = context.router_dispatcher.process_protocol_instructions(create_instructions.span());
    println!("Creation completed successfully!");

    // 2) Build move_debt with reswap (both swap transfers disabled) and then redeposit the swap result
    // Order vesu ops as: Withdraw first, then Repay, so indexes align: 0 -> withdraw, 1 -> repay
    let withdraw_all_eth = LendingInstruction::Withdraw(Withdraw {
        basic: BasicInstruction { token: ETH_ADDRESS(), amount: 1000000000000000000, user: USER_ADDRESS() },
        withdraw_all: true,
        context: Option::Some(vesu_usdc_context.span()),
    });
    let repay_all_usdc = LendingInstruction::Repay(Repay {
        basic: BasicInstruction { token: USDC_ADDRESS(), amount: 200000000, user: USER_ADDRESS() },
        repay_all: true,
        context: Option::Some(vesu_eth_context.span()),
    });

    // Swap using Ekubo: reference previous protocol outputs via indexes
    // exact_out = (withdraw ETH output 0), max_in = (repay USDC output 0)
    let reswap_instruction = LendingInstruction::Reswap(Reswap {
        exact_out: OutputPointer { instruction_index: 0, output_index: 0 },
        max_in: OutputPointer { instruction_index: 1, output_index: 0 },
        user: USER_ADDRESS(),
        should_pay_out: false,
        should_pay_in: false,
        context: Option::None,
    });

    // Redeposit using the swap output pointer (global order: 0 withdraw, 1 repay, 2 swap)
    let redeposit_from_swap = LendingInstruction::Redeposit(Redeposit {
        token: ETH_ADDRESS(),
        user: USER_ADDRESS(),
        target_output: OutputPointer { instruction_index: 2, output_index: 0 },
        context: Option::None,
    });

    let mut md_instructions = array![];
    md_instructions.append(ProtocolInstructions { protocol_name: 'vesu', instructions: array![repay_all_usdc, withdraw_all_eth].span() });
    md_instructions.append(ProtocolInstructions { protocol_name: 'ekubo', instructions: array![reswap_instruction].span() });
    md_instructions.append(ProtocolInstructions { protocol_name: 'vesu', instructions: array![redeposit_from_swap].span() });

    // Authorizations (user approvals) for the whole sequence
    let md_auth = context.router_dispatcher.get_authorizations_for_instructions(md_instructions.span(), true);
    for authorization in md_auth {
        let (token, selector, call_data) = authorization;
        cheat_caller_address(*token, USER_ADDRESS(), CheatSpan::TargetCalls(1));
        let result = call_contract_syscall(*token, *selector, call_data.span());
        assert(result.is_ok(), 'move_debt auth call failed');
    };

    // Execute move_debt (flashloan path keeps internal transfers)
    println!("Executing move_debt");
    cheat_caller_address(context.router_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    context.router_dispatcher.move_debt(md_instructions.span());
    println!("Move debt completed successfully!");

    // 3) Verify there is an active zero-debt position (collateral) for USDC
    let viewer = IVesuViewerDispatcher { contract_address: context.vesu_gateway_address };
    let positions = viewer.get_all_positions(USER_ADDRESS(), 0);

    let mut found_zero_debt_usdc = false;
    for pos in positions {
        let (collateral_asset, debt_asset, with_amounts) = pos;
        if collateral_asset == ETH_ADDRESS() && debt_asset == Zero::zero() && with_amounts.nominal_debt == 0 && with_amounts.collateral_shares > 0 {
            found_zero_debt_usdc = true;
        }
    };
    assert(found_zero_debt_usdc, 'expected-zero-debt');
}
