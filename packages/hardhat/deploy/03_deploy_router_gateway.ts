import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const deployRouterGateway: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // Get the deployed gateway contracts
  const aaveGateway = await hre.deployments.get("AaveGateway");
  const compoundGateway = await hre.deployments.get("CompoundGateway");

  // Deploy RouterGateway
  const routerGateway = await deploy("RouterGateway", {
    from: deployer,
    args: [aaveGateway.address, compoundGateway.address, "0xbA1333333333a1BA1108E8412f11850A5C319bA9", "0xBA12222222228d8Ba445958a75a0704d566BF2C8"],// V2 - "0xBA12222222228d8Ba445958a75a0704d566BF2C8"],
    log: true,
    autoMine: true,
  });

  console.log(`RouterGateway deployed to: ${routerGateway.address}`);

  // Verify on etherscan if not on a local chain
  if (hre.network.name !== "localhost" && hre.network.name !== "hardhat") {
    try {
      await hre.run("verify:verify", {
        address: routerGateway.address,
        constructorArguments: [aaveGateway.address, compoundGateway.address],
      });
      console.log("RouterGateway verified on Etherscan");
    } catch (error) {
      console.log("Error verifying contract:", error);
    }
  }
};

export default deployRouterGateway;

deployRouterGateway.tags = ["RouterGateway"];
deployRouterGateway.dependencies = ["AaveGateway", "CompoundGateway"];
