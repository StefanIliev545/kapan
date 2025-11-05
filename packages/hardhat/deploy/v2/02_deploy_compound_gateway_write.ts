// Deploy CompoundGatewayWrite v2

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
// import { verifyContract } from "../../utils/verification";

const ZERO = "0x0000000000000000000000000000000000000000";

const DEFAULT_COMETS: Record<number, string[]> = {
  // Arbitrum One (42161)
  42161: [
    "0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf", // cUSDCv3
    "0xd98Be00b5D27fc98112BdE293e487f8D4cA57d07", // cUSDTv3
    "0xA5EDBDD9646f8dFF606d7448e414884C7d905dCA", // cUSDC.e (USDbC)
    "0x6f7D514bbD4aFf3BcD1140B7344b32f063dEe486", // cWETHv3
  ],
  // Base (8453)
  8453: [
    "0xb125E6687d4313864e53df431d5425969c15Eb2F", // cUSDCv3 (native USDC)
    "0x46e6b214b524310239732D51387075E0e70970bf", // cWETHv3
  ],
};

function parseAddressList(raw?: string): string[] {
  if (!raw) return [];
  return raw.split(/[,\s]+/g).map((s) => s.trim()).filter(Boolean);
}

const deployCompoundGatewayWrite: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const chainId = Number(await hre.getChainId());
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, execute, get } = hre.deployments;
  const { ethers } = hre;

  // ---- Gate purely by map: no chain in map => no deploy
  if (!DEFAULT_COMETS[chainId]) {
    console.warn(`Compound: no address map for chainId=${chainId}. Skipping deployment.`);
    return;
  }

  // Optional single override list for recognized chains
  const envOverride = parseAddressList(process.env.COMPOUND_COMETS);
  const list = envOverride.length ? envOverride : DEFAULT_COMETS[chainId];

  const isAddr = (a: string) => ethers.isAddress(a) && a !== ZERO;
  const COMET_ADDRESSES = [
    ...new Set(
      list
        .map((a) => (ethers.isAddress(a) ? ethers.getAddress(a) : a))
        .filter(isAddr)
    ),
  ];

  if (COMET_ADDRESSES.length === 0) {
    console.warn(`Compound: empty Comet list for chainId=${chainId}. Skipping deployment.`);
    return;
  }

  const kapanRouter = await get("KapanRouter");
  const WAIT = 3;

  const compoundGatewayWrite = await deploy("CompoundGatewayWrite", {
    from: deployer,
    args: [kapanRouter.address, deployer], // router, owner
    log: true,
    autoMine: true,
    deterministicDeployment: "0x4242424242424242424242424242424242424242",
    waitConfirmations: WAIT,
  });

  console.log(`CompoundGatewayWrite deployed to: ${compoundGatewayWrite.address}`);

  // Register each Comet on write + view gateways
  const registerComets = async (contractName: string) => {
    for (const cometAddress of COMET_ADDRESSES) {
      try {
        {
          await execute(contractName, { from: deployer, waitConfirmations: 5 }, "addComet", cometAddress);
        }
        console.log(`[${contractName}] addComet OK: ${cometAddress}`);
      } catch (err) {
        console.warn(`[${contractName}] addComet failed for ${cometAddress}:`, err);
        try {
          const cometContract = await ethers.getContractAt(
            "contracts/v2/interfaces/compound/ICompoundComet.sol:ICompoundComet",
            cometAddress
          );
          const baseToken: string = await cometContract.baseToken();
          await execute(contractName, { from: deployer, waitConfirmations: 5 }, "setCometForBase", baseToken, cometAddress);
          console.log(`[${contractName}] setCometForBase OK: ${cometAddress} (base=${baseToken})`);
        } catch (fallbackErr) {
          console.error(`[${contractName}] Failed to register ${cometAddress} via both methods:`, fallbackErr);
        }
      }
    }
  };

  // View gateway
  const compoundGatewayView = await deploy("CompoundGatewayView", {
    from: deployer,
    args: [deployer], // owner
    log: true,
    autoMine: true,
    deterministicDeployment: "0x4242424242424242424242424242424242424243",
    waitConfirmations: WAIT,
  });

  console.log(`CompoundGatewayView deployed to: ${compoundGatewayView.address}`);

  {
    await execute("CompoundGatewayView", { from: deployer, waitConfirmations: 5 }, "setWriteGateway", compoundGatewayWrite.address);
  }
  console.log(`Write gateway set in view: ${compoundGatewayWrite.address}`);

  await registerComets("CompoundGatewayWrite");
  await registerComets("CompoundGatewayView");

  // Optional WETH price feed override (kept as-is)
  const WETH_ADDRESS = process.env.WETH_ADDRESS ?? ZERO;
  const WETH_PRICE_FEED = process.env.WETH_PRICE_FEED ?? ZERO;
  if (isAddr(WETH_ADDRESS) && isAddr(WETH_PRICE_FEED)) {
    try {
      await execute("CompoundGatewayView", { from: deployer, waitConfirmations: 5 }, "overrideFeed", WETH_ADDRESS, WETH_PRICE_FEED);
      console.log(`Set override feed: WETH ${WETH_ADDRESS} -> ${WETH_PRICE_FEED}`);
    } catch (error) {
      console.warn(`Failed to set WETH override feed:`, error);
    }
  }

  {
    await execute("KapanRouter", { from: deployer, waitConfirmations: 5 }, "addGateway", "compound", compoundGatewayWrite.address);
  }
  console.log(`CompoundGatewayWrite registered with KapanRouter as "compound"`);

  /*if (!["hardhat", "localhost"].includes(network.name)) {
    await verifyContract(hre, compoundGatewayWrite.address, [kapanRouter.address, deployer]);
    await verifyContract(hre, compoundGatewayView.address, [deployer]);
  }*/
};

export default deployCompoundGatewayWrite;

deployCompoundGatewayWrite.tags = ["CompoundGatewayWrite", "v2"];
deployCompoundGatewayWrite.dependencies = ["KapanRouter"];
