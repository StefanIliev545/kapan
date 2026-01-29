const { ethers } = require("hardhat");

const ORDER_HASH = "0xf69c43f3681eb105799af83f2d758b824399172caceeca79f17770f20251f07e";
const CONDITIONAL_ORDER_MANAGER = "0xAEC73Dd36D7D9749bBE8d9FF15F674A58d6Db4c3";
const LTV_TRIGGER = "0x06043DE2c27EA37c6B7fBe7d09c2D830D4a31e9c";

// CoW API
const COW_API = "https://api.cow.fi/arbitrum_one/api/v1";

// Aave V3 Pool on Arbitrum (flash loan lender)
const AAVE_V3_POOL = "0x794a61358D6845594F94dc1DB02A252b5b4814aD";

// Deterministic JSON stringify (matches json-stringify-deterministic)
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
  console.log("=== Reconstructing and Registering AppData ===\n");

  const manager = await ethers.getContractAt("KapanConditionalOrderManager", CONDITIONAL_ORDER_MANAGER);
  const ltvTrigger = await ethers.getContractAt("LtvTrigger", LTV_TRIGGER);

  // Get order details
  const order = await manager.getOrder(ORDER_HASH);
  const salt = await manager.orderSalts(ORDER_HASH);
  const user = order.params.user;
  const storedAppDataHash = order.params.appDataHash;

  console.log("Order details:");
  console.log("  User:", user);
  console.log("  Salt:", salt);
  console.log("  Stored appDataHash:", storedAppDataHash);

  // Get trigger params for flash loan amount
  const triggerParams = await ltvTrigger.decodeTriggerParams(order.params.triggerStaticData);
  console.log("  Collateral:", triggerParams.collateralToken);
  console.log("  Debt:", triggerParams.debtToken);

  // Get the tradeable order to know the sell amount (flash loan amount)
  const staticInput = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [ORDER_HASH]);
  const tradeableOrder = await manager.getTradeableOrder(
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroHash,
    staticInput,
    "0x"
  );

  const sellAmount = tradeableOrder.sellAmount;
  console.log("  Flash loan amount (sellAmount):", sellAmount.toString());

  // Get KapanCowAdapter from deployments
  let kapanCowAdapter;
  try {
    const adapterDeployment = require("./deployments/arbitrum/KapanCowAdapter.json");
    kapanCowAdapter = adapterDeployment.address;
    console.log("  KapanCowAdapter:", kapanCowAdapter);
  } catch {
    console.log("  KapanCowAdapter: Not found in deployments");
    kapanCowAdapter = null;
  }

  // Encode hook calls
  const hookIface = new ethers.Interface([
    "function executePreHookBySalt(address user, bytes32 salt) external",
    "function executePostHookBySalt(address user, bytes32 salt) external",
  ]);

  const preHookCalldata = hookIface.encodeFunctionData("executePreHookBySalt", [user, salt]);
  const postHookCalldata = hookIface.encodeFunctionData("executePostHookBySalt", [user, salt]);

  // Try different appData configurations to match the stored hash
  const configs = [
    {
      name: "With flash loan (Aave borrower)",
      appData: {
        version: "1.10.0",
        appCode: "kapan:close-position/morpho",
        metadata: {
          hooks: {
            pre: [{
              target: CONDITIONAL_ORDER_MANAGER,
              callData: preHookCalldata,
              gasLimit: "500000",
            }],
            post: [{
              target: CONDITIONAL_ORDER_MANAGER,
              callData: postHookCalldata,
              gasLimit: "1500000",
            }],
          },
          flashloan: {
            liquidityProvider: AAVE_V3_POOL,
            protocolAdapter: kapanCowAdapter || AAVE_V3_POOL,
            receiver: kapanCowAdapter || CONDITIONAL_ORDER_MANAGER,
            token: triggerParams.collateralToken,
            amount: sellAmount.toString(),
          },
        },
      },
    },
    {
      name: "Without flash loan (basic)",
      appData: {
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
      },
    },
    {
      name: "With flash loan (kapan adapter as receiver)",
      appData: {
        version: "1.10.0",
        appCode: "kapan:close-position/morpho",
        metadata: {
          hooks: {
            pre: [{
              callData: preHookCalldata,
              gasLimit: "500000",
              target: CONDITIONAL_ORDER_MANAGER,
            }],
            post: [{
              callData: postHookCalldata,
              gasLimit: "1500000",
              target: CONDITIONAL_ORDER_MANAGER,
            }],
          },
          flashloan: {
            amount: sellAmount.toString(),
            liquidityProvider: AAVE_V3_POOL,
            protocolAdapter: kapanCowAdapter || AAVE_V3_POOL,
            receiver: kapanCowAdapter || CONDITIONAL_ORDER_MANAGER,
            token: triggerParams.collateralToken,
          },
        },
      },
    },
  ];

  console.log("\n=== Trying different appData configurations ===\n");

  for (const config of configs) {
    const json = deterministicStringify(config.appData);
    const hash = ethers.keccak256(ethers.toUtf8Bytes(json));
    const matches = hash === storedAppDataHash;

    console.log(`${config.name}:`);
    console.log(`  Hash: ${hash}`);
    console.log(`  Matches: ${matches ? "✅ YES!" : "❌ No"}`);

    if (matches) {
      console.log(`\n=== FOUND MATCHING CONFIG! ===`);
      console.log(`JSON: ${json}`);
    }
  }

  // Also push the appData we constructed to see what hash the API computes
  console.log("\n=== Pushing appData to API (let API compute hash) ===");

  const basicAppData = {
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

  const basicJson = deterministicStringify(basicAppData);

  try {
    const response = await fetch(`${COW_API}/app_data`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullAppData: basicJson }),
    });

    const responseText = await response.text();
    console.log(`Status: ${response.status}`);
    console.log(`Response: ${responseText}`);

    if (response.ok) {
      const apiHash = JSON.parse(responseText);
      console.log(`\nAPI computed hash: ${apiHash}`);
      console.log(`Stored hash:       ${storedAppDataHash}`);
      console.log(`Match: ${apiHash === storedAppDataHash}`);
    }
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }

  // Try to fetch the stored appData to see what it contains
  console.log("\n=== Fetching stored appData from API ===");
  try {
    const response = await fetch(`${COW_API}/app_data/${storedAppDataHash}`);
    const responseText = await response.text();
    console.log(`Status: ${response.status}`);
    console.log(`Response: ${responseText}`);
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}

main().catch(console.error);
