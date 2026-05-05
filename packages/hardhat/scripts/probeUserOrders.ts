/**
 * Probe a user's actual conditional orders on the live KapanConditionalOrderManager
 * and print everything the frontend needs to render the trigger-met badge.
 */
import { ethers, network } from "hardhat";

const USER = "0x6Ba9d7209f54D0Dbc039D2e6EC4826E4b52647b1";

// Live Arbitrum addresses (from packages/hardhat/deployments/arbitrum)
const MANAGER = "0x3B59E55AeE49a369A950E215B1C11e846F9Bd731";

// Trigger addresses to recognise the order type
const AUTO_LEV_TRIGGER = "0x73bf8e0bBc81d5850a698b9643b15E5ccd434EF0";
const LTV_TRIGGER = "0x3fA3f0EB1481d5d3183Bd65aB492a11B007a056A";
const LIMIT_TRIGGER = "0xa33dc5DF9a911205984CCa379E2885b799c143eb";

const MANAGER_ABI = [
  "function userOrders(address user, uint256 index) view returns (bytes32)",
  "function isTriggerMet(bytes32 orderHash) view returns (bool, string)",
  "function getOrder(bytes32 orderHash) view returns (tuple(tuple(address user, address trigger, bytes triggerStaticData, bytes preInstructions, address sellToken, address buyToken, bytes postInstructions, bytes32 appDataHash, uint256 maxIterations, address sellTokenRefundAddress, bool isKindBuy) params, uint8 status, uint256 iterationCount, uint256 createdAt))",
];

const STATUS = ["None", "Active", "Completed", "Cancelled"] as const;

function describeTrigger(addr: string): string {
  if (addr.toLowerCase() === AUTO_LEV_TRIGGER.toLowerCase()) return "AutoLeverageTrigger";
  if (addr.toLowerCase() === LTV_TRIGGER.toLowerCase()) return "LtvTrigger (ADL)";
  if (addr.toLowerCase() === LIMIT_TRIGGER.toLowerCase()) return "LimitPriceTrigger";
  return `unknown (${addr})`;
}

async function main() {
  for (let i = 0; i < 3; i++) await network.provider.send("evm_mine", []);

  const mgr = new ethers.Contract(MANAGER, MANAGER_ABI, ethers.provider);

  console.log(`User: ${USER}`);
  console.log(`Manager: ${MANAGER}\n`);

  // Walk userOrders[user] until it reverts (out-of-bounds).
  const orderHashes: string[] = [];
  for (let i = 0; i < 64; i++) {
    try {
      const hash: string = await mgr.userOrders(USER, i);
      orderHashes.push(hash);
    } catch {
      break;
    }
  }
  console.log(`Found ${orderHashes.length} order(s)\n`);

  for (const orderHash of orderHashes) {
    console.log(`================================================================================`);
    console.log(`orderHash: ${orderHash}`);

    const ctx = await mgr.getOrder(orderHash);
    const { params, status, iterationCount, createdAt } = ctx;
    console.log(`status:          ${STATUS[Number(status)] ?? `unknown(${status})`}`);
    console.log(`iterationCount:  ${iterationCount}/${params.maxIterations}`);
    console.log(`createdAt:       ${new Date(Number(createdAt) * 1000).toISOString()}`);
    console.log(`trigger:         ${describeTrigger(params.trigger)}  ${params.trigger}`);
    console.log(`sellToken:       ${params.sellToken}`);
    console.log(`buyToken:        ${params.buyToken}`);
    console.log(`triggerStaticData (${(params.triggerStaticData.length - 2) / 2} bytes):`);
    console.log(`  ${params.triggerStaticData}`);

    // Try to decode the protocolId — first 4 bytes inside the tuple, but the layout
    // differs between LimitPriceTrigger (struct with bytes4 first) and Auto/Ltv
    // (also bytes4 first). Both pad through ABI encoding so the protocolId sits at
    // offset 0x20 (after the outer tuple offset pointer): peek at bytes 64..68.
    if (params.triggerStaticData.length >= 2 + 32 * 2 + 8) {
      const probableProtocolId = "0x" + params.triggerStaticData.slice(2 + 32 * 2, 2 + 32 * 2 + 8);
      console.log(`probable protocolId in static data:  ${probableProtocolId}`);
      const aaveOld = "0x36e9bb1c"; // keccak256("aave-v3")[0:4]
      const alchemixOld = "0xe91c619d"; // keccak256("alchemix")[0:4]
      const alchemixNew = "0x036d0e16"; // keccak256("alchemix-v3")[0:4]
      if (probableProtocolId.toLowerCase() === alchemixOld) {
        console.log(`  ⚠ This is the OLD alchemix protocolId. Order pre-dates the rename — view router will revert.`);
      } else if (probableProtocolId.toLowerCase() === alchemixNew) {
        console.log(`  ✓ This is the NEW alchemix-v3 protocolId.`);
      } else if (probableProtocolId.toLowerCase() === aaveOld) {
        console.log(`  ✗ This is AAVE protocolId — the old getProtocolId() defaulted unrecognised names to aave-v3, so this is a misrouted alchemix order.`);
      } else {
        console.log(`  ? unrecognised protocolId — could be morpho/euler/compound/venus or another bytes4.`);
      }
    }

    // Direct call to isTriggerMet — what the frontend hits.
    try {
      const [shouldExec, reason] = await mgr.isTriggerMet(orderHash);
      console.log(`isTriggerMet:    ${shouldExec}  reason="${reason}"`);
    } catch (e) {
      const msg = (e as Error).message;
      console.log(`isTriggerMet:    REVERTED — ${msg.slice(0, 200)}`);
    }
  }

  console.log(`================================================================================`);
}

main().catch(err => { console.error(err); process.exit(1); });
