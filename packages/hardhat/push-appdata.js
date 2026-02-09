const { ethers } = require("hardhat");

const ORDER_HASH = "0xf69c43f3681eb105799af83f2d758b824399172caceeca79f17770f20251f07e";
const CONDITIONAL_ORDER_MANAGER = "0xAEC73Dd36D7D9749bBE8d9FF15F674A58d6Db4c3";
const LTV_TRIGGER = "0x06043DE2c27EA37c6B7fBe7d09c2D830D4a31e9c";
const COW_API = "https://api.cow.fi/arbitrum_one/api/v1";

// KapanCowAdapter from deployments
const KAPAN_COW_ADAPTER = require("./deployments/arbitrum/KapanCowAdapter.json").address;

// Morpho flash loan lender (0% fee on Arbitrum)
const MORPHO_LENDER = "0x6c247b1F6182318877311737BaC0844bAa518F5e";

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
  console.log("=== Pushing AppData to Production API ===\n");

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
  console.log("  KapanCowAdapter:", KAPAN_COW_ADAPTER);

  // Get trigger params for flash loan token
  const triggerParams = await ltvTrigger.decodeTriggerParams(order.params.triggerStaticData);
  const collateralToken = triggerParams.collateralToken;

  // Get the sell amount for flash loan
  const staticInput = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [ORDER_HASH]);
  const tradeableOrder = await manager.getTradeableOrder(
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    ethers.ZeroHash,
    staticInput,
    "0x"
  );
  const sellAmount = tradeableOrder.sellAmount;

  console.log("  Collateral (sell) token:", collateralToken);
  console.log("  Sell amount:", sellAmount.toString());

  // Encode hook calls exactly as frontend does
  const hookIface = new ethers.Interface([
    "function executePreHookBySalt(address user, bytes32 salt) external",
    "function executePostHookBySalt(address user, bytes32 salt) external",
  ]);

  const adapterIface = new ethers.Interface([
    "function fundOrderBySalt(address user, bytes32 salt, address token, address recipient, uint256 amount) external",
  ]);

  const preHookCalldata = hookIface.encodeFunctionData("executePreHookBySalt", [user, salt]);
  const postHookCalldata = hookIface.encodeFunctionData("executePostHookBySalt", [user, salt]);
  const fundOrderCalldata = adapterIface.encodeFunctionData("fundOrderBySalt", [
    user,
    salt,
    collateralToken,
    CONDITIONAL_ORDER_MANAGER,
    sellAmount,
  ]);

  console.log("\nHook calldatas:");
  console.log("  fundOrderBySalt:", fundOrderCalldata);
  console.log("  preHook:", preHookCalldata);
  console.log("  postHook:", postHookCalldata);

  // Build appData exactly as frontend does (with flash loan)
  const appData = {
    version: "1.10.0",
    appCode: "kapan:close-position/morpho",
    metadata: {
      hooks: {
        pre: [
          {
            target: KAPAN_COW_ADAPTER,
            callData: fundOrderCalldata,
            gasLimit: "150000",
            dappId: "kapan://flashloans/adapter/fund",
          },
          {
            target: CONDITIONAL_ORDER_MANAGER,
            callData: preHookCalldata,
            gasLimit: "800000",
            dappId: "kapan://flashloans/pre-hook",
          },
        ],
        post: [
          {
            target: CONDITIONAL_ORDER_MANAGER,
            callData: postHookCalldata,
            gasLimit: "1750000",
            dappId: "kapan://flashloans/post-hook",
          },
        ],
      },
      flashloan: {
        liquidityProvider: MORPHO_LENDER,
        protocolAdapter: KAPAN_COW_ADAPTER,
        receiver: KAPAN_COW_ADAPTER,
        token: collateralToken,
        amount: sellAmount.toString(),
      },
    },
  };

  // Use deterministic stringify
  const appDataJson = deterministicStringify(appData);
  const computedHash = ethers.keccak256(ethers.toUtf8Bytes(appDataJson));

  console.log("\n=== AppData ===");
  console.log("JSON:", appDataJson);
  console.log("\nComputed hash:", computedHash);
  console.log("Stored hash:  ", storedAppDataHash);
  console.log("Hash matches:", computedHash === storedAppDataHash);

  // Push to CoW API
  console.log("\n=== Pushing to CoW API ===");

  try {
    const response = await fetch(`${COW_API}/app_data`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullAppData: appDataJson }),
    });

    const responseText = await response.text();
    console.log("Status:", response.status);
    console.log("Response:", responseText);

    if (response.ok) {
      console.log("\nAppData pushed successfully!");
    } else {
      console.log("\nFailed to push appData");
    }
  } catch (e) {
    console.log("Error:", e.message);
  }
}

main().catch(console.error);
