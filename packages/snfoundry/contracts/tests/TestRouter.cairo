use core::traits::Drop;
use core::option::Option;
use kapan::gateways::NostraGateway::{
    INostraGatewayDispatcherTrait,
    INostraGatewayDispatcher,
};
use kapan::gateways::VesuGateway::{
    IVesuGatewayAdminDispatcher,
    IVesuGatewayAdminDispatcherTrait,
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
use kapan::gateways::RouterGateway::{
    ProtocolInstructions,
    RouterGatewayTraitDispatcher,
    RouterGatewayTraitDispatcherTrait,
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
use starknet::syscalls::call_contract_syscall;
use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
use openzeppelin::utils::serde::SerializedAppend;
use kapan::interfaces::nostra::{LentDebtTokenABIDispatcher, LentDebtTokenABIDispatcherTrait};

// Real contract address deployed on Sepolia
fn SINGLETON_ADDRESS() -> ContractAddress {
    contract_address_const::<0x2545b2e5d519fc230e9cd781046d3a64e092114f07e44771e0d719d148725ef>()
}

// Nostra Finance tokens
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

fn RICH_ADDRESS() -> ContractAddress {
    contract_address_const::<0x0213c67ed78bc280887234fe5ed5e77272465317978ae86c25a71531d9332a2d>()
}

fn USER_ADDRESS() -> ContractAddress {
    contract_address_const::<0x0113c67ed78bc280887234fe5ed5e77272465317978ae86c25a71531d9332a2d>()
}

// Helper struct for test context
#[derive(Drop)]
struct TestContext {
    router_address: ContractAddress,
    nostra_gateway_address: ContractAddress,
    vesu_gateway_address: ContractAddress,
    router_dispatcher: RouterGatewayTraitDispatcher,
}

// Deploy NostraGateway
fn deploy_nostra_gateway() -> ContractAddress {
    let contract_class = declare("NostraGateway").unwrap().contract_class();
    let calldata = array![];
    let (contract_address, _) = contract_class.deploy(@calldata).unwrap();
    contract_address
}

// Deploy VesuGateway
fn deploy_vesu_gateway() -> ContractAddress {
    let contract_class = declare("VesuGateway").unwrap().contract_class();
    let mut calldata = array![];
    calldata.append_serde(contract_address_const::<0x2545b2e5d519fc230e9cd781046d3a64e092114f07e44771e0d719d148725ef>());
    calldata.append_serde(2198503327643286920898110335698706244522220458610657370981979460625005526824);
    let mut supported_assets = array![];
    supported_assets.append(ETH_ADDRESS());
    supported_assets.append(USDC_ADDRESS());
    calldata.append_serde(supported_assets);
    let (contract_address, _) = contract_class.deploy(@calldata).unwrap();
    contract_address
}

// Deploy RouterGateway
fn deploy_router_gateway() -> ContractAddress {
    let contract_class = declare("RouterGateway").unwrap().contract_class();
    let mut calldata = array![];
    calldata.append_serde(USER_ADDRESS());
    calldata.append_serde(SINGLETON_ADDRESS());
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
}

fn prefund_address(recipient: ContractAddress, token_address: ContractAddress, amount: u256) {
    let token_erc20 = IERC20Dispatcher { contract_address: token_address };
    cheat_caller_address(token_address, RICH_ADDRESS(), CheatSpan::TargetCalls(1));
    token_erc20.transfer(recipient, amount);
    println!("Prefunded with token");
}

fn setup_test_context() -> TestContext {
    println!("Deploying NostraGateway");
    let nostra_gateway_address = deploy_nostra_gateway();
    
    println!("Deploying VesuGateway");
    let vesu_gateway_address = deploy_vesu_gateway();
    
    println!("Deploying RouterGateway");
    let router_address = deploy_router_gateway();
    
    println!("Adding supported assets to NostraGateway");
    add_supported_assets(nostra_gateway_address);
    
    // Pre-fund the test user with ETH and USDC
    println!("Pre-funding user address");
    prefund_address(USER_ADDRESS(), ETH_ADDRESS(), 15000000000000000000); // 15 ETH
    
    let router_dispatcher = RouterGatewayTraitDispatcher {
        contract_address: router_address
    };
    
    TestContext {
        router_address,
        nostra_gateway_address,
        vesu_gateway_address,
        router_dispatcher,
    }
}

#[test]
#[ignore]
#[fork("MAINNET_LATEST")]
fn test_router_setup() {
    let context = setup_test_context();
    
    // Register gateways with router
    cheat_caller_address(context.router_address, USER_ADDRESS(), CheatSpan::TargetCalls(2));
    let router = RouterGatewayTraitDispatcher { contract_address: context.router_address };
    println!("Adding NostraGateway to router");
    router.add_gateway('nostra', context.nostra_gateway_address);
    println!("Adding VesuGateway to router");
    router.add_gateway('vesu', context.vesu_gateway_address);
    
    // Create a deposit instruction for Nostra
    let deposit = Deposit {
        basic: BasicInstruction {
            token: ETH_ADDRESS(),
            amount: 5000000000000000000, // 5 ETH
            user: USER_ADDRESS(),
        },
        context: Option::None,
    };
    let borrow = Borrow {
        basic: BasicInstruction {
            token: USDC_ADDRESS(),
            amount: 200000000, // 10 USDC
            user: USER_ADDRESS(),
        },
        context: Option::None,
    };
    let repay = Repay {
        basic: BasicInstruction {
            token: USDC_ADDRESS(),
            amount: 200000000, // 10 USDC
            user: USER_ADDRESS(),
        },
        context: Option::None,
    };
    let withdraw = Withdraw {
        basic: BasicInstruction {
            token: ETH_ADDRESS(),
            amount: 2500000000000000000, // 5 ETH
            user: USER_ADDRESS(),
        },
        context: Option::None,
    };
    
    // Create protocol instructions
    // instructions have to be split in order to get the correct funding flow,
    // else user is expected to have everything to go at step one, but here we repay with what we borrow.
    let mut protocol_instructions = array![];
    protocol_instructions.append(ProtocolInstructions {
        protocol_name: 'nostra',
        instructions: array![LendingInstruction::Deposit(deposit), LendingInstruction::Borrow(borrow)].span(),
    });
    protocol_instructions.append(ProtocolInstructions {
        protocol_name: 'nostra',
        instructions: array![LendingInstruction::Repay(repay), LendingInstruction::Withdraw(withdraw)].span(),
    });
    
    println!("Processing instructions through router");

    let authorizations = context.router_dispatcher.get_authorizations_for_instructions(protocol_instructions.span());
    println!("Authorizations: {:?}", authorizations);
    println!("USDC DEBT TOKEN: {:?}", USDC_DEBT_TOKEN());
    for authorization in authorizations {
        let (token, selector, call_data) = authorization;
        cheat_caller_address(*token, USER_ADDRESS(), CheatSpan::TargetCalls(1));
        println!("Calling {:?} {:?} with {:?}", token, selector, call_data);
        let result = call_contract_syscall(*token, *selector, call_data.span());
        assert(result.is_ok(), 'call failed');
    }
    let erc20 = IERC20Dispatcher { contract_address: ETH_ADDRESS() };
    let eth_balance = erc20.balance_of(USER_ADDRESS());

    cheat_caller_address(context.router_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    context.router_dispatcher.process_protocol_instructions(protocol_instructions.span());

    let eth_balance_after = erc20.balance_of(USER_ADDRESS());
    println!("ETH balance before: {:?}", eth_balance);
    println!("ETH balance after: {:?}", eth_balance_after);
    assert(eth_balance-2500000000000000000 == eth_balance_after, 'ETH balance not increased');
} 


use kapan::gateways::VesuGateway::VesuContext;
const POOL_ID: felt252 =
    2198503327643286920898110335698706244522220458610657370981979460625005526824;

#[test]
#[ignore]
#[fork("MAINNET_LATEST")]
fn test_vesu() {
    let context = setup_test_context();
    
    // Register gateways with router
    cheat_caller_address(context.router_address, USER_ADDRESS(), CheatSpan::TargetCalls(2));
    let router = RouterGatewayTraitDispatcher { contract_address: context.router_address };
    println!("Adding NostraGateway to router");
    router.add_gateway('nostra', context.nostra_gateway_address);
    println!("Adding VesuGateway to router");
    router.add_gateway('vesu', context.vesu_gateway_address);
    
    // Create a deposit instruction for Nostra
    let mut borrow_array = array![];
    VesuContext { pool_id: POOL_ID, position_counterpart_token: ETH_ADDRESS() }.serialize(ref borrow_array);
    let mut withdraw_context = array![];
    VesuContext { pool_id: POOL_ID, position_counterpart_token: USDC_ADDRESS() }.serialize(ref withdraw_context);
    
    let deposit = Deposit {
        basic: BasicInstruction {
            token: ETH_ADDRESS(),
            amount: 5000000000000000000, // 5 ETH
            user: USER_ADDRESS(),
        },
        context: Option::None,
    };
    let borrow = Borrow {
        basic: BasicInstruction {
            token: USDC_ADDRESS(),
            amount: 200000000, // 10 USDC
            user: USER_ADDRESS(),
        },
        context: Option::Some(borrow_array.span()),
    };
    let repay = Repay {
        basic: BasicInstruction {
            token: USDC_ADDRESS(),
            amount: 50000000, // 10 USDC
            user: USER_ADDRESS(),
        },
        context: Option::Some(borrow_array.span()),
    };
    let withdraw = Withdraw {
        basic: BasicInstruction {
            token: ETH_ADDRESS(),
            amount: 2500000000000000000, // 5 ETH
            user: USER_ADDRESS(),
        },
        context: Option::Some(withdraw_context.span()),
    };
    
    // Create protocol instructions
    // instructions have to be split in order to get the correct funding flow,
    // else user is expected to have everything to go at step one, but here we repay with what we borrow.
    let mut protocol_instructions = array![];
    protocol_instructions.append(ProtocolInstructions {
        protocol_name: 'vesu',
        instructions: array![LendingInstruction::Deposit(deposit), LendingInstruction::Borrow(borrow)].span(),
    });
    protocol_instructions.append(ProtocolInstructions {
        protocol_name: 'vesu',
        instructions: array![LendingInstruction::Repay(repay), LendingInstruction::Withdraw(withdraw)].span(),
    });
    
    println!("Processing instructions through router");

    let authorizations = context.router_dispatcher.get_authorizations_for_instructions(protocol_instructions.span());
    println!("Authorizations: {:?}", authorizations);
    println!("USDC DEBT TOKEN: {:?}", USDC_DEBT_TOKEN());
    for authorization in authorizations {
        let (token, selector, call_data) = authorization;
        cheat_caller_address(*token, USER_ADDRESS(), CheatSpan::TargetCalls(1));
        println!("Calling {:?} {:?} with {:?}", token, selector, call_data);
        let result = call_contract_syscall(*token, *selector, call_data.span());
        assert(result.is_ok(), 'call failed');
    }
    let erc20 = IERC20Dispatcher { contract_address: ETH_ADDRESS() };
    let eth_balance = erc20.balance_of(USER_ADDRESS());

    cheat_caller_address(context.router_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    context.router_dispatcher.process_protocol_instructions(protocol_instructions.span());

    let eth_balance_after = erc20.balance_of(USER_ADDRESS());
    println!("ETH balance before: {:?}", eth_balance);
    println!("ETH balance after: {:?}", eth_balance_after);
    let expected_balance = eth_balance - 2500000000000000000;
    let balance_diff = if eth_balance_after > expected_balance {
        eth_balance_after - expected_balance
    } else {
        expected_balance - eth_balance_after
    };
    println!("Balance diff: {:?}", balance_diff);
    assert(balance_diff < 1000000000000000, 'ETH balance not as expected'); // Allow small difference of 0.001 ETH
} 

#[test]
#[fork("MAINNET_LATEST")]
fn test_move_debt() {
    let context = setup_test_context();
    
    // Register gateways with router
    cheat_caller_address(context.router_address, USER_ADDRESS(), CheatSpan::TargetCalls(2));
    let router = RouterGatewayTraitDispatcher { contract_address: context.router_address };
    router.add_gateway('nostra', context.nostra_gateway_address);
    router.add_gateway('vesu', context.vesu_gateway_address);
    
    // First create a position in Nostra
    let deposit = Deposit {
        basic: BasicInstruction {
            token: ETH_ADDRESS(),
            amount: 5000000000000000000, // 5 ETH
            user: USER_ADDRESS(),
        },
        context: Option::None,
    };
    
    let borrow = Borrow {
        basic: BasicInstruction {
            token: USDC_ADDRESS(),
            amount: 200000000, // 200 USDC
            user: USER_ADDRESS(),
        },
        context: Option::None,
    };
    
    // Create and process initial position
    let mut initial_instructions = array![];
    initial_instructions.append(ProtocolInstructions {
        protocol_name: 'nostra',
        instructions: array![LendingInstruction::Deposit(deposit), LendingInstruction::Borrow(borrow)].span(),
    });
    
    // Get and process authorizations
    let authorizations = context.router_dispatcher.get_authorizations_for_instructions(initial_instructions.span());
    for authorization in authorizations {
        let (token, selector, call_data) = authorization;
        cheat_caller_address(*token, USER_ADDRESS(), CheatSpan::TargetCalls(1));
        let result = call_contract_syscall(*token, *selector, call_data.span());
        assert(result.is_ok(), 'call failed');
    }
    // Process initial position
    cheat_caller_address(context.router_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    context.router_dispatcher.process_protocol_instructions(initial_instructions.span());
    
    // Now create instructions to move debt to Vesu
    let mut move_debt_instructions = array![];
    
    // First repay in Nostra
    let repay = Repay {
        basic: BasicInstruction {
            token: USDC_ADDRESS(),
            amount: 200000000, // 200 USDC
            user: USER_ADDRESS(),
        },
        context: Option::None,
    };
    
    // Then borrow in Vesu
    let mut vesu_context = array![];
    VesuContext { pool_id: POOL_ID, position_counterpart_token: ETH_ADDRESS() }.serialize(ref vesu_context);
    
    let vesu_borrow = Borrow {
        basic: BasicInstruction {
            token: USDC_ADDRESS(),
            amount: 200000000, // 200 USDC
            user: USER_ADDRESS(),
        },
        context: Option::Some(vesu_context.span()),
    };
    
    move_debt_instructions.append(ProtocolInstructions {
        protocol_name: 'nostra',
        instructions: array![LendingInstruction::Repay(repay)].span(),
    });
    
    move_debt_instructions.append(ProtocolInstructions {
        protocol_name: 'vesu',
        instructions: array![LendingInstruction::Borrow(vesu_borrow)].span(),
    });
    
    // Get and process authorizations for move debt
    let move_debt_authorizations = context.router_dispatcher.get_authorizations_for_instructions(move_debt_instructions.span());
    for authorization in move_debt_authorizations {
        let (token, selector, call_data) = authorization;
        cheat_caller_address(*token, USER_ADDRESS(), CheatSpan::TargetCalls(1));
        let result = call_contract_syscall(*token, *selector, call_data.span());
        assert(result.is_ok(), 'call failed');
    }
    
    println!("Processing move debt");
    // Process move debt
    cheat_caller_address(context.router_address, USER_ADDRESS(), CheatSpan::TargetCalls(1));
    context.router_dispatcher.move_debt(move_debt_instructions.span());
} 