import { ethers } from "hardhat";
import { formatUnits } from "ethers";

async function main() {
  const orderHash = "0x3cc55a77056de2bdc46fb0c17e3df7c2a0b47a97f0fdce8092d4a164cd2cd516";
  const managerAddress = "0x5c2Eb176a178B6Ae56ffB70c55D5BD68496C3e9a";
  const userAddress = "0xDEDB4D230D8b1e9268fd46779a8028d5dAaA8Fa3";
  const routerAddress = "0x42a3E18f8B7656f22ef4738e9751B1034913C238";
  const morphoGatewayAddress = "0x46b1F675277b044a8CC36E9096bc6d7b22e8c7eE";
  const morphoAddress = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";

  const manager = await ethers.getContractAt("KapanConditionalOrderManager", managerAddress);
  const router = await ethers.getContractAt("KapanRouter", routerAddress);

  // Get order context and params
  console.log("=== Order Context ===");
  let ctx: any;
  let params: any;
  try {
    ctx = await manager.getOrder(orderHash);
    params = ctx.params;
    console.log("Status:", ctx.status.toString(), "(0=None, 1=Active, 2=Completed, 3=Cancelled)");
    console.log("Iteration Count:", ctx.iterationCount.toString());
    console.log("Created At:", new Date(Number(ctx.createdAt) * 1000).toISOString());

    console.log("\n=== Order Params ===");
    console.log("User:", params.user);
    console.log("Trigger:", params.trigger);
    console.log("Sell Token:", params.sellToken);
    console.log("Buy Token:", params.buyToken);
    console.log("Max Iterations:", params.maxIterations.toString());
    console.log("Sell Token Refund Address:", params.sellTokenRefundAddress);
    console.log("Is Kind Buy:", params.isKindBuy);
    console.log("Pre Instructions (hex):", params.preInstructions.slice(0, 66) + "...");
    console.log("Post Instructions (hex):", params.postInstructions.slice(0, 66) + "...");
  } catch (e: any) {
    console.log("Error getting order:", e.message);
    return;
  }

  // Try to simulate calculateExecution on the trigger
  console.log("\n=== Trigger Simulation ===");
  try {
    const trigger = await ethers.getContractAt("LimitPriceTrigger", params.trigger);

    const [sellAmount, buyAmount] = await trigger.calculateExecution(params.triggerStaticData, userAddress, 0);
    console.log("Sell Amount:", formatUnits(sellAmount, 6), "(raw:", sellAmount.toString(), ")");
    console.log("Buy Amount:", formatUnits(buyAmount, 8), "(raw:", buyAmount.toString(), ")");

    // Check shouldExecute
    const [shouldExec, reason] = await trigger.shouldExecute(params.triggerStaticData, userAddress);
    console.log("Should Execute:", shouldExec, "-", reason);
  } catch (e: any) {
    console.log("Error simulating trigger:", e.message);
  }

  // Check Morpho authorization
  console.log("\n=== Morpho Authorization ===");
  try {
    const morpho = await ethers.getContractAt(
      ["function isAuthorized(address, address) view returns (bool)"],
      morphoAddress
    );

    const isUserAuthGateway = await morpho.isAuthorized(userAddress, morphoGatewayAddress);
    console.log("User authorized gateway on Morpho:", isUserAuthGateway);
  } catch (e: any) {
    console.log("Error checking Morpho auth:", e.message);
  }

  // Check router delegation
  console.log("\n=== Router Delegation ===");
  try {
    const isDelegated = await router.userDelegates(userAddress, managerAddress);
    console.log("User delegated to Manager:", isDelegated);
  } catch (e: any) {
    console.log("Error checking delegation:", e.message);
  }

  // Try to decode post instructions
  console.log("\n=== Decoded Post Instructions ===");
  try {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const decoded = abiCoder.decode(
      ["tuple(string protocolName, bytes data)[]"],
      params.postInstructions
    );
    console.log("Number of instructions:", decoded[0].length);
    for (let i = 0; i < decoded[0].length; i++) {
      console.log(`[${i}] Protocol: ${decoded[0][i].protocolName}, Data: ${decoded[0][i].data.slice(0, 66)}...`);
    }
  } catch (e: any) {
    console.log("Error decoding instructions:", e.message);
  }
}

main().catch(console.error);
