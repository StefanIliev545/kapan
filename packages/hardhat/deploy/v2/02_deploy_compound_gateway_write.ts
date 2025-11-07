// Deploy CompoundGatewayWrite v2

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
// import { verifyContract } from "../../utils/verification";
import { deterministicSalt } from "../../utils/deploySalt";

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
    "0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf", // cUSDbCv3
    "0x784efeB622244d2348d4F2522f8860B96fbEcE89", // cAEROv3
    "0x2c776041ccfe903071af44aa147368a9c8eea518", // cUSDSv3
  ],
  10: [
    "0x2e44e174f7D53F0212823acC11C01A11d58c5bCB", // cUSDCv3
    "0x995E394b8B2437aC8Ce61Ee0bC610D617962B214", // cUSDTv3
    "0xE36A30D249f7761327fd973001A32010b521b6Fd", // cWETHv3
  ],
};

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

  // Enhanced list resolution with logging and validation
  function parseAddressList(raw?: string): string[] {
    if (!raw) return [];
    
    // Try JSON array first
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return arr.map((s) => String(s).trim()).filter(Boolean);
      }
    } catch {/* not JSON, continue */}
    
    // Fallback: CSV / whitespace
    return raw
      .replace(/[\[\]\n\r'"]/g, " ")
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const rawEnv = process.env.COMPOUND_COMETS;
  const envParsed = parseAddressList(rawEnv);

  const normalize = (a: string) => (ethers.isAddress(a) ? ethers.getAddress(a) : a);
  const isAddr = (a: string) => ethers.isAddress(a) && a !== ZERO;

  const defaultsRaw = DEFAULT_COMETS[chainId] || [];
  const defaults = defaultsRaw.map(normalize).filter(isAddr);

  // Only use env if it yields at least 1 valid address
  const envCandidates = envParsed.map(normalize).filter(isAddr);
  const source = envCandidates.length > 0 ? "env" : "defaults";
  const COMET_ADDRESSES = [...new Set((envCandidates.length > 0 ? envCandidates : defaults))];

  console.log("Compound list resolution", {
    chainId,
    envPresent: rawEnv != null && rawEnv !== "",
    rawEnv,
    envParsed,
    envCandidates,
    defaultsCount: defaults.length,
    finalCount: COMET_ADDRESSES.length,
    source,
    COMET_ADDRESSES,
  });

  // Optional safety rails: if you *expect* N markets on this chain, enforce it:
  if (chainId === 10 /* Optimism */) {
    if (COMET_ADDRESSES.length < 3) {
      console.warn(
        `⚠️ Expected ~3 Comets on OP, resolved only ${COMET_ADDRESSES.length}. ` +
        `Check DEFAULT_COMETS[10] in the compiled file and your environment.`
      );
    }
  }

  // Bail out if an env var is present but yields zero valid addrs
  if (rawEnv && envCandidates.length === 0) {
    throw new Error("COMPOUND_COMETS provided but no valid addresses parsed.");
  }

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
    deterministicDeployment: deterministicSalt(hre, "CompoundGatewayWrite"),
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
    deterministicDeployment: deterministicSalt(hre, "CompoundGatewayView"),
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
