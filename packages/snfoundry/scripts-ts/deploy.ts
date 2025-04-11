import {
  deployContract,
  executeDeployCalls,
  exportDeployments,
  deployer,
} from "./deploy-contract";
import { green } from "./helpers/colorize-log";
import { CallData, stark } from "starknet";

/**
 * Deploy a contract using the specified parameters.
 *
 * @example (deploy contract with constructorArgs)
 * const deployScript = async (): Promise<void> => {
 *   await deployContract(
 *     {
 *       contract: "YourContract",
 *       contractName: "YourContractExportName",
 *       constructorArgs: {
 *         owner: deployer.address,
 *       },
 *       options: {
 *         maxFee: BigInt(1000000000000)
 *       }
 *     }
 *   );
 * };
 *
 * @example (deploy contract without constructorArgs)
 * const deployScript = async (): Promise<void> => {
 *   await deployContract(
 *     {
 *       contract: "YourContract",
 *       contractName: "YourContractExportName",
 *       options: {
 *         maxFee: BigInt(1000000000000)
 *       }
 *     }
 *   );
 * };
 *
 *
 * @returns {Promise<void>}
 */
const deployScript = async (): Promise<string> => {
  // Deploy VesuGateway
  const supportedAssets = [
    "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7", // ETH
    "0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac", // WBTC
    "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8", // USDC
    "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8", // USDT
    "0x042b8f0484674ca266ac5d08e4ac6a3fe65bd3129795def2dca5c34ecc5f96d2", // DAI
    "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d", // LINK
    "0x0057912720381af14b0e5c87aa4718ed5e527eab60b3801ebf702ab09139e38b", // UNI
  ];

  const { address: gatewayAddress } = await deployContract({
    contract: "VesuGateway",
    constructorArgs: {
      vesu_singleton: "0x2545b2e5d519fc230e9cd781046d3a64e092114f07e44771e0d719d148725ef",
      pool_id: "2198503327643286920898110335698706244522220458610657370981979460625005526824",
      supported_assets: supportedAssets,
    },
  });
  return gatewayAddress;
};

const initializeContracts = async (gatewayAddress: string): Promise<void> => {
};

const main = async (): Promise<void> => {
  try {
    const gatewayAddress = await deployScript();
    await executeDeployCalls();
    await initializeContracts(gatewayAddress);
    exportDeployments();

    console.log(green("All Setup Done!"));
  } catch (err) {
    console.log(err);
    process.exit(1); //exit with error so that non subsequent scripts are run
  }
};

main();
