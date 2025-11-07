import crypto from "crypto";
import type { HardhatRuntimeEnvironment } from "hardhat/types";

export function deterministicSalt(
  hre: HardhatRuntimeEnvironment,
  contractName: string
): string {
  const seed = process.env.DEPLOY_SEED || process.env.DETERMINISTIC_SEED || "kapan-v2-dev-seed";
  const networkName = hre.network.name || "unknown";
  const preimage = `${seed}:${networkName}:${contractName}`;
  const digest = crypto.createHash("sha256").update(preimage).digest("hex");
  return "0x" + digest;
}


