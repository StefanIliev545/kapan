import {
  deployContract,
  executeDeployCalls,
  exportDeployments,
  deployer,
} from "./deploy-contract";
import { green, red } from "./helpers/colorize-log";
import { CallData, constants } from "starknet";

const deployScriptMainnet = async (): Promise<{ nostraGatewayAddress: string, vesuGatewayAddress: string, routerGatewayAddress: string }> => {
  // Deploy VesuGateway
  const supportedAssets = [
    "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7", // ETH
    "0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac", // WBTC
    "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8", // USDC
    "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8", // USDT
    "0x042b8f0484674ca266ac5d08e4ac6a3fe65bd3129795def2dca5c34ecc5f96d2", // WSTETH
    "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d", // STRK
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

  const { address: routerGatewayAddress } = await deployContract({
    contract: "RouterGateway",
    constructorArgs: {
      _owner: deployer.address,
      flashloan_provider: "0x2545b2e5d519fc230e9cd781046d3a64e092114f07e44771e0d719d148725ef",
    },
  });

  return { nostraGatewayAddress, vesuGatewayAddress, routerGatewayAddress };
};

const deployScriptSepolia = async (): Promise<{ nostraGatewayAddress: string, vesuGatewayAddress: string, routerGatewayAddress: string }> => {
  // Deploy VesuGateway
  const supportedAssets = [
    "0x7bb0505dde7c05f576a6e08e64dadccd7797f14704763a5ad955727be25e5e9", // ETH
    "0xabbd6f1e590eb83addd87ba5ac27960d859b1f17d11a3c1cd6a0006704b141", // WBTC
    "0x715649d4c493ca350743e43915b88d2e6838b1c78ddc23d6d9385446b9d6844", // USDC
    "0x41301316d5313cb7ee3389a04cfb788db7dd600d6369bc1ffd7982d6d808ff4",
    "0x173d770db353707f2bfac025f760d2a45a288e06f56d48d545bcbdcebe3daa2"
    //"0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8", // USDT
    //"0x042b8f0484674ca266ac5d08e4ac6a3fe65bd3129795def2dca5c34ecc5f96d2", // DAI
    //"0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d", // LINK
    //"0x0057912720381af14b0e5c87aa4718ed5e527eab60b3801ebf702ab09139e38b", // UNI
  ];

  const { address: vesuGatewayAddress } = await deployContract({
    contract: "VesuGateway",
    constructorArgs: {
      vesu_singleton: "0x1ecab07456147a8de92b9273dd6789893401e8462a737431493980d9be6827",
      pool_id: "730993554056884283224259059297934576024721456828383733531590831263129347422",
      supported_assets: supportedAssets,
    },
  });

  // Deploy NostraGateway
  const { address: nostraGatewayAddress } = await deployContract({
    contract: "NostraGateway",
    constructorArgs: {
      interest_rate_model: "0x047a2a6ffbbd42713b9aa00c5f489f0a20b92c22188eb8dac64b1fe4901cfa3b",
    },
  });

  await deployContract({
    contract: "OptimalInterestRateFinder",
    constructorArgs: {
      nostra_gateway: vesuGatewayAddress,
      vesu_gateway: vesuGatewayAddress,
    },
  });

  const { address: routerGatewayAddress } = await deployContract({
    contract: "RouterGateway",
    constructorArgs: {
      _owner: deployer.address,
      flashloan_provider: "0x2545b2e5d519fc230e9cd781046d3a64e092114f07e44771e0d719d148725ef",
    },
  });

  return { nostraGatewayAddress, vesuGatewayAddress, routerGatewayAddress };
};

const initializeContracts = async (addresses: {nostraGatewayAddress: string, vesuGatewayAddress: string, routerGatewayAddress: string}): Promise<void> => {

  const nonce = await deployer.getNonce();

  const calls = [
    {
      contractAddress: addresses.nostraGatewayAddress,
      entrypoint: "add_supported_asset",
      calldata: [
        "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7", // ETH
        "0x00ba3037d968790ac486f70acaa9a1cab10cf5843bb85c986624b4d0e5a82e74", // ETH debt
        "0x044debfe17e4d9a5a1e226dabaf286e72c9cc36abbe71c5b847e669da4503893", // ETH collateral
        "0x057146f6409deb4c9fa12866915dd952aa07c1eb2752e451d7f3b042086bdeb8", // ETH ibcollateral
      ],
    },
    {
      contractAddress: addresses.nostraGatewayAddress,
      entrypoint: "add_supported_asset",
      calldata: [
        "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8", // USDC
        "0x063d69ae657bd2f40337c39bf35a870ac27ddf91e6623c2f52529db4c1619a51", // USDC debt
        "0x05f296e1b9f4cf1ab452c218e72e02a8713cee98921dad2d3b5706235e128ee4", // USDC collateral
        "0x05dcd26c25d9d8fd9fc860038dcb6e4d835e524eb8a85213a8cda5b7fff845f6", // USDC ibcollateral
      ],
    },
    {
      contractAddress: addresses.nostraGatewayAddress,
      entrypoint: "add_supported_asset",
      calldata: [
        "0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac", // WBTC
        "0x0491480f21299223b9ce770f23a2c383437f9fbf57abc2ac952e9af8cdb12c97", // WBTC debt
        "0x036b68238f3a90639d062669fdec08c4d0bdd09826b1b6d24ef49de6d8141eaa", // WBTC collateral
        "0x05b7d301fa769274f20e89222169c0fad4d846c366440afc160aafadd6f88f0c", // WBTC ibcollateral
      ],
    },
    {
      contractAddress: addresses.nostraGatewayAddress,
      entrypoint: "add_supported_asset",
      calldata: [
        "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d", // STRK
        "0x001258eae3eae5002125bebf062d611a772e8aea3a1879b64a19f363ebd00947", // STRK debt
        "0x040f5a6b7a6d3c472c12ca31ae6250b462c6d35bbdae17bd52f6c6ca065e30cf", // STRK collateral
        "0x07c2e1e733f28daa23e78be3a4f6c724c0ab06af65f6a95b5e0545215f1abc1b", // STRK ibcollateral
      ],
    },
    {
      contractAddress: addresses.nostraGatewayAddress,
      entrypoint: "add_supported_asset",
      calldata: [
        "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8", // USDT
        "0x024e9b0d6bc79e111e6872bb1ada2a874c25712cf08dfc5bcf0de008a7cca55f", // USDT debt
        "0x0514bd7ee8c97d4286bd481c54aa0793e43edbfb7e1ab9784c4b30469dcf9313", // USDT collateral
        "0x0453c4c996f1047d9370f824d68145bd5e7ce12d00437140ad02181e1d11dc83", // USDT ibcollateral
      ],
    },
    {
      contractAddress: addresses.nostraGatewayAddress,
      entrypoint: "add_supported_asset",
      calldata: [
        "0x042b8f0484674ca266ac5d08e4ac6a3fe65bd3129795def2dca5c34ecc5f96d2", // WSTETH
        "0x0348cc417fc877a7868a66510e8e0d0f3f351f5e6b0886a86b652fcb30a3d1fb", // WSTETH debt
        "0x05eb6de9c7461b3270d029f00046c8a10d27d4f4a4c931a4ea9769c72ef4edbb", // WSTETH collateral
        "0x009377fdde350e01e0397820ea83ed3b4f05df30bfb8cf8055d62cafa1b2106a", // WSTETH ibcollateral
      ],
    },
    {
      contractAddress: addresses.routerGatewayAddress,
      entrypoint: "add_gateway",
      calldata: [
        "vesu",
        addresses.vesuGatewayAddress,
      ]
    },
    {
      contractAddress: addresses.routerGatewayAddress,
      entrypoint: "add_gateway",
      calldata: [
        "nostra",
        addresses.nostraGatewayAddress,
      ]
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

const initializeContractsSepolia = async (addresses: {nostraGatewayAddress: string, vesuGatewayAddress: string, routerGatewayAddress: string}): Promise<void> => {
  const nonce = await deployer.getNonce();

  const calls = [
    {
      contractAddress: addresses.nostraGatewayAddress,
      entrypoint: "add_supported_asset",
      calldata: [
        "0x7bb0505dde7c05f576a6e08e64dadccd7797f14704763a5ad955727be25e5e9", // ETH
        "0x01a7112d034129e5f101b36a920806dc94542a56aea8b084a0f81fb2a217f0b1", // ETH debt
        "0x063bfc57e6d626db7d66c607c2532957fac06d5563cd66e4784791ad0181fd5f", // ETH collateral
        "0x01f3316ef4a582d971900d777b2a0db0ac25614522f14808d8da3db0ff916b30", // ETH ibcollateral
      ],
    },
    {
      contractAddress: addresses.nostraGatewayAddress,
      entrypoint: "add_supported_asset",
      calldata: [
        "0x715649d4c493ca350743e43915b88d2e6838b1c78ddc23d6d9385446b9d6844", // USDC
        "0x07b14654648e9ea6d0821343266037f16570188d3d5ef3999b364dd99e7c7061", // USDC debt
        "0x021c34dcc27e9be68e0bbeaa555dda28f8c754d0ec70e6e8f916326dc939bd24", // USDC collateral
        "0x00e7d28fd5ec0921bf682f0638d6b6dc2b9ebc7f41669443bc4d88447d26e732", // USDC ibcollateral
      ],
    },
    {
      contractAddress: addresses.nostraGatewayAddress,
      entrypoint: "add_supported_asset",
      calldata: [
        "0xabbd6f1e590eb83addd87ba5ac27960d859b1f17d11a3c1cd6a0006704b141", // WBTC
        "0x03724c7609622b15cf35025c0649c39a6d370f7ede668474c6b7421212d66a65", // WBTC debt
        "0x01b436a21c402dab47d28ae52346295dc8a647284a2124196e85db4ed5a65157", // WBTC collateral
        "0x026299c775870406ba193c0ee5ea74b99de9e489eae0df275f9bb19eef88a0ba", // WBTC ibcollateral
      ],
    },
    {
      contractAddress: addresses.routerGatewayAddress,
      entrypoint: "add_gateway",
      calldata: [
        "vesu",
        addresses.vesuGatewayAddress,
      ]
    },
    {
      contractAddress: addresses.routerGatewayAddress,
      entrypoint: "add_gateway",
      calldata: [
        "nostra",
        addresses.nostraGatewayAddress,
      ]
    }
  ];

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
    const gatewayAddress = await deployScriptMainnet();
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
