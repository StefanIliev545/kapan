import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { verifyContract } from "../../utils/verification";
import { deterministicSalt } from "../../utils/deploySalt";
import { getEffectiveChainId, logForkConfig } from "../../utils/forkChain";
import { safeExecute, waitForPendingTxs } from "../../utils/safeExecute";

/**
 * CoW Protocol addresses are deterministic (same on all supported chains)
 * https://docs.cow.fi/cow-protocol/reference/contracts/core
 * https://docs.cow.fi/cow-protocol/reference/contracts/periphery
 */
const COW_PROTOCOL = {
  settlement: "0x9008D19f58AAbD9eD0D60971565AA8510560ab41",
  composableCoW: "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74",
  hooksTrampoline: "0x60Bf78233f48eC42eE3F101b9a05eC7878728006",
} as const;

/**
 * Chains where CoW Protocol with hooks is supported
 * https://docs.cow.fi/cow-protocol/reference/contracts/periphery#hookstrampoline
 */
const COW_SUPPORTED_CHAINS = [
  1,      // Ethereum Mainnet
  42161,  // Arbitrum One
  8453,   // Base
  10,     // Optimism
  100,    // Gnosis
  137,    // Polygon
  43114,  // Avalanche
  56,     // BNB Chain
  59144,  // Linea
];

const deployKapanOrderManager: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const chainId = Number(await hre.getChainId());
  const effectiveChainId = getEffectiveChainId(chainId);
  logForkConfig(chainId);

  // Check if CoW Protocol is supported on this chain
  if (!COW_SUPPORTED_CHAINS.includes(effectiveChainId)) {
    console.log(`⚠️  CoW Protocol not supported on chain ${effectiveChainId}. Skipping KapanOrderManager deployment.`);
    return;
  }

  const { deployer } = await hre.getNamedAccounts();
  const { deploy, get, read } = hre.deployments;

  // Get router address
  const router = await get("KapanRouter");

  // Wait for any pending transactions to clear
  await waitForPendingTxs(hre, deployer);

  const result = await deploy("KapanOrderManager", {
    from: deployer,
    args: [
      deployer,                     // owner
      router.address,               // router
      COW_PROTOCOL.composableCoW,   // composableCoW
      COW_PROTOCOL.settlement,      // settlement
      COW_PROTOCOL.hooksTrampoline, // hooksTrampoline
    ],
    log: true,
    waitConfirmations: 1,
    deterministicDeployment: deterministicSalt(hre, "KapanOrderManager"),
  });

  if (result.newlyDeployed) {
    console.log(`KapanOrderManager deployed to: ${result.address}`);
    
    // Wait for RPC node to update nonce (workaround for hardhat-deploy bug)
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Approve OrderManager as a manager on the router
    const isApproved = await read("KapanRouter", "approvedManagers", result.address);
    if (!isApproved) {
      await safeExecute(hre, deployer, "KapanRouter", "setApprovedManager", [result.address, true], { waitConfirmations: 1 });
      console.log(`KapanOrderManager approved as manager on KapanRouter`);
    }
  }

  // Verification
  await verifyContract(hre, result.address, [
    deployer,
    router.address,
    COW_PROTOCOL.composableCoW,
    COW_PROTOCOL.settlement,
    COW_PROTOCOL.hooksTrampoline,
  ]);
};

export default deployKapanOrderManager;
deployKapanOrderManager.tags = ["KapanOrderManager", "cow"];
deployKapanOrderManager.dependencies = ["KapanRouter"];
