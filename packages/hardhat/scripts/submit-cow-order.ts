import { ethers } from "hardhat";

/**
 * Submit a CoW conditional order to the API
 * 
 * This script:
 * 1. Fetches order state from KapanOrderManager
 * 2. Gets the current tradeable order from KapanOrderHandler
 * 3. Builds the ERC-1271 signature
 * 4. Registers appData if needed
 * 5. Submits to CoW API
 * 
 * Usage:
 *   SALT=0x... USER=0x... npx hardhat run scripts/submit-cow-order.ts --network base
 *   
 * Environment:
 *   SALT - Order salt (bytes32)
 *   USER - User address
 *   API - "prod" or "barn" (default: barn)
 */

// Contract addresses (Base)
const ADDRESSES = {
  orderManager: "0xD4004404fBc1dD4dB3428086abFCb30684F37610",
  orderHandler: "0xa1fc1baac017c9cfd4fe270bfd7f24ad05c40e01",
  composableCoW: "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74",
};

// GPv2Order type constants
const GPV2_KIND_SELL = "0x6ed88e868af0a1983e3886d5f3e95a2fafbd6c3450bc229e27342283dc429ccc";
const GPV2_KIND_BUY = "0x68d9e920d9f5f88a7b1f3a9b6a0e5f95a9a6e8d7b6c5f4e3d2c1b0a9f8e7d6c5";
const GPV2_BALANCE_ERC20 = "0x5a28e9363bb942b639270062aa6bb295f434bcdfc42c97267bf003f272060dc9";

// API URLs
const API_URLS: Record<string, Record<number, string>> = {
  prod: {
    8453: "https://api.cow.fi/base",
    1: "https://api.cow.fi/mainnet",
    42161: "https://api.cow.fi/arbitrum_one",
  },
  barn: {
    8453: "https://barn.api.cow.fi/base",
    1: "https://barn.api.cow.fi/mainnet",
    42161: "https://barn.api.cow.fi/arbitrum_one",
  },
};

interface GPv2OrderData {
  sellToken: string;
  buyToken: string;
  receiver: string;
  sellAmount: bigint;
  buyAmount: bigint;
  validTo: number;
  appData: string;
  feeAmount: bigint;
  kind: string;
  partiallyFillable: boolean;
  sellTokenBalance: string;
  buyTokenBalance: string;
}

async function main() {
  const salt = process.env.SALT;
  const user = process.env.USER;
  const apiEnv = process.env.API || "barn";
  
  if (!salt || !user) {
    console.error("Usage: SALT=0x... USER=0x... npx hardhat run scripts/submit-cow-order.ts --network base");
    process.exit(1);
  }
  
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  console.log(`\n=== Submit CoW Order ===`);
  console.log(`Chain: ${chainId}`);
  console.log(`User: ${user}`);
  console.log(`Salt: ${salt}`);
  console.log(`API: ${apiEnv}`);
  
  const apiUrl = API_URLS[apiEnv]?.[chainId];
  if (!apiUrl) {
    console.error(`No API URL for chain ${chainId} and env ${apiEnv}`);
    process.exit(1);
  }
  console.log(`API URL: ${apiUrl}`);
  
  // Get contracts
  const orderManager = await ethers.getContractAt([
    "function getOrder(bytes32 orderHash) view returns (tuple(tuple(address user, bytes[] preInstructionsPerIteration, uint256 preTotalAmount, address sellToken, address buyToken, uint256 chunkSize, uint256 minBuyPerChunk, bytes[] postInstructionsPerIteration, uint8 completion, uint256 targetValue, uint256 minHealthFactor, bytes32 appDataHash, bool isFlashLoanOrder, bool isKindBuy) params, uint8 status, uint256 executedAmount, uint256 iterationCount, uint256 createdAt))",
    "function userSaltToOrderHash(address user, bytes32 salt) view returns (bytes32)",
  ], ADDRESSES.orderManager);
  
  const orderHandler = await ethers.getContractAt([
    "function getTradeableOrder(address owner, address sender, bytes32 ctx, bytes calldata staticInput, bytes calldata offchainInput) view returns (tuple(address sellToken, address buyToken, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, bytes32 kind, bool partiallyFillable, bytes32 sellTokenBalance, bytes32 buyTokenBalance))",
  ], ADDRESSES.orderHandler);
  
  // Step 1: Get order hash and context
  console.log(`\n--- Step 1: Fetch Order ---`);
  const orderHash = await orderManager.userSaltToOrderHash(user, salt);
  console.log(`Order hash: ${orderHash}`);
  
  if (orderHash === ethers.ZeroHash) {
    console.error("Order not found for this user/salt combination");
    process.exit(1);
  }
  
  const orderCtx = await orderManager.getOrder(orderHash);
  console.log(`Status: ${["None", "Active", "Completed", "Cancelled"][orderCtx.status]}`);
  console.log(`Iterations: ${orderCtx.iterationCount}`);
  console.log(`SellToken: ${orderCtx.params.sellToken}`);
  console.log(`BuyToken: ${orderCtx.params.buyToken}`);
  console.log(`AppDataHash: ${orderCtx.params.appDataHash}`);
  console.log(`isFlashLoanOrder: ${orderCtx.params.isFlashLoanOrder}`);
  console.log(`isKindBuy: ${orderCtx.params.isKindBuy}`);
  
  if (Number(orderCtx.status) !== 1) {
    console.error(`Order is not active (status=${orderCtx.status})`);
    process.exit(1);
  }
  
  // Step 2: Get tradeable order from handler
  console.log(`\n--- Step 2: Get Tradeable Order ---`);
  // IMPORTANT: staticInput contains the orderHash, not the salt!
  const staticInput = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [orderHash]);
  
  const gpv2Order = await orderHandler.getTradeableOrder(
    ADDRESSES.orderManager, // owner
    ethers.ZeroAddress,     // sender
    ethers.ZeroHash,        // ctx
    staticInput,            // staticInput (encoded salt)
    "0x"                    // offchainInput
  );
  
  const order: GPv2OrderData = {
    sellToken: gpv2Order.sellToken,
    buyToken: gpv2Order.buyToken,
    receiver: gpv2Order.receiver,
    sellAmount: gpv2Order.sellAmount,
    buyAmount: gpv2Order.buyAmount,
    validTo: gpv2Order.validTo,
    appData: gpv2Order.appData,
    feeAmount: gpv2Order.feeAmount,
    kind: gpv2Order.kind,
    partiallyFillable: gpv2Order.partiallyFillable,
    sellTokenBalance: gpv2Order.sellTokenBalance,
    buyTokenBalance: gpv2Order.buyTokenBalance,
  };
  
  console.log(`SellToken: ${order.sellToken}`);
  console.log(`BuyToken: ${order.buyToken}`);
  console.log(`Receiver: ${order.receiver}`);
  console.log(`SellAmount: ${order.sellAmount}`);
  console.log(`BuyAmount: ${order.buyAmount}`);
  console.log(`ValidTo: ${order.validTo} (${new Date(Number(order.validTo) * 1000).toISOString()})`);
  console.log(`AppData: ${order.appData}`);
  const kindFromHandler = order.kind === GPV2_KIND_SELL ? "sell" : "buy";
  console.log(`Kind from handler: ${kindFromHandler}`);
  console.log(`isKindBuy in order params: ${orderCtx.params.isKindBuy}`);
  
  if (orderCtx.params.isKindBuy && kindFromHandler === "sell") {
    console.log(`\n⚠️  WARNING: Handler returned KIND_SELL but order has isKindBuy=true!`);
    console.log(`   This means the deployed handler is outdated. Redeploy with:`);
    console.log(`   yarn deploy --tags KapanOrderHandler --network base`);
  }
  
  // Step 3: Build ERC-1271 signature
  console.log(`\n--- Step 3: Build Signature ---`);
  
  // PayloadStruct = (bytes32[] proof, ConditionalOrderParams params, bytes offchainInput)
  // ConditionalOrderParams = (address handler, bytes32 salt, bytes staticInput)
  const signature = ethers.AbiCoder.defaultAbiCoder().encode(
    [
      // GPv2Order.Data
      "tuple(address sellToken, address buyToken, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, bytes32 kind, bool partiallyFillable, bytes32 sellTokenBalance, bytes32 buyTokenBalance)",
      // PayloadStruct
      "tuple(bytes32[] proof, tuple(address handler, bytes32 salt, bytes staticInput) params, bytes offchainInput)",
    ],
    [
      // Order data
      {
        sellToken: order.sellToken,
        buyToken: order.buyToken,
        receiver: order.receiver,
        sellAmount: order.sellAmount,
        buyAmount: order.buyAmount,
        validTo: order.validTo,
        appData: order.appData,
        feeAmount: order.feeAmount,
        kind: order.kind,
        partiallyFillable: order.partiallyFillable,
        sellTokenBalance: order.sellTokenBalance,
        buyTokenBalance: order.buyTokenBalance,
      },
      // Payload - note: staticInput contains orderHash, not salt
      {
        proof: [],
        params: {
          handler: ADDRESSES.orderHandler,
          salt: salt,  // Original salt for ComposableCoW registration
          staticInput: staticInput,  // Contains orderHash for handler lookup
        },
        offchainInput: "0x",
      },
    ]
  );
  
  console.log(`Signature length: ${signature.length} chars`);
  console.log(`Signature preview: ${signature.slice(0, 100)}...`);
  
  // Step 4: Check/Register AppData
  console.log(`\n--- Step 4: Check AppData ---`);
  const appDataHash = order.appData;
  
  // Check if appData exists
  const checkUrl = `${apiUrl}/api/v1/app_data/${appDataHash}`;
  const checkResp = await fetch(checkUrl);
  
  if (checkResp.status === 404) {
    console.log(`AppData not found on ${apiEnv}, trying to sync from prod...`);
    
    // Fetch from prod
    const prodUrl = API_URLS.prod[chainId];
    const prodResp = await fetch(`${prodUrl}/api/v1/app_data/${appDataHash}`);
    
    if (prodResp.ok) {
      const prodData = await prodResp.json();
      console.log(`Found on prod, registering on ${apiEnv}...`);
      
      // Register on target API
      const registerUrl = `${apiUrl}/api/v1/app_data/${appDataHash}`;
      const registerResp = await fetch(registerUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullAppData: prodData.fullAppData }),
      });
      
      if (registerResp.ok) {
        console.log(`AppData registered successfully`);
      } else {
        const error = await registerResp.text();
        console.error(`Failed to register appData: ${error}`);
        process.exit(1);
      }
    } else {
      console.error(`AppData not found on prod either!`);
      process.exit(1);
    }
  } else if (checkResp.ok) {
    console.log(`AppData already registered on ${apiEnv}`);
  } else {
    console.error(`Error checking appData: ${checkResp.status}`);
  }
  
  // Step 5: Submit Order
  console.log(`\n--- Step 5: Submit Order ---`);
  
  const orderPayload = {
    sellToken: order.sellToken,
    buyToken: order.buyToken,
    receiver: order.receiver,
    sellAmount: order.sellAmount.toString(),
    buyAmount: order.buyAmount.toString(),
    validTo: Number(order.validTo),
    appData: order.appData,
    feeAmount: order.feeAmount.toString(),
    kind: order.kind === GPV2_KIND_SELL ? "sell" : "buy",
    partiallyFillable: order.partiallyFillable,
    sellTokenBalance: "erc20",
    buyTokenBalance: "erc20",
    signingScheme: "eip1271",
    from: ADDRESSES.orderManager,
    signature: signature,
  };
  
  console.log(`Submitting to ${apiUrl}/api/v1/orders...`);
  // Use replacer to handle any remaining BigInts
  console.log(`Order payload:`, JSON.stringify(orderPayload, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
  
  const submitResp = await fetch(`${apiUrl}/api/v1/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(orderPayload),
  });
  
  const submitResult = await submitResp.text();
  
  if (submitResp.ok) {
    console.log(`\n=== SUCCESS ===`);
    console.log(`Order UID: ${submitResult}`);
    console.log(`\nView on CoW Explorer:`);
    console.log(`https://explorer.cow.fi/orders/${submitResult}?tab=overview`);
  } else {
    console.error(`\n=== FAILED ===`);
    console.error(`Status: ${submitResp.status}`);
    console.error(`Response: ${submitResult}`);
    
    // Parse and provide helpful error info
    try {
      const errorJson = JSON.parse(submitResult);
      if (errorJson.errorType === "InvalidEip1271Signature") {
        console.error(`\nSignature verification failed!`);
        console.error(`The CoW API computed a different order hash than expected.`);
        console.error(`This usually means the order parameters don't match what getTradeableOrder returns.`);
        console.error(`\nComputed hash: ${errorJson.description?.match(/0x[a-f0-9]+/)?.[0] || "unknown"}`);
      } else if (errorJson.errorType === "InsufficientBalance") {
        console.error(`\nInsufficient balance for order owner!`);
        console.error(`Order owner (${ADDRESSES.orderManager}) needs sellToken balance.`);
        console.error(`SellToken: ${order.sellToken}`);
        console.error(`SellAmount: ${order.sellAmount}`);
        
        if (orderCtx.params.isFlashLoanOrder) {
          console.error(`\n⚠️  This is a flash loan order but CoW is checking sellToken balance.`);
          console.error(`   Flash loans only provide balance override for the flash loan token.`);
          console.error(`   Check if the flash loan token matches sellToken in appData.`);
        }
      }
    } catch {
      // Not JSON, already printed
    }
    
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
