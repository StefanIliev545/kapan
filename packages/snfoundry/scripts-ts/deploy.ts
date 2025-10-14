import {
  deployContract,
  executeDeployCalls,
  exportDeployments,
  deployer,
  assertRpcNetworkActive,
  assertDeployerSignable,
  assertDeployerDefined,
} from "./deploy-contract";
import { green, red } from "./helpers/colorize-log";
import { CallData } from "starknet";

// ---------- Types & helpers ----------
type AddressHex = `0x${string}`;
type FeltDec = `${string}`; // decimal as string (for pool_id felts)

const assertEq = (a: string, b: string, msg: string) => {
  if (a.toLowerCase() !== b.toLowerCase()) {
    throw new Error(`Sanity check failed: ${msg}\n  left:  ${a}\n  right: ${b}`);
  }
};

// encodes (pool, assets: Array<ContractAddress>) -> [pool, len, ...assets]
const encodePoolAssets = (pool: string, assets: AddressHex[]) => [
  pool,
  assets.length.toString(),
  ...assets,
];

// encodes (pool_address, assets: Array<ContractAddress>) -> [pool_address, len, ...assets]
const encodePoolAddrAssets = (poolAddr: AddressHex, assets: AddressHex[]) => [
  poolAddr,
  assets.length.toString(),
  ...assets,
];

// ---------- Address book ----------
const ADDR = {
  MAINNET: {
    TOKENS: {
      ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7" as AddressHex,
      WBTC: "0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac" as AddressHex,
      USDC: "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8" as AddressHex,
      USDT: "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8" as AddressHex,
      STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d" as AddressHex,
      WSTETH: "0x0057912720381af14b0e5c87aa4718ed5e527eab60b3801ebf702ab09139e38b" as AddressHex,
    },
    EXTERNALS: {
      VESU_SINGLETON:
        "0x000d8d6dfec4d33bfb6895de9f3852143a17c6f92fd2a21da3d6924d34870160" as AddressHex,
      FLASHLOAN_PROVIDER:
        "0x000d8d6dfec4d33bfb6895de9f3852143a17c6f92fd2a21da3d6924d34870160" as AddressHex, // must equal VESU_SINGLETON
      AVNU_ROUTER:
        "0x04270219d365d6b017231b52e92b3fb5d7c8378b05e9abc97724537a80e93b0f" as AddressHex,
      AVNU_OWNER:
        "0x0142e5df37fa2430c77b6dc7676f6e7ed1e7851bee42e272bc856fb89b0b12b8" as AddressHex,
      AVNU_FEE_RECIPIENT:
        "0x0142e5df37fa2430c77b6dc7676f6e7ed1e7851bee42e272bc856fb89b0b12b8" as AddressHex,
      EKUBO_CORE:
        "0x00000005dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b" as AddressHex,
      POOL_FACTORY:
        "0x3760f903a37948f97302736f89ce30290e45f441559325026842b7a6fb388c0" as AddressHex,
    },
    V1: {
      DEFAULT_POOL_ID:
        "2198503327643286920898110335698706244522220458610657370981979460625005526824" as FeltDec,
      RE7_POOL_ID:
        "3592370751539490711610556844458488648008775713878064059760995781404350938653" as FeltDec,
      ALTER_SCOPE_WSTETH_POOL_ID:
        "2612229586214495842527551768232431476062656055007024497123940017576986139174" as FeltDec,
    },
    V2: {
      DEFAULT_POOL_ADDRESS:
        "0x0451fe483d5921a2919ddd81d0de6696669bccdacd859f72a4fba7656b97c3b5" as AddressHex,
    },
    NOSTRA: {
      // Per-asset tuple addresses (debt/collateral/ibcollateral)
      ETH_DEBT: "0x00ba3037d968790ac486f70acaa9a1cab10cf5843bb85c986624b4d0e5a82e74" as AddressHex,
      ETH_COLLATERAL:
        "0x044debfe17e4d9a5a1e226dabaf286e72c9cc36abbe71c5b847e669da4503893" as AddressHex,
      ETH_IBCOLLATERAL:
        "0x057146f6409deb4c9fa12866915dd952aa07c1eb2752e451d7f3b042086bdeb8" as AddressHex,

      USDC_DEBT:
        "0x063d69ae657bd2f40337c39bf35a870ac27ddf91e6623c2f52529db4c1619a51" as AddressHex,
      USDC_COLLATERAL:
        "0x05f296e1b9f4cf1ab452c218e72e02a8713cee98921dad2d3b5706235e128ee4" as AddressHex,
      USDC_IBCOLLATERAL:
        "0x05dcd26c25d9d8fd9fc860038dcb6e4d835e524eb8a85213a8cda5b7fff845f6" as AddressHex,

      WBTC_DEBT:
        "0x0491480f21299223b9ce770f23a2c383437f9fbf57abc2ac952e9af8cdb12c97" as AddressHex,
      WBTC_COLLATERAL:
        "0x036b68238f3a90639d062669fdec08c4d0bdd09826b1b6d24ef49de6d8141eaa" as AddressHex,
      WBTC_IBCOLLATERAL:
        "0x05b7d301fa769274f20e89222169c0fad4d846c366440afc160aafadd6f88f0c" as AddressHex,

      STRK_DEBT:
        "0x001258eae3eae5002125bebf062d611a772e8aea3a1879b64a19f363ebd00947" as AddressHex,
      STRK_COLLATERAL:
        "0x040f5a6b7a6d3c472c12ca31ae6250b462c6d35bbdae17bd52f6c6ca065e30cf" as AddressHex,
      STRK_IBCOLLATERAL:
        "0x07c2e1e733f28daa23e78be3a4f6c724c0ab06af65f6a95b5e0545215f1abc1b" as AddressHex,

      USDT_DEBT:
        "0x024e9b0d6bc79e111e6872bb1ada2a874c25712cf08dfc5bcf0de008a7cca55f" as AddressHex,
      USDT_COLLATERAL:
        "0x0514bd7ee8c97d4286bd481c54aa0793e43edbfb7e1ab9784c4b30469dcf9313" as AddressHex,
      USDT_IBCOLLATERAL:
        "0x0453c4c996f1047d9370f824d68145bd5e7ce12d00437140ad02181e1d11dc83" as AddressHex,

      WSTETH_DEBT:
        "0x0348cc417fc877a7868a66510e8e0d0f3f351f5e6b0886a86b652fcb30a3d1fb" as AddressHex,
      WSTETH_COLLATERAL:
        "0x05eb6de9c7461b3270d029f00046c8a10d27d4f4a4c931a4ea9769c72ef4edbb" as AddressHex,
      WSTETH_IBCOLLATERAL:
        "0x009377fdde350e01e0397820ea83ed3b4f05df30bfb8cf8055d62cafa1b2106a" as AddressHex,
    },
  },

  SEPOLIA: {
    TOKENS: {
      ETH: "0x07bb0505dde7c05f576a6e08e64dadccd7797f14704763a5ad955727be25e5e9" as AddressHex,
      WBTC: "0x0abbd6f1e590eb83addd87ba5ac27960d859b1f17d11a3c1cd6a0006704b141" as AddressHex,
      USDC: "0x0715649d4c493ca350743e43915b88d2e6838b1c78ddc23d6d9385446b9d6844" as AddressHex,
      EXTRA1: "0x041301316d5313cb7ee3389a04cfb788db7dd600d6369bc1ffd7982d6d808ff4" as AddressHex,
      EXTRA2: "0x0173d770db353707f2bfac025f760d2a45a288e06f56d48d545bcbdcebe3daa2" as AddressHex,
    },
    EXTERNALS: {
      VESU_SINGLETON:
        "0x01ecab07456147a8de92b9273dd6789893401e8462a737431493980d9be6827" as AddressHex,
      FLASHLOAN_PROVIDER:
        "0x01ecab07456147a8de92b9273dd6789893401e8462a737431493980d9be6827" as AddressHex,
      EKUBO_CORE:
        "0x00000005dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b" as AddressHex,
      POOL_FACTORY:
        "0x03760f903a37948f97302736f89ce30290e45f441559325026842b7a6fb388c0" as AddressHex,
    },
    V1: {
      DEFAULT_POOL_ID:
        "730993554056884283224259059297934576024721456828383733531590831263129347422" as FeltDec,
      RE7_POOL_ID:
        "3592370751539490711610556844458488648008775713878064059760995781404350938653" as FeltDec,
    },
    V2: {
      DEFAULT_POOL_ADDRESS:
        "0x0451fe483d5921a2919ddd81d0de6696669bccdacd859f72a4fba7656b97c3b5" as AddressHex,
    },
    NOSTRA: {
      ETH_DEBT: "0x03b03b1fa4e67e71c327160863749589f4b86d2ad7633e20ed27d9cc9f9d4ff7" as AddressHex,
      ETH_NCOLLATERAL:
        "0x0168fa06192fab62dae5c363f4f33d43770933389ef7508c298df5b98f6b22a5" as AddressHex,
      ETH_IBCOLLATERAL:
        "0x05a2e5c763496078125a9d23d1538d0d0ed63190e29eff303888a976709ee093" as AddressHex,

      USDC_DEBT:
        "0x071d419001168d9e3812a7a909a74ede4c1fad3fe731b6f0e8ff9cc6cb431bb9" as AddressHex,
      USDC_NCOLLATERAL:
        "0x0743295f7ef1577c257a206ebe149cc75ad903f6199152e57de1fb1213f8cbb3" as AddressHex,
      USDC_IBCOLLATERAL:
        "0x0620ad68e560408144f9fc336c799d73212a4361ca4d32813ba9f441110e446b" as AddressHex,

      WBTC_DEBT:
        "0x02dece90d7518aa4a58aa1f6ec600750d4a03d2304ef06bf809927d25c32354a" as AddressHex,
      WBTC_NCOLLATERAL:
        "0x0295a98cca46b3413c900d919edc77982c8b7e4bebee8d7a5efc21383c6dd049" as AddressHex,
      WBTC_IBCOLLATERAL:
        "0x0138fe69353f77e9a3f8d855ec7a03bc4c5c141fe8e2058f16b54a7b33ceb750" as AddressHex,
    },
  },
} as const;

// ---------- Deploy (mainnet) ----------
const deployScriptMainnet = async (): Promise<{
  nostraGatewayAddress: string;
  vesuGatewayAddress: string;
  vesuGatewayV2Address: string;
  routerGatewayAddress: string;
  ekuboGatewayAddress: string;
  avnuGatewayAddress: string;
}> => {
  const T = ADDR.MAINNET.TOKENS;
  const X = ADDR.MAINNET.EXTERNALS;
  const V1 = ADDR.MAINNET.V1;
  const V2 = ADDR.MAINNET.V2;

  // Sanity: router.flashloan_provider should be the same singleton given to VesuGateway
  assertEq(
    X.FLASHLOAN_PROVIDER,
    X.VESU_SINGLETON,
    "FLASHLOAN_PROVIDER must equal VESU_SINGLETON on mainnet"
  );

  // RouterGateway
  const { address: routerGatewayAddress } = await deployContract({
    contract: "RouterGateway",
    constructorArgs: {
      _owner: deployer.address,
      flashloan_provider: X.FLASHLOAN_PROVIDER,
    },
  });

  // VesuGateway (V1)
  const { address: vesuGatewayAddress } = await deployContract({
    contract: "VesuGateway",
    constructorArgs: {
      vesu_singleton: X.VESU_SINGLETON,
      pool_id: V1.DEFAULT_POOL_ID,
      router: routerGatewayAddress,
      owner: deployer.address,
    },
  });

  // VesuGatewayV2
  const { address: vesuGatewayV2Address } = await deployContract({
    contract: "VesuGatewayV2",
    constructorArgs: {
      default_pool: V2.DEFAULT_POOL_ADDRESS,
      router: routerGatewayAddress,
      owner: deployer.address,
      pool_factory: X.POOL_FACTORY,
    },
  });

  // AvnuGateway
  const { address: avnuGatewayAddress } = await deployContract({
    contract: "AvnuGateway",
    constructorArgs: {
      router: X.AVNU_ROUTER,
      owner: X.AVNU_OWNER,
      fee_recipient: X.AVNU_FEE_RECIPIENT,
      fee_bps: 0,
    },
  });

  // NostraGateway
  const { address: nostraGatewayAddress } = await deployContract({
    contract: "NostraGateway",
    constructorArgs: {
      interest_rate_model:
        "0x059a943ca214c10234b9a3b61c558ac20c005127d183b86a99a8f3c60a08b4ff",
      router: routerGatewayAddress,
      owner: deployer.address,
    },
  });

  // EkuboGateway
  const { address: ekuboGatewayAddress } = await deployContract({
    contract: "EkuboGateway",
    constructorArgs: {
      core: X.EKUBO_CORE,
    },
  });

  // OptimalInterestRateFinder
  await deployContract({
    contract: "OptimalInterestRateFinder",
    constructorArgs: {
      nostra_gateway: nostraGatewayAddress,
      vesu_gateway: vesuGatewayAddress,
      vesu_gateway_v2: vesuGatewayV2Address,
    },
  });

  // UiHelper
  await deployContract({
    contract: "UiHelper",
    constructorArgs: {
      vesu_gateway: vesuGatewayAddress,
    },
  });

  return {
    nostraGatewayAddress,
    vesuGatewayAddress,
    vesuGatewayV2Address,
    routerGatewayAddress,
    ekuboGatewayAddress,
    avnuGatewayAddress,
  };
};

// ---------- Deploy (sepolia) ----------
const deployScriptSepolia = async (): Promise<{
  nostraGatewayAddress: string;
  vesuGatewayAddress: string;
  vesuGatewayV2Address: string;
  routerGatewayAddress: string;
  ekuboGatewayAddress: string;
}> => {
  const T = ADDR.SEPOLIA.TOKENS;
  const X = ADDR.SEPOLIA.EXTERNALS;
  const V1 = ADDR.SEPOLIA.V1;
  const V2 = ADDR.SEPOLIA.V2;

  assertEq(
    X.FLASHLOAN_PROVIDER,
    X.VESU_SINGLETON,
    "FLASHLOAN_PROVIDER must equal VESU_SINGLETON on sepolia"
  );

  // RouterGateway
  const { address: routerGatewayAddress } = await deployContract({
    contract: "RouterGateway",
    constructorArgs: {
      _owner: deployer.address,
      flashloan_provider: X.FLASHLOAN_PROVIDER,
    },
  });

  // VesuGateway (V1)
  const { address: vesuGatewayAddress } = await deployContract({
    contract: "VesuGateway",
    constructorArgs: {
      vesu_singleton: X.VESU_SINGLETON,
      pool_id: V1.DEFAULT_POOL_ID,
      router: routerGatewayAddress,
      owner: deployer.address,
    },
  });

  // VesuGatewayV2
  const { address: vesuGatewayV2Address } = await deployContract({
    contract: "VesuGatewayV2",
    constructorArgs: {
      default_pool: V2.DEFAULT_POOL_ADDRESS,
      router: routerGatewayAddress,
      owner: deployer.address,
      pool_factory: X.POOL_FACTORY,
    },
  });

  // NostraGateway
  const { address: nostraGatewayAddress } = await deployContract({
    contract: "NostraGateway",
    constructorArgs: {
      interest_rate_model:
        "0x02cf4bd3936e99a9f46f3499d1adfe68be8765caef19bf2381e9e4e14a1ca1c6",
      router: routerGatewayAddress,
      owner: deployer.address,
    },
  });

  // EkuboGateway
  const { address: ekuboGatewayAddress } = await deployContract({
    contract: "EkuboGateway",
    constructorArgs: {
      core: X.EKUBO_CORE,
    },
  });

  // OptimalInterestRateFinder
  await deployContract({
    contract: "OptimalInterestRateFinder",
    constructorArgs: {
      nostra_gateway: nostraGatewayAddress,
      vesu_gateway: vesuGatewayAddress,
      vesu_gateway_v2: vesuGatewayV2Address,
    },
  });

  // UiHelper
  await deployContract({
    contract: "UiHelper",
    constructorArgs: {
      vesu_gateway: vesuGatewayAddress,
    },
  });

  return {
    nostraGatewayAddress,
    vesuGatewayAddress,
    vesuGatewayV2Address,
    routerGatewayAddress,
    ekuboGatewayAddress,
  };
};

// ---------- Initialize (mainnet) ----------
const initializeContracts = async (addresses: {
  nostraGatewayAddress: string;
  vesuGatewayAddress: string;
  vesuGatewayV2Address: string;
  routerGatewayAddress: string;
  ekuboGatewayAddress: string;
  avnuGatewayAddress: string;
}): Promise<void> => {
  const T = ADDR.MAINNET.TOKENS;
  const N = ADDR.MAINNET.NOSTRA;
  const V1 = ADDR.MAINNET.V1;
  const V2 = ADDR.MAINNET.V2;

  const nonce = await deployer.getNonce();

  const RE7_POOL = V1.RE7_POOL_ID;
  const ALTER_SCOPE_WSTETH = V1.ALTER_SCOPE_WSTETH_POOL_ID;

  const calls = [
    // ------- Nostra supported assets -------
    {
      contractAddress: addresses.nostraGatewayAddress,
      entrypoint: "add_supported_asset",
      calldata: [
        T.ETH,
        N.ETH_DEBT,
        N.ETH_COLLATERAL,
        N.ETH_IBCOLLATERAL,
      ],
    },
    {
      contractAddress: addresses.nostraGatewayAddress,
      entrypoint: "add_supported_asset",
      calldata: [
        T.USDC,
        N.USDC_DEBT,
        N.USDC_COLLATERAL,
        N.USDC_IBCOLLATERAL,
      ],
    },
    {
      contractAddress: addresses.nostraGatewayAddress,
      entrypoint: "add_supported_asset",
      calldata: [
        T.WBTC,
        N.WBTC_DEBT,
        N.WBTC_COLLATERAL,
        N.WBTC_IBCOLLATERAL,
      ],
    },
    {
      contractAddress: addresses.nostraGatewayAddress,
      entrypoint: "add_supported_asset",
      calldata: [
        T.STRK,
        N.STRK_DEBT,
        N.STRK_COLLATERAL,
        N.STRK_IBCOLLATERAL,
      ],
    },
    {
      contractAddress: addresses.nostraGatewayAddress,
      entrypoint: "add_supported_asset",
      calldata: [
        T.USDT,
        N.USDT_DEBT,
        N.USDT_COLLATERAL,
        N.USDT_IBCOLLATERAL,
      ],
    },
    {
      contractAddress: addresses.nostraGatewayAddress,
      entrypoint: "add_supported_asset",
      calldata: [
        T.WSTETH,
        N.WSTETH_DEBT,
        N.WSTETH_COLLATERAL,
        N.WSTETH_IBCOLLATERAL,
      ],
    },

    // ------- Vesu V1 pools & allowlists -------
    { contractAddress: addresses.vesuGatewayAddress, entrypoint: "add_pool", calldata: [RE7_POOL] },
    {
      contractAddress: addresses.vesuGatewayAddress,
      entrypoint: "add_pool_collaterals",
      calldata: encodePoolAssets(RE7_POOL, [T.ETH, T.WBTC, T.WSTETH, T.STRK, T.USDC]),
    },
    {
      contractAddress: addresses.vesuGatewayAddress,
      entrypoint: "add_pool_debts",
      calldata: encodePoolAssets(RE7_POOL, [T.USDC, T.USDT]),
    },

    { contractAddress: addresses.vesuGatewayAddress, entrypoint: "add_pool", calldata: [ALTER_SCOPE_WSTETH] },
    {
      contractAddress: addresses.vesuGatewayAddress,
      entrypoint: "add_pool_collaterals",
      calldata: encodePoolAssets(ALTER_SCOPE_WSTETH, [T.ETH, T.WBTC, T.WSTETH, T.STRK, T.USDC]),
    },
    {
      contractAddress: addresses.vesuGatewayAddress,
      entrypoint: "add_pool_debts",
      calldata: encodePoolAssets(ALTER_SCOPE_WSTETH, [T.USDC, T.USDT]),
    },

    // ------- Vesu V2 default pool allowlists -------
    {
      contractAddress: addresses.vesuGatewayV2Address,
      entrypoint: "add_pool",
      calldata: [V2.DEFAULT_POOL_ADDRESS],
    },
    {
      contractAddress: addresses.vesuGatewayV2Address,
      entrypoint: "add_pool_collaterals",
      calldata: encodePoolAddrAssets(V2.DEFAULT_POOL_ADDRESS, [
        T.ETH, T.WBTC, T.USDC, T.USDT, T.STRK, T.WSTETH,
      ]),
    },
    {
      contractAddress: addresses.vesuGatewayV2Address,
      entrypoint: "add_pool_debts",
      calldata: encodePoolAddrAssets(V2.DEFAULT_POOL_ADDRESS, [
        T.USDC, T.USDT, T.STRK,
      ]),
    },

    // ------- Router registrations -------
    { contractAddress: addresses.routerGatewayAddress, entrypoint: "add_gateway", calldata: ["vesu", addresses.vesuGatewayAddress] },
    { contractAddress: addresses.routerGatewayAddress, entrypoint: "add_gateway", calldata: ["vesu_v2", addresses.vesuGatewayV2Address] },
    { contractAddress: addresses.routerGatewayAddress, entrypoint: "add_gateway", calldata: ["avnu", addresses.avnuGatewayAddress] },
    { contractAddress: addresses.routerGatewayAddress, entrypoint: "add_gateway", calldata: ["nostra", addresses.nostraGatewayAddress] },
    { contractAddress: addresses.routerGatewayAddress, entrypoint: "add_gateway", calldata: ["ekubo", addresses.ekuboGatewayAddress] },
  ];

  const fee = await deployer.estimateInvokeFee(calls, { nonce });
  const result = await deployer.execute(calls, {
    nonce,
    resourceBounds: fee.resourceBounds,
  });

  const txR = await deployer.waitForTransaction(result.transaction_hash);
  if (!txR.isSuccess()) {
    console.log(red(`Failed to initialize contracts: ${JSON.stringify(txR.value)}`));
    throw new Error("Failed to initialize contracts");
  }
};

// ---------- Initialize (sepolia) ----------
const initializeContractsSepolia = async (addresses: {
  nostraGatewayAddress: string;
  vesuGatewayAddress: string;
  vesuGatewayV2Address: string;
  routerGatewayAddress: string;
  ekuboGatewayAddress: string;
}): Promise<void> => {
  const T = ADDR.SEPOLIA.TOKENS;
  const N = ADDR.SEPOLIA.NOSTRA;

  const nonce = await deployer.getNonce();

  const calls = [
    // Nostra
    {
      contractAddress: addresses.nostraGatewayAddress,
      entrypoint: "add_supported_asset",
      calldata: [T.ETH, N.ETH_DEBT, N.ETH_NCOLLATERAL, N.ETH_IBCOLLATERAL],
    },
    {
      contractAddress: addresses.nostraGatewayAddress,
      entrypoint: "add_supported_asset",
      calldata: [T.USDC, N.USDC_DEBT, N.USDC_NCOLLATERAL, N.USDC_IBCOLLATERAL],
    },
    {
      contractAddress: addresses.nostraGatewayAddress,
      entrypoint: "add_supported_asset",
      calldata: [T.WBTC, N.WBTC_DEBT, N.WBTC_NCOLLATERAL, N.WBTC_IBCOLLATERAL],
    },

    // Router registrations
    { contractAddress: addresses.routerGatewayAddress, entrypoint: "add_gateway", calldata: ["vesu", addresses.vesuGatewayAddress] },
    { contractAddress: addresses.routerGatewayAddress, entrypoint: "add_gateway", calldata: ["vesu_v2", addresses.vesuGatewayV2Address] },
    { contractAddress: addresses.routerGatewayAddress, entrypoint: "add_gateway", calldata: ["nostra", addresses.nostraGatewayAddress] },
    { contractAddress: addresses.routerGatewayAddress, entrypoint: "add_gateway", calldata: ["ekubo", addresses.ekuboGatewayAddress] },
  ];

  const fee = await deployer.estimateInvokeFee(calls, { nonce });
  const result = await deployer.execute(calls, {
    nonce,
    resourceBounds: fee.resourceBounds,
  });

  const txR = await deployer.waitForTransaction(result.transaction_hash);
  if (!txR.isSuccess()) {
    console.log(red(`Failed to initialize contracts: ${JSON.stringify(txR.value)}`));
    throw new Error("Failed to initialize contracts");
  }
};

// ---------- Entry ----------
const main = async (): Promise<void> => {
  try {
    assertDeployerDefined();
    await Promise.all([assertRpcNetworkActive(), assertDeployerSignable()]);

    const gatewayAddress = await deployScriptMainnet();
    await executeDeployCalls();
    await initializeContracts(gatewayAddress);
    exportDeployments();

    console.log(green("All Setup Done!"));
  } catch (err) {
    console.log(err);
    process.exit(1);
  }
};

main();