const hre = require("hardhat");

async function main() {
  const { ethers, deployments, getNamedAccounts } = hre;
  const { deployer } = await getNamedAccounts();
  
  const helper = await deployments.get('KapanAuthorizationHelper');
  const contract = await ethers.getContractAt('KapanAuthorizationHelper', helper.address);
  
  const gatewayConfigs = [
    { name: "aave", deploymentName: "AaveGatewayWrite" },
    { name: "compound", deploymentName: "CompoundGatewayWrite" },
    { name: "venus", deploymentName: "VenusGatewayWrite" },
    { name: "zerolend", deploymentName: "ZeroLendGatewayWrite" },
    { name: "morpho", deploymentName: "MorphoBlueGatewayWrite" },
    { name: "oneinch", deploymentName: "OneInchGateway" },
    { name: "pendle", deploymentName: "PendleGateway" },
  ];
  
  for (const { name, deploymentName } of gatewayConfigs) {
    try {
      const gateway = await deployments.get(deploymentName);
      const currentAddr = await contract.gateways(name);
      
      if (currentAddr.toLowerCase() !== gateway.address.toLowerCase()) {
        console.log(`Syncing ${name}: ${gateway.address}`);
        const tx = await contract.syncGateway(name, gateway.address);
        await tx.wait();
        console.log(`  Done: ${tx.hash}`);
      } else {
        console.log(`${name} already synced: ${currentAddr}`);
      }
    } catch (e) {
      console.log(`${name}: Not deployed or error - ${e.message?.substring(0, 50)}`);
    }
  }
  
  console.log("\nVerifying:");
  for (const { name } of gatewayConfigs) {
    const addr = await contract.gateways(name);
    console.log(`${name}: ${addr}`);
  }
}

main().catch(console.error);
