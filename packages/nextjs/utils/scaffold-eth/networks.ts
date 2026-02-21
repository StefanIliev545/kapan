import {
  type Chain,
  mainnet,
  goerli,
  sepolia,
  optimism,
  optimismGoerli,
  optimismSepolia,
  arbitrum,
  arbitrumGoerli,
  arbitrumSepolia,
  polygon,
  polygonMumbai,
  polygonAmoy,
  astar,
  polygonZkEvm,
  polygonZkEvmTestnet,
  base,
  baseGoerli,
  baseSepolia,
  celo,
  celoAlfajores,
  hardhat,
  gnosis,
  fantom,
  fantomTestnet,
  scrollSepolia,
} from "viem/chains";
import scaffoldConfig from "~~/scaffold.config";

type ChainAttributes = {
  // color | [lightThemeColor, darkThemeColor]
  color: string | [string, string];
  // Used to fetch price by providing mainnet token address
  // for networks having native currency other than ETH
  nativeCurrencyTokenAddress?: string;
};

export type ChainWithAttributes = Chain & Partial<ChainAttributes>;
export type AllowedChainIds = (typeof scaffoldConfig.targetEVMNetworks)[number]["id"];

// Mapping of chainId to RPC chain name an format followed by alchemy and infura
export const RPC_CHAIN_NAMES: Record<number, string> = {
  [mainnet.id]: "eth-mainnet",
  [goerli.id]: "eth-goerli",
  [sepolia.id]: "eth-sepolia",
  [optimism.id]: "opt-mainnet",
  [optimismGoerli.id]: "opt-goerli",
  [optimismSepolia.id]: "opt-sepolia",
  [arbitrum.id]: "arb-mainnet",
  [arbitrumGoerli.id]: "arb-goerli",
  [arbitrumSepolia.id]: "arb-sepolia",
  [polygon.id]: "polygon-mainnet",
  [polygonMumbai.id]: "polygon-mumbai",
  [polygonAmoy.id]: "polygon-amoy",
  [astar.id]: "astar-mainnet",
  [polygonZkEvm.id]: "polygonzkevm-mainnet",
  [polygonZkEvmTestnet.id]: "polygonzkevm-testnet",
  [base.id]: "base-mainnet",
  [baseGoerli.id]: "base-goerli",
  [baseSepolia.id]: "base-sepolia",
  [celo.id]: "celo-mainnet",
  [celoAlfajores.id]: "celo-alfajores",
};

export const getAlchemyHttpUrl = (chainId: number) => {
  return scaffoldConfig.alchemyApiKey && RPC_CHAIN_NAMES[chainId]
    ? `https://${RPC_CHAIN_NAMES[chainId]}.g.alchemy.com/v2/${scaffoldConfig.alchemyApiKey}`
    : undefined;
};

export const NETWORKS_EXTRA_DATA: Record<string, ChainAttributes> = {
  [hardhat.id]: {
    color: "#b8af0c",
  },
  [mainnet.id]: {
    color: "#ff8b9e",
  },
  [sepolia.id]: {
    color: ["#5f4bb6", "#87ff65"],
  },
  [gnosis.id]: {
    color: "#48a9a6",
  },
  [polygon.id]: {
    color: "#2bbdf7",
    nativeCurrencyTokenAddress: "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0",
  },
  [polygonMumbai.id]: {
    color: "#92D9FA",
    nativeCurrencyTokenAddress: "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0",
  },
  [optimismSepolia.id]: {
    color: "#f01a37",
  },
  [optimism.id]: {
    color: "#f01a37",
  },
  [arbitrumSepolia.id]: {
    color: "#28a0f0",
  },
  [arbitrum.id]: {
    color: "#28a0f0",
  },
  [fantom.id]: {
    color: "#1969ff",
  },
  [fantomTestnet.id]: {
    color: "#1969ff",
  },
  [scrollSepolia.id]: {
    color: "#fbebd4",
  },
  [celo.id]: {
    color: "#FCFF52",
  },
  [celoAlfajores.id]: {
    color: "#476520",
  },
};

/** All chains known to this module, indexed by ID for fast lookup. */
const KNOWN_CHAINS = new Map<number, Chain>(
  [
    mainnet, goerli, sepolia, optimism, optimismGoerli, optimismSepolia,
    arbitrum, arbitrumGoerli, arbitrumSepolia, polygon, polygonMumbai,
    polygonAmoy, astar, polygonZkEvm, polygonZkEvmTestnet, base, baseGoerli,
    baseSepolia, celo, celoAlfajores, hardhat, gnosis, fantom, fantomTestnet,
    scrollSepolia,
    // Also include scaffold target networks (may include custom chains like localhost)
    ...scaffoldConfig.targetEVMNetworks,
  ].map(c => [c.id, c]),
);

/**
 * Gives the block explorer transaction URL, returns empty string if the network is a local chain
 */
export function getBlockExplorerTxLink(chainId: number, txnHash: string) {
  const chain = KNOWN_CHAINS.get(chainId);
  if (!chain) return "";

  const blockExplorerTxURL = chain.blockExplorers?.default?.url;
  if (!blockExplorerTxURL) return "";

  return `${blockExplorerTxURL}/tx/${txnHash}`;
}

/**
 * Gives the block explorer URL for a given address.
 * Defaults to Etherscan if no (wagmi) block explorer is configured for the network.
 */
export function getBlockExplorerAddressLink(network: Chain, address: string) {
  const blockExplorerBaseURL = network.blockExplorers?.default?.url;
  if (network.id === hardhat.id) {
    return `/blockexplorer/address/${address}`;
  }

  if (!blockExplorerBaseURL) {
    return `https://etherscan.io/address/${address}`;
  }

  return `${blockExplorerBaseURL}/address/${address}`;
}

/**
 * @returns targetNetworks array containing networks configured in scaffold.config including extra network metadata
 */
export function getTargetNetworks(): ChainWithAttributes[] {
  return scaffoldConfig.targetEVMNetworks.map(targetNetwork => ({
    ...targetNetwork,
    ...NETWORKS_EXTRA_DATA[targetNetwork.id],
  }));
}
