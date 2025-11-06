// Deploy KapanRouter v2

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { verifyContract } from "../../utils/verification";

/**
 * Router is chain-agnostic; we deploy it always.
 * Balancer vaults are set only if the chain is recognized in the map.
 */
const deployKapanRouter: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const chainId = Number(await hre.getChainId());
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, execute } = hre.deployments;
  const WAIT = 3;

  const BALANCER: Record<number, { VAULT_V2?: string; VAULT_V3?: string }> = {
    42161: {
      VAULT_V2: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
      VAULT_V3: "0xbA1333333333a1BA1108E8412f11850A5C319bA9",
    },
    8453: {
      VAULT_V2: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
      VAULT_V3: "0xbA1333333333a1BA1108E8412f11850A5C319bA9",
    },
  };

  const kapanRouter = await deploy("KapanRouter", {
    from: deployer,
    args: [deployer], // owner
    log: true,
    autoMine: true,
    deterministicDeployment: "0x4342424242424242424242424242424242424343",
    waitConfirmations: WAIT,
  });

  console.log(`KapanRouter deployed to: ${kapanRouter.address}`);

  const v2 = process.env.BALANCER_VAULT2 || BALANCER[chainId]?.VAULT_V2;
  const v3 = process.env.BALANCER_VAULT3 || BALANCER[chainId]?.VAULT_V3;

  if (v2) {
    await execute("KapanRouter", { from: deployer, waitConfirmations: 5 }, "setBalancerV2", v2);
    console.log(`Balancer V2 provider set: ${v2}`);
  } else {
    console.warn(`No Balancer V2 for chainId=${chainId}. Skipping setBalancerV2.`);
  }

  if (v3) {
    await execute("KapanRouter", { from: deployer, waitConfirmations: 5 }, "setBalancerV3", v3);
    console.log(`Balancer V3 vault set: ${v3}`);
  } else {
    console.warn(`No Balancer V3 for chainId=${chainId}. Skipping setBalancerV3.`);
  }

  // Temporarily disable Etherscan verification for v2 deploys
  if (false && !["hardhat", "localhost"].includes(hre.network.name)) {
    await verifyContract(hre, kapanRouter.address, [deployer]);
  }
};

export default deployKapanRouter;

deployKapanRouter.tags = ["KapanRouter", "v2"];
deployKapanRouter.dependencies = [];
