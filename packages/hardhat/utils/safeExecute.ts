import { HardhatRuntimeEnvironment } from "hardhat/types";

/**
 * Get recommended wait confirmations for a chain.
 * Different chains have different block times and finality guarantees.
 */
export function getWaitConfirmations(chainId: number): number {
  // Mainnet: 1 confirmation (12s blocks, strong finality)
  if (chainId === 1) return 1;
  // Arbitrum: 5 confirmations (fast blocks ~0.25s, RPC can lag behind)
  if (chainId === 42161) return 5;
  // Base/Optimism: 3 confirmations (2s blocks)
  if (chainId === 8453 || chainId === 10) return 3;
  // Linea: 3 confirmations
  if (chainId === 59144) return 3;
  // Default: 3 confirmations
  return 3;
}

/**
 * Safe execute wrapper that uses 'pending' nonce to avoid race conditions.
 * 
 * hardhat-deploy's execute() uses 'latest' nonce by default, which can cause
 * "nonce already used" errors when multiple transactions are sent in sequence.
 * This wrapper fetches the pending nonce before each call and waits for
 * the transaction to be confirmed before returning.
 * 
 * Wait confirmations are chain-aware: Arbitrum uses 5 (fast blocks), others use 1-3.
 */
export async function safeExecute(
  hre: HardhatRuntimeEnvironment,
  deployer: string,
  contractName: string,
  methodName: string,
  args: any[],
  options: { waitConfirmations?: number; log?: boolean; gasLimit?: number } = {}
) {
  const { deployments, ethers } = hre;
  const { execute } = deployments;
  
  // Wait a bit to ensure previous tx is processed
  await sleep(1000);
  
  // Get pending nonce to avoid race conditions
  const nonce = await ethers.provider.getTransactionCount(deployer, "pending");
  
  // Use chain-aware default if not explicitly provided
  const chainId = Number(await hre.getChainId());
  const defaultWait = getWaitConfirmations(chainId);
  
  const result = await execute(
    contractName,
    { 
      from: deployer, 
      nonce,
      waitConfirmations: options.waitConfirmations ?? defaultWait,
      log: options.log,
    },
    methodName,
    ...args
  );
  
  // Wait for pending transactions to clear after execution
  // This ensures the nonce is updated before any subsequent calls
  await waitForPendingTxs(hre, deployer, 15000);
  
  return result;
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

/**
 * Safe deploy wrapper that waits for pending transactions and uses correct nonce.
 * 
 * hardhat-deploy's deploy() can have nonce issues on fast chains like Arbitrum.
 * This wrapper ensures pending txs are cleared and passes the correct nonce.
 */
export async function safeDeploy(
  hre: HardhatRuntimeEnvironment,
  deployer: string,
  contractName: string,
  deployOptions: any
): Promise<any> {
  const { deployments, ethers } = hre;
  const { deploy } = deployments;
  
  // Wait for any pending transactions to clear
  await waitForPendingTxs(hre, deployer, 15000);
  
  // Small delay to ensure RPC is synced
  await sleep(2000);
  
  // Get the current pending nonce
  const nonce = await ethers.provider.getTransactionCount(deployer, "pending");
  
  // Deploy with explicit nonce
  const result = await deploy(contractName, {
    ...deployOptions,
    nonce,
  });
  
  // Wait for deployment to be confirmed before returning
  await waitForPendingTxs(hre, deployer, 15000);
  
  return result;
}
