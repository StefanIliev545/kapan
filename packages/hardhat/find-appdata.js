const { ethers } = require("hardhat");

const ORDER_HASH = "0xf69c43f3681eb105799af83f2d758b824399172caceeca79f17770f20251f07e";
const CONDITIONAL_ORDER_MANAGER = "0xAEC73Dd36D7D9749bBE8d9FF15F674A58d6Db4c3";
const LTV_TRIGGER = "0x06043DE2c27EA37c6B7fBe7d09c2D830D4a31e9c";
const KAPAN_COW_ADAPTER = require("./deployments/arbitrum/KapanCowAdapter.json").address;
const MORPHO_LENDER = "0x6c247b1F6182318877311737BaC0844bAa518F5e";
const COW_API = "https://api.cow.fi/arbitrum_one/api/v1";

// Deterministic JSON stringify
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
  console.log("=== Finding correct AppData structure ===\n");

  const manager = await ethers.getContractAt("KapanConditionalOrderManager", CONDITIONAL_ORDER_MANAGER);
  const ltvTrigger = await ethers.getContractAt("LtvTrigger", LTV_TRIGGER);

  const order = await manager.getOrder(ORDER_HASH);
  const salt = await manager.orderSalts(ORDER_HASH);
  const user = order.params.user;
  const storedAppDataHash = order.params.appDataHash;

  console.log("Target hash:", storedAppDataHash);

  const triggerParams = await ltvTrigger.decodeTriggerParams(order.params.triggerStaticData);
  const collateralToken = triggerParams.collateralToken;

  // Encode hooks
  const hookIface = new ethers.Interface([
    "function executePreHookBySalt(address user, bytes32 salt) external",
    "function executePostHookBySalt(address user, bytes32 salt) external",
  ]);
  const adapterIface = new ethers.Interface([
    "function fundOrderBySalt(address user, bytes32 salt, address token, address recipient, uint256 amount) external",
  ]);

  const preHookCalldata = hookIface.encodeFunctionData("executePreHookBySalt", [user, salt]);
  const postHookCalldata = hookIface.encodeFunctionData("executePostHookBySalt", [user, salt]);

  // Try different configurations
  const configs = [];

  // Try different sell amounts (the amount at creation time might have been different)
  const amounts = [
    "477353979",  // Current
    "477000000",
    "478000000",
    "500000000",
    "480000000",
  ];

  for (const amount of amounts) {
    const fundOrderCalldata = adapterIface.encodeFunctionData("fundOrderBySalt", [
      user, salt, collateralToken, CONDITIONAL_ORDER_MANAGER, amount,
    ]);

    // Config 1: With dappId (like our script)
    configs.push({
      name: `Amount ${amount} with dappId`,
      appData: {
        version: "1.10.0",
        appCode: "kapan:close-position/morpho",
        metadata: {
          hooks: {
            pre: [
              { target: KAPAN_COW_ADAPTER, callData: fundOrderCalldata, gasLimit: "150000", dappId: "kapan://flashloans/adapter/fund" },
              { target: CONDITIONAL_ORDER_MANAGER, callData: preHookCalldata, gasLimit: "800000", dappId: "kapan://flashloans/pre-hook" },
            ],
            post: [
              { target: CONDITIONAL_ORDER_MANAGER, callData: postHookCalldata, gasLimit: "1750000", dappId: "kapan://flashloans/post-hook" },
            ],
          },
          flashloan: {
            liquidityProvider: MORPHO_LENDER,
            protocolAdapter: KAPAN_COW_ADAPTER,
            receiver: KAPAN_COW_ADAPTER,
            token: collateralToken,
            amount: amount,
          },
        },
      },
    });

    // Config 2: Without dappId
    configs.push({
      name: `Amount ${amount} no dappId`,
      appData: {
        version: "1.10.0",
        appCode: "kapan:close-position/morpho",
        metadata: {
          hooks: {
            pre: [
              { target: KAPAN_COW_ADAPTER, callData: fundOrderCalldata, gasLimit: "150000" },
              { target: CONDITIONAL_ORDER_MANAGER, callData: preHookCalldata, gasLimit: "800000" },
            ],
            post: [
              { target: CONDITIONAL_ORDER_MANAGER, callData: postHookCalldata, gasLimit: "1750000" },
            ],
          },
          flashloan: {
            liquidityProvider: MORPHO_LENDER,
            protocolAdapter: KAPAN_COW_ADAPTER,
            receiver: KAPAN_COW_ADAPTER,
            token: collateralToken,
            amount: amount,
          },
        },
      },
    });

    // Config 3: Simple (no flash loan, no adapter)
    configs.push({
      name: `Amount ${amount} simple`,
      appData: {
        version: "1.10.0",
        appCode: "kapan",
        metadata: {
          hooks: {
            pre: [{ target: CONDITIONAL_ORDER_MANAGER, callData: preHookCalldata, gasLimit: "800000" }],
            post: [{ target: CONDITIONAL_ORDER_MANAGER, callData: postHookCalldata, gasLimit: "1750000" }],
          },
        },
      },
    });
  }

  // Check each config
  for (const config of configs) {
    const json = deterministicStringify(config.appData);
    const hash = ethers.keccak256(ethers.toUtf8Bytes(json));
    if (hash === storedAppDataHash) {
      console.log("\n*** FOUND MATCH! ***");
      console.log("Config:", config.name);
      console.log("JSON:", json);
      console.log("Hash:", hash);

      // Push this to API
      console.log("\n=== Pushing matched appData to API ===");
      const response = await fetch(`${COW_API}/app_data`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullAppData: json }),
      });
      console.log("Status:", response.status);
      console.log("Response:", await response.text());
      return;
    }
  }

  console.log("No match found among", configs.length, "configurations");
  console.log("\nThis suggests the frontend may have used different parameters at creation time.");
  console.log("The order will need to be re-submitted with the correct appData.");

  // Push the most likely appData anyway (current amounts, no dappId)
  console.log("\n=== Pushing current appData (may not match stored hash) ===");
  const staticInput = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [ORDER_HASH]);
  const tradeableOrder = await manager.getTradeableOrder(ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroHash, staticInput, "0x");
  const currentAmount = tradeableOrder.sellAmount.toString();

  const fundOrderCalldata = adapterIface.encodeFunctionData("fundOrderBySalt", [
    user, salt, collateralToken, CONDITIONAL_ORDER_MANAGER, currentAmount,
  ]);

  const appData = {
    version: "1.10.0",
    appCode: "kapan:close-position/morpho",
    metadata: {
      hooks: {
        pre: [
          { target: KAPAN_COW_ADAPTER, callData: fundOrderCalldata, gasLimit: "150000" },
          { target: CONDITIONAL_ORDER_MANAGER, callData: preHookCalldata, gasLimit: "800000" },
        ],
        post: [
          { target: CONDITIONAL_ORDER_MANAGER, callData: postHookCalldata, gasLimit: "1750000" },
        ],
      },
      flashloan: {
        liquidityProvider: MORPHO_LENDER,
        protocolAdapter: KAPAN_COW_ADAPTER,
        receiver: KAPAN_COW_ADAPTER,
        token: collateralToken,
        amount: currentAmount,
      },
    },
  };

  const json = deterministicStringify(appData);
  const computedHash = ethers.keccak256(ethers.toUtf8Bytes(json));
  console.log("Computed hash:", computedHash);
  console.log("Stored hash:", storedAppDataHash);

  const response = await fetch(`${COW_API}/app_data`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fullAppData: json }),
  });
  console.log("Status:", response.status);
  console.log("Response:", await response.text());
}

main().catch(console.error);
