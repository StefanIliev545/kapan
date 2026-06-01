/**
 * Diagnostic for the alchemix view-router dispatch chain.
 *
 * Reads the live deployed contracts and prints whether each link works:
 *   1. KapanViewRouter has the new bytecode (ALCHEMIX() getter exists)
 *   2. KapanViewRouter.gateways("alchemix-v3") points at the new view contract
 *   3. AutoLeverageTrigger.viewRouter() matches the current KapanViewRouter
 *   4. Calling getCurrentLtv with the alchemix protocolId actually works
 *
 * Run:
 *   FORK_CHAIN=arbitrum yarn hardhat run scripts/checkAlchemixView.ts --network arbitrum
 *
 * (If you don't have Arbitrum RPC configured, this still works against a fork:
 *   FORK_CHAIN=arbitrum yarn fork
 *   then in another shell: yarn hardhat run scripts/checkAlchemixView.ts --network localhost)
 */

import { ethers, network } from "hardhat";
import { ALCHEMIX_GATEWAY_NAME, ALCHEMIX_PROTOCOL_ID } from "../utils/alchemixConstants";

// Live Arbitrum deployments (from packages/hardhat/deployments/arbitrum)
const VIEW_ROUTER = "0x79D4b55a88560d2EaA4CAF15C55139416bc2cb36";
const AUTO_LEVERAGE_TRIGGER = "0x73bf8e0bBc81d5850a698b9643b15E5ccd434EF0";
const ALCHEMIX_VIEW_EXPECTED = "0xb12f76Bb44B4279eBebAD8d7e30caE8c62BCDb3a";

async function main() {
  // EDR cold-read panic workaround on Arbitrum forks — mine a few blocks before any read.
  for (let i = 0; i < 3; i++) await network.provider.send("evm_mine", []);

  console.log(`Expected ALCHEMIX_PROTOCOL_ID:  ${ALCHEMIX_PROTOCOL_ID}`);
  console.log(`Expected gateway-name string:  "${ALCHEMIX_GATEWAY_NAME}"\n`);

  const router = await ethers.getContractAt("KapanViewRouter", VIEW_ROUTER);

  // (1) Does the on-chain bytecode know about alchemix?
  let onChainConst: string | null = null;
  try {
    onChainConst = (await router.ALCHEMIX()).toString();
    console.log(`✓ router.ALCHEMIX() = ${onChainConst}`);
    if (onChainConst.toLowerCase() !== ALCHEMIX_PROTOCOL_ID.toLowerCase()) {
      console.error(`✗ MISMATCH — deployed router has stale bytecode (different ALCHEMIX value).`);
    }
  } catch (e) {
    console.error(`✗ router.ALCHEMIX() reverted — bytecode is OLD, no alchemix dispatch.\n  ${(e as Error).message}`);
  }

  // (2) Does the registry slot point at the expected view?
  const registered = await router.gateways(ALCHEMIX_GATEWAY_NAME);
  console.log(`gateways("${ALCHEMIX_GATEWAY_NAME}") = ${registered}`);
  if (registered === ethers.ZeroAddress) {
    console.error(`✗ Gateway slot is ZERO — setGateway was never called on the live router.`);
  } else if (registered.toLowerCase() !== ALCHEMIX_VIEW_EXPECTED.toLowerCase()) {
    console.warn(`⚠ Registered view ${registered} differs from local artifact ${ALCHEMIX_VIEW_EXPECTED}.`);
  } else {
    console.log(`✓ Registered view matches local artifact.`);
  }

  // (3) Cross-check the trigger sees the SAME view router.
  const trigger = await ethers.getContractAt("AutoLeverageTrigger", AUTO_LEVERAGE_TRIGGER);
  const triggerVR = await trigger.viewRouter();
  console.log(`AutoLeverageTrigger.viewRouter() = ${triggerVR}`);
  if (triggerVR.toLowerCase() !== VIEW_ROUTER.toLowerCase()) {
    console.error(`✗ Trigger points at DIFFERENT view router — needs to be redeployed.`);
  } else {
    console.log(`✓ Trigger and router agree on view-router address.`);
  }

  // (4) End-to-end: does dispatch work? Pass an obviously-empty context (marketId=1, tokenId=0)
  // — getCDP(0) might revert on some alchemists; if so we know the dispatch routed but the
  // tokenId matters. The IMPORTANT thing here is we don't see UnsupportedProtocolId.
  const probeCtx = ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256"], [1n, 0n]);
  try {
    const ltv = await router.getCurrentLtv(ALCHEMIX_PROTOCOL_ID, ethers.ZeroAddress, probeCtx);
    console.log(`✓ router.getCurrentLtv(ALCHEMIX, 0, ctx) = ${ltv} (expected 0 for tokenId=0)`);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("UnsupportedProtocolId")) {
      console.error(`✗ getCurrentLtv reverted with UnsupportedProtocolId — _getProtocolName missing alchemix branch.`);
    } else if (msg.includes("MarketNotRegistered")) {
      console.error(`✗ getCurrentLtv reverted with MarketNotRegistered — view contract is stale or pointing at wrong write gateway.`);
    } else {
      console.warn(`⚠ getCurrentLtv reverted with: ${msg.slice(0, 200)}`);
      console.warn(`  (May be benign — getCDP(tokenId=0) reverts on some alchemists. Try with a real tokenId.)`);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
