// Deploy CompoundGatewayWrite v2

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { verifyContract } from "../../utils/verification";
import { deterministicSalt } from "../../utils/deploySalt";
import { getEffectiveChainId, logForkConfig } from "../../utils/forkChain";
import { safeExecute, safeDeploy, waitForPendingTxs, getWaitConfirmations } from "../../utils/safeExecute";

const ZERO = "0x0000000000000000000000000000000000000000";

// For Hardhat (31337), uses FORK_CHAIN env to determine which addresses to use.
const DEFAULT_COMETS: Record<number, string[]> = {
  // Ethereum mainnet - all 5 Comet markets
  // Source: https://docs.compound.finance/
  1: [
    "0xc3d688B66703497DAA19211EEdff47f25384cdc3", // cUSDCv3 - USDC base market
    "0xA17581A9E3356d9A858b789D68B4d866e593aE94", // cWETHv3 - WETH base market
    "0x3Afdc9BCA9213A35503b077a6072F3D0d5AB0840", // cUSDTv3 - USDT base market
    "0x3D0bb1ccaB520A66e607822fC55BC921738fAFE3", // cWstETHv3 - wstETH base market
    "0x5D409e56D886231aDAf00c8775665AD0f9897b56", // cUSDSv3 - USDS base market (Sky USD)
  ],
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
  59144: [
    "0x8D38A3d6B3c3B7d96D6536DA7Eef94A9d7dbC991", // cUSDCv3 (Comet proxy)
  ],
  // Unichain (130)
  130: [
    "0x2c7118c4C88B9841FCF839074c26Ae8f035f2921", // cUSDCv3
    "0x6C987dDE50dB1dcDd32Cd4175778C2a291978E2a", // cWETHv3
  ],
};

const deployCompoundGatewayWrite: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const chainId = Number(await hre.getChainId());
  const effectiveChainId = getEffectiveChainId(chainId);
  logForkConfig(chainId);
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, execute, get } = hre.deployments;
  const { ethers } = hre;

  // ---- Gate purely by map: no chain in map => no deploy
  if (!DEFAULT_COMETS[effectiveChainId]) {
    console.warn(`Compound: no address map for chainId=${chainId} (effective: ${effectiveChainId}). Skipping deployment.`);
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
    } catch {/* not JSON, continue */ }

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

  const defaultsRaw = DEFAULT_COMETS[effectiveChainId] || [];
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
  const WAIT = getWaitConfirmations(chainId);

  const compoundGatewayWrite = await safeDeploy(hre, deployer, "CompoundGatewayWrite", {
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
          await safeExecute(hre, deployer, contractName, "addComet", [cometAddress], { waitConfirmations: 1 });
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
          await safeExecute(hre, deployer, contractName, "setCometForBase", [baseToken, cometAddress], { waitConfirmations: 1 });
          console.log(`[${contractName}] setCometForBase OK: ${cometAddress} (base=${baseToken})`);
        } catch (fallbackErr) {
          console.error(`[${contractName}] Failed to register ${cometAddress} via both methods:`, fallbackErr);
        }
      }
    }
  };

  // View gateway
  const compoundGatewayView = await safeDeploy(hre, deployer, "CompoundGatewayView", {
    from: deployer,
    args: [deployer], // owner
    log: true,
    autoMine: true,
    deterministicDeployment: deterministicSalt(hre, "CompoundGatewayView"),
    waitConfirmations: WAIT,
  });

  console.log(`CompoundGatewayView deployed to: ${compoundGatewayView.address}`);

  {
    await safeExecute(hre, deployer, "CompoundGatewayView", "setWriteGateway", [compoundGatewayWrite.address], { waitConfirmations: 1 });
  }
  console.log(`Write gateway set in view: ${compoundGatewayWrite.address}`);

  await registerComets("CompoundGatewayWrite");
  await registerComets("CompoundGatewayView");

  // Optional WETH price feed override (kept as-is)
  const WETH_ADDRESS = process.env.WETH_ADDRESS ?? ZERO;
  const WETH_PRICE_FEED = process.env.WETH_PRICE_FEED ?? ZERO;
  if (isAddr(WETH_ADDRESS) && isAddr(WETH_PRICE_FEED)) {
    try {
      await safeExecute(hre, deployer, "CompoundGatewayView", "overrideFeed", [WETH_ADDRESS, WETH_PRICE_FEED], { waitConfirmations: 1 });
      console.log(`Set override feed: WETH ${WETH_ADDRESS} -> ${WETH_PRICE_FEED}`);
    } catch (error) {
      console.warn(`Failed to set WETH override feed:`, error);
    }
  }

  {
    await safeExecute(hre, deployer, "KapanRouter", "addGateway", ["compound", compoundGatewayWrite.address], { waitConfirmations: 1 });
  }
  console.log(`CompoundGatewayWrite registered with KapanRouter as "compound"`);

  // Gateway sync is handled by 99_sync_authorization_helper.ts to avoid nonce race conditions

  // Verification is handled by verifyContract utility (checks DISABLE_VERIFICATION env var)
  await verifyContract(hre, compoundGatewayWrite.address, [kapanRouter.address, deployer]);
  await verifyContract(hre, compoundGatewayView.address, [deployer]);

  await waitForPendingTxs(hre, deployer);
};

export default deployCompoundGatewayWrite;

deployCompoundGatewayWrite.tags = ["CompoundGatewayWrite", "v2"];
deployCompoundGatewayWrite.dependencies = ["KapanRouter"];
