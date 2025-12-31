const hre = require("hardhat");

async function main() {
  const { ethers, deployments } = hre;
  const helper = await deployments.get('KapanAuthorizationHelper');
  const contract = await ethers.getContractAt('KapanAuthorizationHelper', helper.address);
  
  // Check gateways
  const gateways = ['aave', 'compound', 'venus', 'zerolend', 'morpho', 'oneinch'];
  for (const name of gateways) {
    try {
      const addr = await contract.gateways(name);
      console.log(`${name}: ${addr}`);
    } catch (e) {
      console.log(`${name}: ERROR - ${e.message}`);
    }
  }
}

main().catch(console.error);
