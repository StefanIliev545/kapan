import { supportedChains as snchains } from "./supportedChains";
import { Chain as SNChain } from "@starknet-react/chains";
import * as chains from "viem/chains";
import { defineChain } from "viem";

export type ScaffoldConfig = {
  targetEVMNetworks: readonly chains.Chain[];
  targetSNNetworks: readonly SNChain[];
  pollingInterval: number;
  alchemyApiKey: string;
  walletConnectProjectId: string;
  onlyLocalBurnerWallet: boolean;
  autoConnectTTL: number;
  walletAutoConnect: boolean;
};

export const DEFAULT_ALCHEMY_API_KEY = "oKxs-03sij-U_N0iOlrSsZFr29-IqbuF";

// Custom localhost chain that matches Hardhat's chainId (31337)
// This allows deploying to --network hardhat (which uses chainId 31337) 
// while using localhost in the frontend config
const localhost = defineChain({
  id: 31337,
  name: "Hardhat",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: ["http://127.0.0.1:8545"],
    },
    public: {
      http: ["http://127.0.0.1:8545"],
    },
  },
});

const scaffoldConfig = {
  // The networks on which your DApp is live
  // Using custom localhost chain with chainId 31337 to match Hardhat network deployments
  targetEVMNetworks: [chains.arbitrum, chains.base, chains.optimism, chains.linea, chains.hardhat/*localhost*/],
  targetSNNetworks: [snchains.mainnet],
  // The interval at which your front-end polls the RPC servers for new data
  // it has no effect if you only target the local network (default is 4000)
  pollingInterval: 30000,

  // This is ours Alchemy's default API key.
  // You can get your own at https://dashboard.alchemyapi.io
  // It's recommended to store it in an env variable:
  // .env.local for local testing, and in the Vercel/system env config for live apps.
  alchemyApiKey: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || DEFAULT_ALCHEMY_API_KEY,

  // This is ours WalletConnect's default project ID.
  // You can get your own at https://cloud.walletconnect.com
  // It's recommended to store it in an env variable:
  // .env.local for local testing, and in the Vercel/system env config for live apps.
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || "3a8170812b534d0ff9d794f19a901d64",

  // Only show the Burner Wallet when running on hardhat network
  onlyLocalBurnerWallet: true,
  autoConnectTTL: 60000,
  walletAutoConnect: true,
} as const satisfies ScaffoldConfig;

export default scaffoldConfig;
