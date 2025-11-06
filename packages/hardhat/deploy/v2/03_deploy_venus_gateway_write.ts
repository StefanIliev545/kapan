// Deploy VenusGatewayWrite v2

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { verifyContract } from "../../utils/verification";
import { deterministicSalt } from "../../utils/deploySalt";

/**
 * Gate deployment by a per-chain address map only.
 * If the current chainId isn't present, we skip deployment.
 */
const deployVenusGatewayWrite: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const chainId = Number(await hre.getChainId());
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, execute, get } = hre.deployments;

  // Core Pool maps (extend as needed)
  const VENUS: Record<number, { COMPTROLLER: string; ORACLE: string }> = {
    42161: { // Arbitrum One
      COMPTROLLER: "0x317c1A5739F39046E20b08ac9BeEa3f10fD43326",
      ORACLE:      "0xd55A98150e0F9f5e3F6280FC25617A5C93d96007",
    },
    8453: { // Base
      COMPTROLLER: "0x0C7973F9598AA62f9e03B94E92C967fD5437426C",
      ORACLE:      "0xcBBf58bD5bAdE357b634419B70b215D5E9d6FbeD",
    },
  };

  const entry = VENUS[chainId];
  if (!entry) {
    console.warn(`Venus: no address map for chainId=${chainId}. Skipping deployment.`);
    return;
  }

  // Env can override addresses for recognized chains
  const VENUS_COMPTROLLER = process.env.VENUS_COMPTROLLER || entry.COMPTROLLER;
  const VENUS_ORACLE      = process.env.VENUS_ORACLE || entry.ORACLE;

  const kapanRouter = await get("KapanRouter");
  const WAIT = 3;

  const venusGatewayWrite = await deploy("VenusGatewayWrite", {
    from: deployer,
    args: [VENUS_COMPTROLLER, kapanRouter.address, deployer], // comptroller, router, owner
    log: true,
    autoMine: true,
    deterministicDeployment: deterministicSalt(hre, "VenusGatewayWrite"),
    waitConfirmations: WAIT,
  });

  console.log(`VenusGatewayWrite deployed to: ${venusGatewayWrite.address}`);

  // View gateway (requires oracle)
  if (VENUS_ORACLE && VENUS_ORACLE !== "0x0000000000000000000000000000000000000000") {
    const venusGatewayView = await deploy("VenusGatewayView", {
      from: deployer,
      args: [VENUS_COMPTROLLER, VENUS_ORACLE, deployer], // comptroller, oracle, owner
      log: true,
      autoMine: true,
      deterministicDeployment: deterministicSalt(hre, "VenusGatewayView"),
      waitConfirmations: WAIT,
    });

    console.log(`VenusGatewayView deployed to: ${venusGatewayView.address}`);

    // Temporarily disable Etherscan verification for v2 deploys
    if (false && !["hardhat", "localhost"].includes(hre.network.name)) {
      await verifyContract(hre, venusGatewayView.address, [
        VENUS_COMPTROLLER,
        VENUS_ORACLE,
        deployer,
      ]);
    }
  } else {
    console.warn("Venus: oracle missing/zero — skipping VenusGatewayView deployment.");
  }

  {
    await execute("KapanRouter", { from: deployer, waitConfirmations: 5 }, "addGateway", "venus", venusGatewayWrite.address);
  }
  console.log(`VenusGatewayWrite registered with KapanRouter as "venus"`);

  /*if (!["hardhat", "localhost"].includes(hre.network.name)) {
    await verifyContract(hre, venusGatewayWrite.address, [
      VENUS_COMPTROLLER,
      kapanRouter.address,
      deployer,
    ]);
  }*/
};

export default deployVenusGatewayWrite;

deployVenusGatewayWrite.tags = ["VenusGatewayWrite", "v2"];
deployVenusGatewayWrite.dependencies = ["KapanRouter"];
