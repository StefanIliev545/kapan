import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { verifyContract } from "../../utils/verification";
import { deterministicSalt } from "../../utils/deploySalt";
import { getEffectiveChainId, logForkConfig } from "../../utils/forkChain";
import { safeExecute, safeDeploy, waitForPendingTxs } from "../../utils/safeExecute";

/**
 * Protocol names (consistent with KapanRouter)
 * These are simple strings that match the gateway mapping keys
 */
const PROTOCOL_NAMES = {
  AAVE_V3: "aave-v3",
  COMPOUND_V3: "compound-v3",
  MORPHO_BLUE: "morpho-blue",
  EULER_V2: "euler-v2",
  VENUS: "venus",
} as const;

/**
 * Gateway view contract names per chain
 * Maps chainId -> protocol -> deployment name
 */
const GATEWAY_VIEWS: Record<number, Record<string, string>> = {
  // Arbitrum
  42161: {
    AAVE_V3: "AaveGatewayView",
    COMPOUND_V3: "CompoundGatewayView",
    MORPHO_BLUE: "MorphoBlueGatewayView",
    EULER_V2: "EulerGatewayView",
    VENUS: "VenusGatewayView",
  },
  // Ethereum Mainnet
  1: {
    AAVE_V3: "AaveGatewayView",
    COMPOUND_V3: "CompoundGatewayView",
    MORPHO_BLUE: "MorphoBlueGatewayView",
    // EULER_V2: "EulerGatewayView", // Excluded for now
    VENUS: "VenusGatewayView",
  },
  // Base
  8453: {
    AAVE_V3: "AaveGatewayView",
    COMPOUND_V3: "CompoundGatewayView",
    MORPHO_BLUE: "MorphoBlueGatewayView",
    EULER_V2: "EulerGatewayView",
  },
  // Optimism
  10: {
    AAVE_V3: "AaveGatewayView",
  },
  // Linea
  59144: {
    AAVE_V3: "AaveGatewayView",
  },
};

const deployKapanViewRouter: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const chainId = Number(await hre.getChainId());
  const effectiveChainId = getEffectiveChainId(chainId);
  logForkConfig(chainId);

  const { deployer } = await hre.getNamedAccounts();
  const { getOrNull } = hre.deployments;

  // Deploy ViewRouter
  const result = await safeDeploy(hre, deployer, "KapanViewRouter", {
    from: deployer,
    args: [deployer], // owner - must be passed explicitly for CREATE2 deployments
    log: true,
    waitConfirmations: 1,
    deterministicDeployment: deterministicSalt(hre, "KapanViewRouter"),
  });

  console.log(`KapanViewRouter deployed to: ${result.address}`);

  // Check if we're the owner before trying to set gateways
  const { read } = hre.deployments;
  const currentOwner = await read("KapanViewRouter", "owner");

  if (currentOwner.toLowerCase() !== deployer.toLowerCase()) {
    console.log(`⚠️  Deployer (${deployer}) is not the owner (${currentOwner}). Skipping gateway setup.`);
    console.log(`   To set gateways, call setGateways() from the owner account.`);
  } else {
    // Wait for RPC node to update nonce if newly deployed
    if (result.newlyDeployed) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Set gateway views for this chain
    const chainGateways = GATEWAY_VIEWS[effectiveChainId] || {};
    const protocolNames: string[] = [];
    const gatewayAddresses: string[] = [];

    for (const [protocolKey, deploymentName] of Object.entries(chainGateways)) {
      const gateway = await getOrNull(deploymentName);
      if (gateway) {
        const name = PROTOCOL_NAMES[protocolKey as keyof typeof PROTOCOL_NAMES];
        if (name) {
          protocolNames.push(name);
          gatewayAddresses.push(gateway.address);
          console.log(`  ${protocolKey}: ${gateway.address}`);
        }
      } else {
        console.log(`  ${protocolKey}: Not deployed, skipping`);
      }
    }

    if (protocolNames.length > 0) {
      await safeExecute(
        hre,
        deployer,
        "KapanViewRouter",
        "setGateways",
        [protocolNames, gatewayAddresses],
        { waitConfirmations: 1 },
      );
      console.log(`Set ${protocolNames.length} gateway(s) on KapanViewRouter`);
    }
  }

  // Verification
  await verifyContract(hre, result.address, [deployer]);

  await waitForPendingTxs(hre, deployer);
};

export default deployKapanViewRouter;
deployKapanViewRouter.tags = ["KapanViewRouter", "adl"];
deployKapanViewRouter.dependencies = [
  "AaveGatewayView",
  "CompoundGatewayView",
  "MorphoBlueGatewayView",
  "EulerGatewayView",
  "VenusGatewayWrite", // VenusGatewayView is deployed inside VenusGatewayWrite script
];
