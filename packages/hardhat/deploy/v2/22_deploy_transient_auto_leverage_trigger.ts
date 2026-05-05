import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { verifyContract } from "../../utils/verification";
import { deterministicSalt } from "../../utils/deploySalt";
import { logForkConfig } from "../../utils/forkChain";
import { safeDeploy, waitForPendingTxs } from "../../utils/safeExecute";

/**
 * TransientAutoLeverageTrigger — sibling to AutoLeverageTrigger that snapshots its dynamic
 * `calculateExecution` output into transient storage during a CoW pre-interaction. Required
 * for protocols whose AL flow mutates position state in the manager's pre-hook (e.g.
 * Alchemix V3) — without the snapshot, the on-chain ERC-1271 sig check would see post-mutation
 * state and reject the trade.
 *
 * Constructor args:
 *   - viewRouter      : KapanViewRouter (LTV / position-value dispatch)
 *   - orderManager    : KapanConditionalOrderManager (looked up via getOrder during prepareCache)
 *   - hooksTrampoline : CoW HooksTrampoline (only authorized prepareCache caller)
 */

const COW_HOOKS_TRAMPOLINE = "0x60Bf78233f48eC42eE3F101b9a05eC7878728006"; // canonical, all chains

const deployTransientAutoLeverageTrigger: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const chainId = Number(await hre.getChainId());
  logForkConfig(chainId);

  const { deployer } = await hre.getNamedAccounts();
  const { get } = hre.deployments;

  const viewRouter = await get("KapanViewRouter");
  const orderManager = await get("KapanConditionalOrderManager");

  const result = await safeDeploy(hre, deployer, "TransientAutoLeverageTrigger", {
    from: deployer,
    args: [viewRouter.address, orderManager.address, COW_HOOKS_TRAMPOLINE],
    log: true,
    waitConfirmations: 1,
    deterministicDeployment: deterministicSalt(hre, "TransientAutoLeverageTrigger"),
  });

  if (result.newlyDeployed) {
    console.log(`TransientAutoLeverageTrigger deployed to: ${result.address}`);
    console.log(`  ViewRouter:    ${viewRouter.address}`);
    console.log(`  OrderManager:  ${orderManager.address}`);
    console.log(`  Trampoline:    ${COW_HOOKS_TRAMPOLINE}`);
  }

  await verifyContract(hre, result.address, [viewRouter.address, orderManager.address, COW_HOOKS_TRAMPOLINE]);
  await waitForPendingTxs(hre, deployer);
};

export default deployTransientAutoLeverageTrigger;
deployTransientAutoLeverageTrigger.tags = ["TransientAutoLeverageTrigger", "auto-leverage"];
deployTransientAutoLeverageTrigger.dependencies = ["KapanViewRouter", "KapanConditionalOrderManager"];
