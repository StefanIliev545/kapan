const { ethers } = require("hardhat");

// Simple deterministic stringify (sorted keys)
function stringify(obj) {
  return JSON.stringify(obj, (key, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.keys(val).sort().reduce((acc, k) => {
        acc[k] = val[k];
        return acc;
      }, {});
    }
    return val;
  });
}

async function main() {
  console.log("=== Reconstructing AppData ===\n");

  const MANAGER = "0x34cf47E892e8CF68EcAcE7268407952904289B43";
  const USER = "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3";
  const SALT = "0x824e63e433bef7c668a8f4d08f84bd036616dfe31c6fc003222a1f1fab7c5e97";
  const KAPAN_ADAPTER = "0x069C09160F11c2F26Faeca3ea91aa5ae639092a5";
  const SELL_TOKEN = "0x41CA7586cC1311807B4605fBB748a3B8862b42b5"; // syrupUSDC

  // Aave V3 pool on Arbitrum (flash loan lender)
  const AAVE_POOL = "0x794a61358D6845594F94dc1DB02A252b5b4814aD";

  // Encode hooks
  const iface = new ethers.Interface([
    "function fundOrderBySalt(address user, bytes32 salt, address token, address recipient, uint256 amount) external",
    "function executePreHookBySalt(address user, bytes32 salt) external",
    "function executePostHookBySalt(address user, bytes32 salt) external",
  ]);

  // Estimate flash loan amount (from trigger - ~413 syrupUSDC)
  const flashLoanAmount = "413798581"; // 6 decimals

  const fundOrderCalldata = iface.encodeFunctionData("fundOrderBySalt", [
    USER, SALT, SELL_TOKEN, MANAGER, flashLoanAmount
  ]);
  const preHookCalldata = iface.encodeFunctionData("executePreHookBySalt", [USER, SALT]);
  const postHookCalldata = iface.encodeFunctionData("executePostHookBySalt", [USER, SALT]);

  const appData = {
    version: "1.10.0",
    appCode: "kapan:close-position/morpho",
    metadata: {
      hooks: {
        pre: [
          {
            target: KAPAN_ADAPTER,
            callData: fundOrderCalldata,
            gasLimit: "150000",
            dappId: "kapan://flashloans/adapter/fund",
          },
          {
            target: MANAGER,
            callData: preHookCalldata,
            gasLimit: "500000",
            dappId: "kapan://flashloans/pre-hook",
          },
        ],
        post: [
          {
            target: MANAGER,
            callData: postHookCalldata,
            gasLimit: "1500000",
            dappId: "kapan://flashloans/post-hook",
          },
        ],
      },
      flashloan: {
        liquidityProvider: AAVE_POOL,
        protocolAdapter: KAPAN_ADAPTER,
        receiver: KAPAN_ADAPTER,
        token: SELL_TOKEN,
        amount: flashLoanAmount,
      },
    },
  };

  console.log("Reconstructed appData:");
  console.log(JSON.stringify(appData, null, 2));

  // Compute hash
  const json = stringify(appData);
  console.log("\nDeterministic JSON:");
  console.log(json);

  const hash = ethers.keccak256(ethers.toUtf8Bytes(json));
  console.log("\nComputed hash:", hash);
  console.log("Stored hash:  ", "0x049b77911aa106b0d8c29f9152d8560ef888d5cbd7061f4bd7e5eb9025db972c");

  if (hash.toLowerCase() === "0x049b77911aa106b0d8c29f9152d8560ef888d5cbd7061f4bd7e5eb9025db972c".toLowerCase()) {
    console.log("\n✅ Hash matches!");
  } else {
    console.log("\n❌ Hash mismatch - appData was built differently");
  }
}

main().catch(console.error);
