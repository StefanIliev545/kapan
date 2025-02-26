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