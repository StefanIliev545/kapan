use kapan::interfaces::IGateway::{ILendingInstructionProcessorDispatcher, ILendingInstructionProcessorDispatcherTrait, LendingInstruction};
use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
use openzeppelin::utils::serde::SerializedAppend;
use snforge_std::{CheatSpan, ContractClassTrait, DeclareResultTrait, cheat_caller_address, declare};
use starknet::{ContractAddress, contract_address_const};

// Real contract address deployed on Sepolia
fn SINGLETON_ADDRESS() -> ContractAddress {
    contract_address_const::<0x2545b2e5d519fc230e9cd781046d3a64e092114f07e44771e0d719d148725ef>()
}

const POOL_ID: felt252 =
    2198503327643286920898110335698706244522220458610657370981979460625005526824;

const ETH_CONTRACT_ADDRESS: felt252 =
    0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7;

fn deploy_vesu_gateway(name: ByteArray) -> ContractAddress {
    let contract_class = declare(name).unwrap().contract_class();
    let mut calldata = array![];
    calldata.append_serde(SINGLETON_ADDRESS());
    calldata.append_serde(POOL_ID);
    let (contract_address, _) = contract_class.deploy(@calldata).unwrap();
    contract_address
}

#[test]
#[fork("MAINNET_LATEST")]
fn test_set_greetings() {
    let contract_address = deploy_vesu_gateway("VesuGateway");
    let dispatcher = ILendingInstructionProcessorDispatcher { contract_address };
}