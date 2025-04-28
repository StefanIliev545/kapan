import {
  deployContract,
  executeDeployCalls,
  exportDeployments,
  deployer,
} from "./deploy-contract";
import { green, red } from "./helpers/colorize-log";
import { CallData, constants } from "starknet";

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
    //"0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8", // USDT
    //"0x042b8f0484674ca266ac5d08e4ac6a3fe65bd3129795def2dca5c34ecc5f96d2", // DAI
    //"0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d", // LINK
    //"0x0057912720381af14b0e5c87aa4718ed5e527eab60b3801ebf702ab09139e38b", // UNI
  ];

  const { address: vesuGatewayAddress } = await deployContract({
    contract: "VesuGateway",
    constructorArgs: {
      vesu_singleton: "0x2545b2e5d519fc230e9cd781046d3a64e092114f07e44771e0d719d148725ef",
      pool_id: "2198503327643286920898110335698706244522220458610657370981979460625005526824",
      supported_assets: supportedAssets,
    },
  });

  // Deploy NostraGateway
  const { address: nostraGatewayAddress } = await deployContract({
    contract: "NostraGateway",
    constructorArgs: {
      interest_rate_model: "0x059a943ca214c10234b9a3b61c558ac20c005127d183b86a99a8f3c60a08b4ff",
    },
  });

  await deployContract({
    contract: "OptimalInterestRateFinder",
    constructorArgs: {
      nostra_gateway: nostraGatewayAddress,
      vesu_gateway: vesuGatewayAddress,
    },
  });

  return nostraGatewayAddress;
};

const initializeContracts = async (gatewayAddress: string): Promise<void> => {

  const nonce = await deployer.getNonce();

  const calls = [
    {
      contractAddress: gatewayAddress,
      entrypoint: "add_supported_asset",
      calldata: [
        "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7", // ETH
        "0x00ba3037d968790ac486f70acaa9a1cab10cf5843bb85c986624b4d0e5a82e74", // ETH debt
        "0x044debfe17e4d9a5a1e226dabaf286e72c9cc36abbe71c5b847e669da4503893", // ETH collateral
        "0x057146f6409deb4c9fa12866915dd952aa07c1eb2752e451d7f3b042086bdeb8", // ETH ibcollateral
      ],
    },
    {
      contractAddress: gatewayAddress,
      entrypoint: "add_supported_asset",
      calldata: [
        "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8", // USDC
        "0x063d69ae657bd2f40337c39bf35a870ac27ddf91e6623c2f52529db4c1619a51", // USDC debt
        "0x05f296e1b9f4cf1ab452c218e72e02a8713cee98921dad2d3b5706235e128ee4", // USDC collateral
        "0x05dcd26c25d9d8fd9fc860038dcb6e4d835e524eb8a85213a8cda5b7fff845f6", // USDC ibcollateral
      ],
    },
    {
      contractAddress: gatewayAddress,
      entrypoint: "add_supported_asset",
      calldata: [
        "0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac", // WBTC
        "0x0491480f21299223b9ce770f23a2c383437f9fbf57abc2ac952e9af8cdb12c97", // WBTC debt
        "0x036b68238f3a90639d062669fdec08c4d0bdd09826b1b6d24ef49de6d8141eaa", // WBTC collateral
        "0x05b7d301fa769274f20e89222169c0fad4d846c366440afc160aafadd6f88f0c", // WBTC ibcollateral
      ],
    }
  ]

  const fee = await deployer.estimateInvokeFee(calls, {
    nonce: nonce,
    version: constants.TRANSACTION_VERSION.V3,
  });
  const result = await deployer.execute(
    calls,
    {
      nonce: nonce,
      version: constants.TRANSACTION_VERSION.V3,
      resourceBounds: fee.resourceBounds,
    }
  );

  const txR = await deployer.waitForTransaction(result.transaction_hash);
  if (!txR.isSuccess()) {
    console.log(red(`Failed to initialize contracts: ${JSON.stringify(txR.value)}`));
    throw new Error("Failed to initialize contracts");
  }
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
