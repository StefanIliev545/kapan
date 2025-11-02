// Deploy CompoundGatewayWrite v2

import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { verifyContract } from "../../utils/verification";

/**
 * Deploys the CompoundGatewayWrite v2 contract using the deployer account and
 * registers it with the KapanRouter
 *
 * @param hre HardhatRuntimeEnvironment object.
 */
const deployCompoundGatewayWrite: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, execute, get } = hre.deployments;

  const kapanRouter = await get("KapanRouter");

  const compoundGatewayWrite = await deploy("CompoundGatewayWrite", {
    from: deployer,
    args: [kapanRouter.address, deployer], // router, owner
    log: true,
    autoMine: true,
    deterministicDeployment: "0x4242424242424242424242424242424242424242",
  });

  console.log(`CompoundGatewayWrite deployed to: ${compoundGatewayWrite.address}`);

  // Register Comets if provided
  const USDC_COMET = process.env.COMPOUND_USDC_COMET || "0x0000000000000000000000000000000000000000";
  const USDT_COMET = process.env.COMPOUND_USDT_COMET || "0x0000000000000000000000000000000000000000";
  const USDC_E_COMET = process.env.COMPOUND_USDC_E_COMET || "0x0000000000000000000000000000000000000000";
  const WETH_COMET = process.env.COMPOUND_WETH_COMET || "0x0000000000000000000000000000000000000000";

  const COMET_ADDRESSES = [USDC_COMET, USDT_COMET, USDC_E_COMET, WETH_COMET].filter(
    address => address !== "0x0000000000000000000000000000000000000000",
  );

  // Register each Comet
  // addComet accepts ICompoundComet interface, but we can pass the address directly
  const { ethers } = hre;
  for (const cometAddress of COMET_ADDRESSES) {
    try {
      await execute(
        "CompoundGatewayWrite",
        { from: deployer },
        "addComet",
        cometAddress,
      );
      console.log(`Registered Comet: ${cometAddress}`);
    } catch (error) {
      console.warn(`Failed to register Comet ${cometAddress}:`, error);
      // If addComet fails, try using setCometForBase instead (requires base token)
      try {
        const cometContract = await ethers.getContractAt(
          "contracts/v2/interfaces/compound/ICompoundComet.sol:ICompoundComet",
          cometAddress,
        );
        const baseToken = await cometContract.baseToken();
        await execute(
          "CompoundGatewayWrite",
          { from: deployer },
          "setCometForBase",
          baseToken,
          cometAddress,
        );
        console.log(`Registered Comet via setCometForBase: ${cometAddress} for base token: ${baseToken}`);
      } catch (fallbackError) {
        console.error(`Failed to register Comet ${cometAddress} with both methods:`, fallbackError);
      }
    }
  }

  // Deploy view gateway (not registered to router)
  const compoundGatewayView = await deploy("CompoundGatewayView", {
    from: deployer,
    args: [deployer], // owner
    log: true,
    autoMine: true,
    deterministicDeployment: "0x4242424242424242424242424242424242424242",
  });

  console.log(`CompoundGatewayView deployed to: ${compoundGatewayView.address}`);

  // Set write gateway reference in view gateway for syncing
  await execute(
    "CompoundGatewayView",
    { from: deployer },
    "setWriteGateway",
    compoundGatewayWrite.address,
  );
  console.log(`Write gateway reference set in view gateway: ${compoundGatewayWrite.address}`);

  // Register Comets in view gateway (same as write gateway)
  for (const cometAddress of COMET_ADDRESSES) {
    try {
      await execute(
        "CompoundGatewayView",
        { from: deployer },
        "addComet",
        cometAddress,
      );
      console.log(`Registered Comet in view gateway: ${cometAddress}`);
    } catch (error) {
      console.warn(`Failed to register Comet ${cometAddress} in view gateway:`, error);
      // Try setCometForBase as fallback
      try {
        const cometContract = await ethers.getContractAt(
          "contracts/v2/interfaces/compound/ICompoundComet.sol:ICompoundComet",
          cometAddress,
        );
        const baseToken = await cometContract.baseToken();
        await execute(
          "CompoundGatewayView",
          { from: deployer },
          "setCometForBase",
          baseToken,
          cometAddress,
        );
        console.log(`Registered Comet in view gateway via setCometForBase: ${cometAddress} for base token: ${baseToken}`);
      } catch (fallbackError) {
        console.error(`Failed to register Comet ${cometAddress} in view gateway with both methods:`, fallbackError);
      }
    }
  }

  // Set override feeds if provided (matching v1 deployment)
  const WETH_ADDRESS = process.env.WETH_ADDRESS || "0x0000000000000000000000000000000000000000";
  const WETH_PRICE_FEED = process.env.WETH_PRICE_FEED || "0x0000000000000000000000000000000000000000";
  
  if (WETH_ADDRESS !== "0x0000000000000000000000000000000000000000" && WETH_PRICE_FEED !== "0x0000000000000000000000000000000000000000") {
    try {
      await execute(
        "CompoundGatewayView",
        { from: deployer },
        "overrideFeed",
        WETH_ADDRESS,
        WETH_PRICE_FEED,
      );
      console.log(`Set override feed for WETH: ${WETH_ADDRESS} -> ${WETH_PRICE_FEED}`);
    } catch (error) {
      console.warn(`Failed to set override feed for WETH:`, error);
    }
  }

  // Register write gateway with KapanRouter (view gateway is not registered)
  await execute("KapanRouter", { from: deployer }, "addGateway", "compound", compoundGatewayWrite.address);
  console.log(`CompoundGatewayWrite registered with KapanRouter as "compound"`);

  // Skip verification on local networks
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    // Verify the contracts on Etherscan
    await verifyContract(hre, compoundGatewayWrite.address, [kapanRouter.address, deployer]);
    await verifyContract(hre, compoundGatewayView.address, [deployer]);
  }
};

export default deployCompoundGatewayWrite;

deployCompoundGatewayWrite.tags = ["CompoundGatewayWrite", "v2"];
deployCompoundGatewayWrite.dependencies = ["KapanRouter"];

