const { ethers } = require("hardhat");

const TX_HASH = "0x692a8afa2c6e3274b228c3ea426967672226072f4a8eb9c1cd6eab2e100eb4d4";

// Contract addresses
const CONDITIONAL_ORDER_MANAGER = "0xAEC73Dd36D7D9749bBE8d9FF15F674A58d6Db4c3";
const LTV_TRIGGER = "0x06043DE2c27EA37c6B7fBe7d09c2D830D4a31e9c";

// CoW API for Arbitrum (production)
const COW_API = "https://api.cow.fi/arbitrum_one/api/v1";

// Deterministic JSON stringify (same as json-stringify-deterministic)
function deterministicStringify(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(deterministicStringify).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + deterministicStringify(obj[k])).join(',') + '}';
}

async function main() {
  const provider = ethers.provider;

  console.log("=== Submitting Order to CoW API ===\n");

  // Get the order hash from transaction
  const receipt = await provider.getTransactionReceipt(TX_HASH);
  const conditionalOrderManager = await ethers.getContractAt(
    "KapanConditionalOrderManager",
    CONDITIONAL_ORDER_MANAGER
  );

  let orderHash = null;
  let orderSalt = null;
  for (const log of receipt.logs) {
    try {
      const parsed = conditionalOrderManager.interface.parseLog(log);
      if (parsed && parsed.name === "ConditionalOrderCreated") {
        orderHash = parsed.args.orderHash;
        break;
      }
    } catch {}
  }

  if (!orderHash) {
    console.log("No order hash found");
    return;
  }

  console.log(`Order hash: ${orderHash}`);

  // Get order details
  const order = await conditionalOrderManager.getOrder(orderHash);
  const ltvTrigger = await ethers.getContractAt("LtvTrigger", LTV_TRIGGER);
  const triggerParams = await ltvTrigger.decodeTriggerParams(order.params.triggerStaticData);

  // Get the salt from the orderSalts mapping
  orderSalt = await conditionalOrderManager.orderSalts(orderHash);
  const user = order.params.user;

  console.log("\n=== Order Params ===");
  console.log(`User: ${user}`);
  console.log(`Salt: ${orderSalt}`);
  console.log(`Sell token: ${order.params.sellToken}`);
  console.log(`Buy token: ${order.params.buyToken}`);
  console.log(`AppData hash: ${order.params.appDataHash}`);

  // Get tradeable order
  const staticInput = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [orderHash]);
  const tradeableOrder = await conditionalOrderManager.getTradeableOrder(
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroHash,
    staticInput,
    "0x"
  );

  console.log("\n=== Tradeable Order ===");
  console.log(`Sell amount: ${ethers.formatUnits(tradeableOrder.sellAmount, triggerParams.collateralDecimals)}`);
  console.log(`Buy amount: ${ethers.formatUnits(tradeableOrder.buyAmount, triggerParams.debtDecimals)}`);
  console.log(`Receiver: ${tradeableOrder.receiver}`);
  console.log(`Valid to: ${tradeableOrder.validTo}`);
  console.log(`App data: ${tradeableOrder.appData}`);

  // Map kind bytes32 to string
  const kindBuy = ethers.keccak256(ethers.toUtf8Bytes("buy"));
  let kindStr = "sell";
  if (tradeableOrder.kind === kindBuy) {
    kindStr = "buy";
  }

  // Map balance types
  const balanceInternal = ethers.keccak256(ethers.toUtf8Bytes("internal"));
  const balanceExternal = ethers.keccak256(ethers.toUtf8Bytes("external"));

  let sellTokenBalanceStr = "erc20";
  if (tradeableOrder.sellTokenBalance === balanceInternal) {
    sellTokenBalanceStr = "internal";
  } else if (tradeableOrder.sellTokenBalance === balanceExternal) {
    sellTokenBalanceStr = "external";
  }

  let buyTokenBalanceStr = "erc20";
  if (tradeableOrder.buyTokenBalance === balanceInternal) {
    buyTokenBalanceStr = "internal";
  } else if (tradeableOrder.buyTokenBalance === balanceExternal) {
    buyTokenBalanceStr = "external";
  }

  const owner = CONDITIONAL_ORDER_MANAGER;

  // Reconstruct appData using the same pattern as frontend
  console.log("\n=== Reconstructing AppData (Frontend Pattern) ===");

  // The frontend calls executePreHookBySalt/executePostHookBySalt on the OrderManager
  const hookIface = new ethers.Interface([
    "function executePreHookBySalt(address user, bytes32 salt) external",
    "function executePostHookBySalt(address user, bytes32 salt) external",
  ]);

  const preHookCalldata = hookIface.encodeFunctionData("executePreHookBySalt", [user, orderSalt]);
  const postHookCalldata = hookIface.encodeFunctionData("executePostHookBySalt", [user, orderSalt]);

  console.log(`Pre-hook calldata: ${preHookCalldata}`);
  console.log(`Post-hook calldata: ${postHookCalldata}`);

  // Build appData in the exact format the frontend uses
  const appData = {
    version: "1.10.0",
    appCode: "kapan",
    metadata: {
      hooks: {
        pre: [{
          target: CONDITIONAL_ORDER_MANAGER,
          callData: preHookCalldata,
          gasLimit: "800000",
        }],
        post: [{
          target: CONDITIONAL_ORDER_MANAGER,
          callData: postHookCalldata,
          gasLimit: "1750000",
        }],
      },
    },
  };

  // Use deterministic stringify
  const appDataJson = deterministicStringify(appData);
  console.log(`\nAppData JSON: ${appDataJson}`);

  // Compute hash
  const computedAppDataHash = ethers.keccak256(ethers.toUtf8Bytes(appDataJson));
  console.log(`\nComputed appData hash: ${computedAppDataHash}`);
  console.log(`Stored appData hash:   ${order.params.appDataHash}`);

  if (computedAppDataHash === order.params.appDataHash) {
    console.log("✅ AppData hash MATCHES!");
  } else {
    console.log("⚠️  AppData hash mismatch");
    console.log("   Trying to find the correct format...");
  }

  // Push the appData to API
  console.log(`\n=== Pushing AppData to CoW API ===`);
  console.log(`URL: ${COW_API}/app_data`);

  try {
    const appDataResponse = await fetch(`${COW_API}/app_data`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fullAppData: appDataJson }),
    });

    const appDataResponseText = await appDataResponse.text();
    console.log(`Status: ${appDataResponse.status}`);
    console.log(`Response: ${appDataResponseText}`);

    // Extract the hash from response
    try {
      const parsed = JSON.parse(appDataResponseText);
      if (parsed.appDataHash) {
        console.log(`API computed hash: ${parsed.appDataHash}`);
      }
    } catch {}
  } catch (e) {
    console.log(`AppData push error: ${e.message}`);
  }

  // Build order for API using the stored appDataHash
  const apiOrder = {
    sellToken: tradeableOrder.sellToken,
    buyToken: tradeableOrder.buyToken,
    receiver: tradeableOrder.receiver === ethers.ZeroAddress ? owner : tradeableOrder.receiver,
    sellAmount: tradeableOrder.sellAmount.toString(),
    buyAmount: tradeableOrder.buyAmount.toString(),
    validTo: Number(tradeableOrder.validTo),
    appData: order.params.appDataHash,
    feeAmount: "0",
    kind: kindStr,
    partiallyFillable: tradeableOrder.partiallyFillable,
    sellTokenBalance: sellTokenBalanceStr,
    buyTokenBalance: buyTokenBalanceStr,
    signingScheme: "eip1271",
    signature: staticInput,
    from: owner,
  };

  console.log("\n=== API Order ===");
  console.log(JSON.stringify(apiOrder, null, 2));

  // Submit to CoW API
  console.log("\n=== Submitting to CoW API ===");
  console.log(`URL: ${COW_API}/orders`);

  try {
    const response = await fetch(`${COW_API}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(apiOrder),
    });

    const responseText = await response.text();
    console.log(`\nStatus: ${response.status}`);

    try {
      const responseJson = JSON.parse(responseText);
      console.log(`Response: ${JSON.stringify(responseJson, null, 2)}`);
    } catch {
      console.log(`Response: ${responseText}`);
    }

    if (response.ok) {
      console.log("\n✅ Order submitted successfully!");
    } else {
      console.log("\n❌ Order submission failed");
    }
  } catch (e) {
    console.log(`\nFetch error: ${e.message}`);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
