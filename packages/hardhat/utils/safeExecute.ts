import { HardhatRuntimeEnvironment } from "hardhat/types";

/**
 * Safe execute wrapper that uses 'pending' nonce to avoid race conditions.
 * 
 * hardhat-deploy's execute() uses 'latest' nonce by default, which can cause
 * "nonce already used" errors when multiple transactions are sent in sequence.
 * This wrapper fetches the pending nonce before each call.
 */
export async function safeExecute(
  hre: HardhatRuntimeEnvironment,
  deployer: string,
  contractName: string,
  methodName: string,
  args: any[],
  options: { waitConfirmations?: number; log?: boolean } = {}
) {
  const { deployments, ethers } = hre;
  const { execute } = deployments;
  
  // Wait a bit to ensure previous tx is processed
  await sleep(1000);
  
  // Get pending nonce to avoid race conditions
  const nonce = await ethers.provider.getTransactionCount(deployer, "pending");
  
  // Get current gas price and bump it slightly to avoid replacement issues
  const feeData = await ethers.provider.getFeeData();
  const maxFeePerGas = feeData.maxFeePerGas ? (feeData.maxFeePerGas * 120n / 100n) : undefined;
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ? (feeData.maxPriorityFeePerGas * 120n / 100n) : undefined;
  
  return await execute(
    contractName,
    { 
      from: deployer, 
      nonce,
      maxFeePerGas: maxFeePerGas?.toString(),
      maxPriorityFeePerGas: maxPriorityFeePerGas?.toString(),
      waitConfirmations: options.waitConfirmations ?? 1,
      log: options.log,
    },
    methodName,
    ...args
  );
}

/**
 * Wait for any pending transactions to clear before deploying.
 * Returns the next nonce to use.
 */
export async function waitForPendingTxs(
  hre: HardhatRuntimeEnvironment,
  deployer: string,
  maxWaitMs: number = 30000
): Promise<number> {
  const { ethers } = hre;
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    const latest = await ethers.provider.getTransactionCount(deployer, "latest");
    const pending = await ethers.provider.getTransactionCount(deployer, "pending");
    
    if (latest === pending) {
      console.log(`✓ No pending transactions. Nonce: ${latest}`);
      return latest;
    }
    
    console.log(`⏳ Waiting for pending txs... (latest: ${latest}, pending: ${pending})`);
    await sleep(3000);
  }
  
  // Return pending nonce even if there are still pending txs
  const pending = await ethers.provider.getTransactionCount(deployer, "pending");
  console.log(`⚠️ Timeout waiting for pending txs. Using pending nonce: ${pending}`);
  return pending;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
