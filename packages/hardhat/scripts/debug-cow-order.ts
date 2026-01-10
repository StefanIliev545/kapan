import { ethers } from "hardhat";

/**
 * Debug why a CoW order isn't filling by simulating the hooks
 */

const ORDER_MANAGER = "0x0Cd20Ac8d9Db833950563934992C440460826628";
const ADAPTER = "0x183BEF51d5E0892cB4dfa08fb76DDb0Ddcf2a0FB";
const USER = "0xa9b108038567f76f55219c630bb0e590b748790d";
const SALT = "0x4e54a9ab0a583d933fd843bcfb7f01b574a5545b3d1503dee131a6bf36b2b27b";
const MORPHO = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

async function main() {
    console.log("\n=== Debug CoW Order Fill ===\n");
    
    // Get order hash
    const orderManager = await ethers.getContractAt(
        ["function userSaltToOrderHash(address,bytes32) view returns (bytes32)"],
        ORDER_MANAGER
    );
    const orderHash = await orderManager.userSaltToOrderHash(USER, SALT);
    console.log("Order Hash:", orderHash);
    
    // Check if Morpho is registered on adapter
    const adapter = await ethers.getContractAt(
        [
            "function allowedLenders(address) view returns (bool)",
            "function lenderTypes(address) view returns (uint8)"
        ],
        ADAPTER
    );
    
    const isAllowed = await adapter.allowedLenders(MORPHO);
    const lenderType = await adapter.lenderTypes(MORPHO);
    console.log("\nMorpho on Adapter:");
    console.log("  Allowed:", isAllowed);
    console.log("  LenderType:", lenderType, "(0=Unknown, 1=Aave, 2=Morpho, 3=BalancerV2, 4=BalancerV3)");
    
    if (!isAllowed) {
        console.log("\n❌ PROBLEM: Morpho is NOT registered as allowed lender on adapter!");
        return;
    }
    
    // Check Morpho liquidity for USDC
    const morpho = await ethers.getContractAt(
        ["function totalSupplyAssets(bytes32) view returns (uint256)"],
        MORPHO
    );
    
    // Try to simulate fundOrder
    console.log("\n--- Simulating fundOrder ---");
    const fundOrderData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address", "uint256"],
        [USDC, ORDER_MANAGER, ethers.parseUnits("13.65", 6)]
    );
    console.log("fundOrder calldata:", "0xba4d4392" + fundOrderData.slice(2));
    
    // Check VaultRelayer approval on OrderManager
    const settlement = "0x9008D19f58AAbD9eD0D60971565AA8510560ab41";
    const vaultRelayer = await ethers.getContractAt(
        ["function vaultRelayer() view returns (address)"],
        settlement
    );
    const relayerAddr = await vaultRelayer.vaultRelayer();
    console.log("\nVault Relayer:", relayerAddr);
    
    const usdc = await ethers.getContractAt(
        ["function allowance(address,address) view returns (uint256)"],
        USDC
    );
    const allowance = await usdc.allowance(ORDER_MANAGER, relayerAddr);
    console.log("OrderManager USDC allowance to VaultRelayer:", ethers.formatUnits(allowance, 6));
    
    if (allowance === 0n) {
        console.log("\n❌ PROBLEM: OrderManager hasn't approved VaultRelayer to pull USDC!");
    }
    
    console.log("\n=== Summary ===");
    console.log("Check CoW solver logs for more details on why order isn't being picked up.");
}

main().catch(console.error);
