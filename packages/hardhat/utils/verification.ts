import { HardhatRuntimeEnvironment } from "hardhat/types";

/**
 * Verifies a contract on Etherscan
 * @param hre Hardhat Runtime Environment
 * @param contractAddress The deployed contract address
 * @param constructorArguments The constructor arguments used for deployment
 */
export const verifyContract = async (
  hre: HardhatRuntimeEnvironment,
  contractAddress: string,
  constructorArguments: any[]
): Promise<void> => {
  // Skip verification if DISABLE_VERIFICATION is set (for development security)
  if (process.env.DISABLE_VERIFICATION === "true") {
    console.log(`⚠️  Verification disabled (DISABLE_VERIFICATION=true). Skipping verification for ${contractAddress}`);
    return;
  }

  // Skip verification for local networks
  if (["hardhat", "localhost"].includes(hre.network.name)) {
    console.log(`⚠️  Skipping verification for local network: ${hre.network.name}`);
    return;
  }

  console.log(`Verifying contract at ${contractAddress}...`);
  
  try {
    // Add a delay to make sure Etherscan has indexed the contract
    console.log("Waiting for Etherscan to index the contract...");
    await new Promise(resolve => setTimeout(resolve, 60000)); // 60 seconds delay
    
    await hre.run("verify:verify", {
      address: contractAddress,
      constructorArguments,
    });
    
    console.log(`Contract at ${contractAddress} verified successfully!`);
  } catch (error: any) {
    if (error.message.includes("Reason: Already Verified")) {
      console.log(`Contract at ${contractAddress} is already verified.`);
    } else {
      console.error(`Error verifying contract at ${contractAddress}:`, error);
    }
  }
}; 