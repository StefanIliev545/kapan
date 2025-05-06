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

  const { address: routerGatewayAddress } = await deployContract({
    contract: "RouterGateway",
    constructorArgs: {
      _owner: deployer.address,
      flashloan_provider: "0x2545b2e5d519fc230e9cd781046d3a64e092114f07e44771e0d719d148725ef",
    },
  });

  const { address: vesuGatewayAddress } = await deployContract({
    contract: "VesuGateway",
    constructorArgs: {
      vesu_singleton: "0x2545b2e5d519fc230e9cd781046d3a64e092114f07e44771e0d719d148725ef",
      pool_id: "2198503327643286920898110335698706244522220458610657370981979460625005526824",
      router: routerGatewayAddress,
      supported_assets: supportedAssets,
    },
  });

  // Deploy NostraGateway
  const { address: nostraGatewayAddress } = await deployContract({
    contract: "NostraGateway",
    constructorArgs: {
      interest_rate_model: "0x059a943ca214c10234b9a3b61c558ac20c005127d183b86a99a8f3c60a08b4ff",
      router: routerGatewayAddress,
    },
  });

  await deployContract({
    contract: "OptimalInterestRateFinder",
    constructorArgs: {
      nostra_gateway: nostraGatewayAddress,
      vesu_gateway: vesuGatewayAddress,
    },
  });

  await deployContract({
    contract: "UiHelper",
    constructorArgs: {
      vesu_gateway: vesuGatewayAddress,
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

  
  const { address: routerGatewayAddress } = await deployContract({
    contract: "RouterGateway",
    constructorArgs: {
      _owner: deployer.address,
      flashloan_provider: "0x1ecab07456147a8de92b9273dd6789893401e8462a737431493980d9be6827",
    },
  });


  const { address: vesuGatewayAddress } = await deployContract({
    contract: "VesuGateway",
    constructorArgs: {
      vesu_singleton: "0x1ecab07456147a8de92b9273dd6789893401e8462a737431493980d9be6827",
      pool_id: "730993554056884283224259059297934576024721456828383733531590831263129347422",
      router: routerGatewayAddress,
      supported_assets: supportedAssets,
    },
  });

  // Deploy NostraGateway
  const { address: nostraGatewayAddress } = await deployContract({
    contract: "NostraGateway",
    constructorArgs: {
      interest_rate_model: "0x02cf4bd3936e99a9f46f3499d1adfe68be8765caef19bf2381e9e4e14a1ca1c6",
      router: routerGatewayAddress,
    },
  });

  await deployContract({
    contract: "OptimalInterestRateFinder",
    constructorArgs: {
      nostra_gateway: vesuGatewayAddress,
      vesu_gateway: vesuGatewayAddress,
    },
  });


  await deployContract({
    contract: "UiHelper",
    constructorArgs: {
      vesu_gateway: vesuGatewayAddress,
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
        "0x03b03b1fa4e67e71c327160863749589f4b86d2ad7633e20ed27d9cc9f9d4ff7", // ETH debt
        "0x0168fa06192fab62dae5c363f4f33d43770933389ef7508c298df5b98f6b22a5", // ETH Ncollateral
        "0x05a2e5c763496078125a9d23d1538d0d0ed63190e29eff303888a976709ee093", // ETH ibcollateral
      ],
    },
    {
      contractAddress: addresses.nostraGatewayAddress,
      entrypoint: "add_supported_asset",
      calldata: [
        "0x715649d4c493ca350743e43915b88d2e6838b1c78ddc23d6d9385446b9d6844", // USDC
        "0x071d419001168d9e3812a7a909a74ede4c1fad3fe731b6f0e8ff9cc6cb431bb9", // USDC debt
        "0x0743295f7ef1577c257a206ebe149cc75ad903f6199152e57de1fb1213f8cbb3", // USDC Ncollateral
        "0x0620ad68e560408144f9fc336c799d73212a4361ca4d32813ba9f441110e446b", // USDC ibcollateral
      ],
    },
    {
      contractAddress: addresses.nostraGatewayAddress,
      entrypoint: "add_supported_asset",
      calldata: [
        "0xabbd6f1e590eb83addd87ba5ac27960d859b1f17d11a3c1cd6a0006704b141", // WBTC
        "0x02dece90d7518aa4a58aa1f6ec600750d4a03d2304ef06bf809927d25c32354a", // WBTC debt
        "0x0295a98cca46b3413c900d919edc77982c8b7e4bebee8d7a5efc21383c6dd049", // WBTC Ncollateral
        "0x0138fe69353f77e9a3f8d855ec7a03bc4c5c141fe8e2058f16b54a7b33ceb750", // WBTC ibcollateral
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
    const gatewayAddress = await deployScriptSepolia();
    await executeDeployCalls();
    await initializeContractsSepolia(gatewayAddress);
    exportDeployments();

    console.log(green("All Setup Done!"));
  } catch (err) {
    console.log(err);
    process.exit(1); //exit with error so that non subsequent scripts are run
  }
};

main();
