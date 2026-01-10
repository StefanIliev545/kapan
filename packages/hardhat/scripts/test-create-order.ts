import { ethers } from "hardhat";
import { AbiCoder, keccak256, toUtf8Bytes, parseUnits } from "ethers";

// Base addresses
const KAPAN_ORDER_MANAGER = "0x12F80f5Fff3C0CCC283c7b2A2cC9742ddf8c093A";
const KAPAN_ROUTER = "0xFA3B0Efb7E26CDd22F8b467B153626Ce5d34D64F";

// Test tokens on Base (USDC and WETH)
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WETH = "0x4200000000000000000000000000000000000006";

// Test user address - we'll use a well-funded address for simulation
const TEST_USER = "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc"; // Hardhat account #2

const coder = AbiCoder.defaultAbiCoder();

function encodeInstructions(instructions: any[] = []): string {
  return coder.encode(
    ["tuple(string protocolName, bytes data)[]"],
    [instructions]
  );
}

function generateOrderSalt(): string {
  return keccak256(toUtf8Bytes(`test-order-${Date.now()}`));
}

async function main() {
  console.log("Testing KapanOrderManager.createOrder simulation on Base...\n");
  
  // Get the KapanOrderManager contract
  const orderManager = await ethers.getContractAt(
    "KapanOrderManager",
    KAPAN_ORDER_MANAGER
  );
  
  // Check if orderHandler is set
  const orderHandler = await orderManager.orderHandler();
  console.log("OrderHandler:", orderHandler);
  if (orderHandler === ethers.ZeroAddress) {
    console.error("ERROR: OrderHandler is not set!");
    return;
  }
  
  // Check composableCoW
  const composableCoW = await orderManager.composableCoW();
  console.log("ComposableCoW:", composableCoW);
  
  // Check hooksTrampoline
  const hooksTrampoline = await orderManager.hooksTrampoline();
  console.log("HooksTrampoline:", hooksTrampoline);
  
  // Check router
  const router = await orderManager.router();
  console.log("Router:", router);
  
  console.log("\n--- Building Order Params ---\n");
  
  const salt = generateOrderSalt();
  console.log("Salt:", salt);
  
  const appDataHash = keccak256(toUtf8Bytes("kapan-test-order"));
  console.log("AppDataHash:", appDataHash);
  
  // Simple order params - minimal to test the flow
  const orderParams = {
    user: TEST_USER,
    preInstructionsPerIteration: [encodeInstructions([])], // Empty pre-instructions
    preTotalAmount: parseUnits("1", 6), // 1 USDC
    sellToken: USDC,
    buyToken: WETH,
    chunkSize: parseUnits("1", 6), // 1 USDC per chunk
    minBuyPerChunk: parseUnits("0.0001", 18), // Min WETH
    postInstructionsPerIteration: [encodeInstructions([])], // Empty post-instructions
    completion: 2, // Iterations
    targetValue: 1n,
    minHealthFactor: parseUnits("1.1", 18),
    appDataHash: appDataHash,
    isFlashLoanOrder: false,
  };
  
  console.log("Order Params:");
  console.log("  user:", orderParams.user);
  console.log("  sellToken:", orderParams.sellToken);
  console.log("  buyToken:", orderParams.buyToken);
  console.log("  preTotalAmount:", orderParams.preTotalAmount.toString());
  console.log("  chunkSize:", orderParams.chunkSize.toString());
  console.log("  completion:", orderParams.completion);
  console.log("  isFlashLoanOrder:", orderParams.isFlashLoanOrder);
  
  const seedAmount = 0n; // No seed tokens for this test
  
  console.log("\n--- Encoding Call ---\n");
  
  // Encode the function call
  const calldata = orderManager.interface.encodeFunctionData("createOrder", [
    orderParams,
    salt,
    seedAmount,
  ]);
  
  console.log("Calldata length:", calldata.length);
  console.log("Calldata:", calldata.slice(0, 200) + "...");
  
  console.log("\n--- Simulating with staticCall (from TEST_USER) ---\n");
  
  try {
    // Try to simulate the call
    // This will fail if:
    // 1. User doesn't match msg.sender
    // 2. OrderHandler not set
    // 3. Any other validation fails
    
    // Since we can't impersonate in a script easily, let's use cast
    console.log("Run this command to simulate:");
    console.log("");
    console.log(`cast call ${KAPAN_ORDER_MANAGER} \\`);
    console.log(`  "${calldata}" \\`);
    console.log(`  --from ${TEST_USER} \\`);
    console.log(`  --rpc-url https://mainnet.base.org \\`);
    console.log(`  --trace`);
    console.log("");
    
    // Also show the full cast command for trace
    console.log("Or for full trace with Foundry:");
    console.log("");
    console.log(`cast call ${KAPAN_ORDER_MANAGER} \\`);
    console.log(`  "createOrder((address,bytes[],uint256,address,address,uint256,uint256,bytes[],uint8,uint256,uint256,bytes32,bool),bytes32,uint256)" \\`);
    console.log(`  "(${orderParams.user},[${orderParams.preInstructionsPerIteration.map(x => `"${x}"`).join(",")}],${orderParams.preTotalAmount},${orderParams.sellToken},${orderParams.buyToken},${orderParams.chunkSize},${orderParams.minBuyPerChunk},[${orderParams.postInstructionsPerIteration.map(x => `"${x}"`).join(",")}],${orderParams.completion},${orderParams.targetValue},${orderParams.minHealthFactor},${orderParams.appDataHash},${orderParams.isFlashLoanOrder})" \\`);
    console.log(`  "${salt}" \\`);
    console.log(`  "${seedAmount}" \\`);
    console.log(`  --from ${TEST_USER} \\`);
    console.log(`  --rpc-url https://mainnet.base.org \\`);
    console.log(`  --trace`);
    
  } catch (error: any) {
    console.error("Simulation failed:", error.message);
    if (error.data) {
      console.error("Error data:", error.data);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
