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
 *   - hooksTrampoline : CoW HooksTrampoline (real-settlement caller)
 *   - settlement      : GPv2Settlement (orderbook balance-simulation caller — Balances.sol
 *                       executes appData hooks via raw `call()` from the Settlement context, so
 *                       `msg.sender` during simulation is the Settlement contract, not the
 *                       trampoline. Without allowing it, simulation reverts and the order is
 *                       rejected with `InsufficientBalance`.)
 */

// CoW Protocol addresses are deterministic (same on all supported chains).
// Mirrors `14_deploy_conditional_order_manager.ts`.
const COW_HOOKS_TRAMPOLINE = "0x60Bf78233f48eC42eE3F101b9a05eC7878728006";
const COW_SETTLEMENT = "0x9008D19f58AAbD9eD0D60971565AA8510560ab41";

const deployTransientAutoLeverageTrigger: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const chainId = Number(await hre.getChainId());
  logForkConfig(chainId);

  const { deployer } = await hre.getNamedAccounts();
  const { get } = hre.deployments;

  const viewRouter = await get("KapanViewRouter");
  const orderManager = await get("KapanConditionalOrderManager");

  const args = [
    viewRouter.address,
    orderManager.address,
    COW_HOOKS_TRAMPOLINE,
    COW_SETTLEMENT,
  ] as const;

  const result = await safeDeploy(hre, deployer, "TransientAutoLeverageTrigger", {
    from: deployer,
    args: [...args],
    log: true,
    waitConfirmations: 1,
    deterministicDeployment: deterministicSalt(hre, "TransientAutoLeverageTrigger"),
  });

  if (result.newlyDeployed) {
    console.log(`TransientAutoLeverageTrigger deployed to: ${result.address}`);
    console.log(`  ViewRouter:    ${viewRouter.address}`);
    console.log(`  OrderManager:  ${orderManager.address}`);
    console.log(`  Trampoline:    ${COW_HOOKS_TRAMPOLINE}`);
    console.log(`  Settlement:    ${COW_SETTLEMENT}`);
  }

  await verifyContract(hre, result.address, [...args]);
  await waitForPendingTxs(hre, deployer);
};

export default deployTransientAutoLeverageTrigger;
deployTransientAutoLeverageTrigger.tags = ["TransientAutoLeverageTrigger", "auto-leverage"];
deployTransientAutoLeverageTrigger.dependencies = ["KapanViewRouter", "KapanConditionalOrderManager"];
