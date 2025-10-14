use core::traits::Drop;
use starknet::{ContractAddress, contract_address_const};
use kapan::gateways::VesuGatewayV2::{
    IVesuViewerDispatcher, IVesuViewerDispatcherTrait, IVesuGatewayAdminDispatcher, IVesuGatewayAdminDispatcherTrait,
};
use snforge_std::{declare, ContractClassTrait, DeclareResultTrait, cheat_caller_address, CheatSpan};
use core::array::ArrayTrait;
use openzeppelin::utils::serde::SerializedAppend;

// Token addresses (same as mainnet)
fn ETH_ADDRESS() -> ContractAddress {
    contract_address_const::<0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7>()
}

fn WBTC_ADDRESS() -> ContractAddress {
    contract_address_const::<0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac>()
}

fn USDC_ADDRESS() -> ContractAddress {
    contract_address_const::<0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8>()
}

fn USDT_ADDRESS() -> ContractAddress {
    contract_address_const::<0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8>()
}

fn STRK_ADDRESS() -> ContractAddress {
    contract_address_const::<0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d>()
}

fn WSTETH_ADDRESS() -> ContractAddress {
    contract_address_const::<0x0057912720381af14b0e5c87aa4718ed5e527eab60b3801ebf702ab09139e38b>()
}

// V2 Pool and Oracle addresses
fn V2_DEFAULT_POOL_ADDRESS() -> ContractAddress {
    contract_address_const::<0x451fe483d5921a2919ddd81d0de6696669bccdacd859f72a4fba7656b97c3b5>()
}

fn V2_ORACLE_ADDRESS() -> ContractAddress {
    contract_address_const::<0xfe4bfb1b353ba51eb34dff963017f94af5a5cf8bdf3dfc191c504657f3c05>()
}

fn V2_POOL_FACTORY_ADDRESS() -> ContractAddress {
    contract_address_const::<0x3760f903a37948f97302736f89ce30290e45f441559325026842b7a6fb388c0>()
}

fn USER_ADDRESS() -> ContractAddress {
    contract_address_const::<0x0113c67ed78bc280887234fe5ed5e77272465317978ae86c25a71531d9332a2d>()
}

// Deploy VesuGatewayV2
fn deploy_vesu_gateway_v2(router: ContractAddress) -> ContractAddress {
    let contract_class = declare("VesuGatewayV2").unwrap().contract_class();
    let mut calldata = array![];
    calldata.append_serde(V2_DEFAULT_POOL_ADDRESS());
    calldata.append_serde(router);
    calldata.append_serde(USER_ADDRESS());
    calldata.append_serde(V2_POOL_FACTORY_ADDRESS());
    let (contract_address, _) = contract_class.deploy(@calldata).unwrap();
    contract_address
}

#[test]
#[fork("MAINNET_LATEST")]
fn test_vesu_v2_deployment_and_assets() {
    // Deploy VesuGatewayV2
    let router = USER_ADDRESS(); // Use USER_ADDRESS as router
    let vesu_gateway_v2_address = deploy_vesu_gateway_v2(router);
    let vesu_gateway_v2 = IVesuViewerDispatcher { contract_address: vesu_gateway_v2_address };
    
    // Initialize pool allowlists
    let admin_dispatcher = IVesuGatewayAdminDispatcher { contract_address: vesu_gateway_v2_address };
    
    // Cheat caller to be the owner (USER_ADDRESS)
    cheat_caller_address(vesu_gateway_v2_address, USER_ADDRESS(), CheatSpan::TargetCalls(3));
    
    // Add pool
    admin_dispatcher.add_pool(V2_DEFAULT_POOL_ADDRESS());
    
    // Add collaterals
    let mut collaterals = array![];
    collaterals.append(ETH_ADDRESS());
    collaterals.append(WBTC_ADDRESS());
    collaterals.append(USDC_ADDRESS());
    collaterals.append(USDT_ADDRESS());
    collaterals.append(STRK_ADDRESS());
    collaterals.append(WSTETH_ADDRESS());
    admin_dispatcher.add_pool_collaterals(V2_DEFAULT_POOL_ADDRESS(), collaterals);
    
    // Add debts
    let mut debts = array![];
    debts.append(USDC_ADDRESS());
    debts.append(USDT_ADDRESS());
    debts.append(STRK_ADDRESS());
    admin_dispatcher.add_pool_debts(V2_DEFAULT_POOL_ADDRESS(), debts);
    
    // Test that we can get supported assets
    let supported_assets = vesu_gateway_v2.get_supported_assets_ui(V2_DEFAULT_POOL_ADDRESS());
    
    // Verify we got assets back
    assert(supported_assets.len() > 0, 'Should have supported assets');
    
    // Check that ETH is in the supported assets
    let mut eth_found = false;
    let mut wbtc_found = false;
    let mut usdc_found = false;
    
    let len = supported_assets.len();
    for i in 0..len {
        let asset = supported_assets.at(i);
        if *asset.address == ETH_ADDRESS() {
            eth_found = true;
            // Verify ETH has proper metadata
            assert(*asset.symbol != 0, 'ETH symbol should not be zero');
            assert(*asset.decimals > 0, 'ETH decimals should be > 0');
            assert(*asset.price.value > 0, 'ETH price should be > 0');
        };
        if *asset.address == WBTC_ADDRESS() {
            wbtc_found = true;
        };
        if *asset.address == USDC_ADDRESS() {
            usdc_found = true;
        };
    };
    
    assert(eth_found, 'eth-not-found');
    assert(wbtc_found, 'wbtc-not-found');
    assert(usdc_found, 'usdc-not-found');
    
    println!("VesuGatewayV2 deployment and asset configuration successful!");
    println!("Found {} supported assets", supported_assets.len());
}

#[test]
#[fork("MAINNET_LATEST")]
fn test_vesu_v2_eth_price() {
    // Deploy VesuGatewayV2
    let router = USER_ADDRESS(); // Use USER_ADDRESS as router
    let vesu_gateway_v2_address = deploy_vesu_gateway_v2(router);
    let vesu_gateway_v2 = IVesuViewerDispatcher { contract_address: vesu_gateway_v2_address };
    
    // Initialize pool allowlists
    let admin_dispatcher = IVesuGatewayAdminDispatcher { contract_address: vesu_gateway_v2_address };
    
    // Cheat caller to be the owner (USER_ADDRESS)
    cheat_caller_address(vesu_gateway_v2_address, USER_ADDRESS(), CheatSpan::TargetCalls(3));
    
    // Add pool
    admin_dispatcher.add_pool(V2_DEFAULT_POOL_ADDRESS());
    
    // Add collaterals
    let mut collaterals = array![];
    collaterals.append(ETH_ADDRESS());
    collaterals.append(WBTC_ADDRESS());
    collaterals.append(USDC_ADDRESS());
    collaterals.append(USDT_ADDRESS());
    collaterals.append(STRK_ADDRESS());
    collaterals.append(WSTETH_ADDRESS());
    admin_dispatcher.add_pool_collaterals(V2_DEFAULT_POOL_ADDRESS(), collaterals);
    
    // Add debts
    let mut debts = array![];
    debts.append(USDC_ADDRESS());
    debts.append(USDT_ADDRESS());
    debts.append(STRK_ADDRESS());
    admin_dispatcher.add_pool_debts(V2_DEFAULT_POOL_ADDRESS(), debts);
    
    // Test ETH price fetching
    let eth_price = vesu_gateway_v2.get_asset_price(ETH_ADDRESS(), V2_DEFAULT_POOL_ADDRESS());
    
    // Verify price is valid and non-zero
    assert(eth_price > 0, 'eth-price-not-found');
    
    println!("ETH price fetched successfully: {}", eth_price);
    println!("v2-oracle-integration-working");
}