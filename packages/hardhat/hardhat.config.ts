import * as dotenv from "dotenv";
dotenv.config();
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "@nomicfoundation/hardhat-verify";
import "hardhat-deploy";
import "hardhat-deploy-ethers";
import { task } from "hardhat/config";
import generateTsAbis from "./scripts/generateTsAbis";

// If not set, it uses ours Alchemy's default API key.
// You can get your own at https://dashboard.alchemyapi.io
const providerApiKey = process.env.ALCHEMY_API_KEY || "oKxs-03sij-U_N0iOlrSsZFr29-IqbuF";

// Fork chain configuration - set FORK_CHAIN to switch between chains
// Supported: arbitrum (default), ethereum, base, optimism, linea
// Also accepts short forms: arb, eth, op
const FORK_CHAIN_INPUT = (process.env.FORK_CHAIN || "arbitrum").toLowerCase();
const FORK_RPC_URLS: Record<string, string> = {
  arbitrum: `https://arb-mainnet.g.alchemy.com/v2/${providerApiKey}`,
  arb: `https://arb-mainnet.g.alchemy.com/v2/${providerApiKey}`,
  ethereum: `https://eth-mainnet.g.alchemy.com/v2/${providerApiKey}`,
  eth: `https://eth-mainnet.g.alchemy.com/v2/${providerApiKey}`,
  mainnet: `https://eth-mainnet.g.alchemy.com/v2/${providerApiKey}`,
  base: `https://base-mainnet.g.alchemy.com/v2/${providerApiKey}`,
  optimism: `https://opt-mainnet.g.alchemy.com/v2/${providerApiKey}`,
  op: `https://opt-mainnet.g.alchemy.com/v2/${providerApiKey}`,
  linea: `https://linea-mainnet.g.alchemy.com/v2/${providerApiKey}`,
};

// Fuzzy match for typos like "etheum" -> "ethereum"
function matchForkChain(input: string): string {
  if (FORK_RPC_URLS[input]) return input;
  for (const key of Object.keys(FORK_RPC_URLS)) {
    if (key.startsWith(input) || input.startsWith(key)) return key;
  }
  return "arbitrum";
}

const FORK_CHAIN = matchForkChain(FORK_CHAIN_INPUT);
const forkUrl = FORK_RPC_URLS[FORK_CHAIN];

// Pin to specific block numbers for faster caching (update periodically)
const FORK_BLOCK_NUMBERS: Record<string, number> = {
  ethereum: 21350000,  // ~Dec 2024
  eth: 21350000,
  mainnet: 21350000,
  arbitrum: 280000000, // ~Dec 2024
  arb: 280000000,
  base: 23500000,      // ~Dec 2024
  optimism: 129000000, // ~Dec 2024
  op: 129000000,
  linea: 13000000,     // ~Dec 2024
};
const forkBlockNumber = FORK_BLOCK_NUMBERS[FORK_CHAIN];

if (FORK_CHAIN_INPUT !== FORK_CHAIN) {
  console.log(`⚠️  FORK_CHAIN="${FORK_CHAIN_INPUT}" matched to "${FORK_CHAIN}"`);
}
console.log(`🍴 Forking ${FORK_CHAIN} (${forkUrl.split('/v2/')[0]})${forkBlockNumber ? ` at block ${forkBlockNumber}` : ''}`);
// If not set, it uses the hardhat account 0 private key.
// You can generate a random account with `yarn generate` or `yarn account:import` to import your existing PK
const deployerPrivateKey =
  process.env.__RUNTIME_DEPLOYER_PRIVATE_KEY ?? "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
// If not set, it uses our block explorers default API keys.
// Etherscan V2 API uses a single API key for all supported chains
const etherscanApiKey = process.env.ETHERSCAN_API_KEY || "DNXJA8RX2Q3VZ4URQIWP7Z68CJXQZSC6AW";
const polygonscanApiKey = process.env.POLYGONSCAN_API_KEY || "";
const bscscanApiKey = process.env.BSCSCAN_API_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.30",
        settings: {
          evmVersion: "cancun",
          optimizer: {
            enabled: true,
            // https://docs.soliditylang.org/en/latest/using-the-compiler.html#optimizer-options
            runs: 200,
          },
          viaIR: true,
        },
      },
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  defaultNetwork: "hardhat",
  namedAccounts: {
    deployer: {
      // By default, it will take the first Hardhat account as the deployer
      default: 0,
    },
  },
  networks: {
    // View the networks that are pre-configured.
    // If the network you are looking for is not here you can add new network settings
    hardhat: {
      hardfork: "cancun",
      forking: {
        // Fork chain controlled by FORK_CHAIN env var (arbitrum, ethereum, base, optimism, linea)
        url: forkUrl,
        enabled: process.env.MAINNET_FORKING_ENABLED === "true",
        // Pin to block number for faster caching (set FORK_BLOCK=latest to disable)
        ...(forkBlockNumber && process.env.FORK_BLOCK !== "latest" ? { blockNumber: forkBlockNumber } : {}),
      },
      mining: {
        auto: true,
        interval: 1000
      }
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      saveDeployments: true,
    },
    mainnet: {
      url: `https://eth-mainnet.alchemyapi.io/v2/${providerApiKey}`,
      accounts: [deployerPrivateKey],
    },
    sepolia: {
      url: `https://eth-sepolia.g.alchemy.com/v2/${providerApiKey}`,
      accounts: [deployerPrivateKey],
    },
    arbitrum: {
      url: `https://arb-mainnet.g.alchemy.com/v2/${providerApiKey}`,
      chainId: 42161,
      accounts: [deployerPrivateKey],
    },
    arbitrumSepolia: {
      url: `https://arb-sepolia.g.alchemy.com/v2/${providerApiKey}`,
      chainId: 421614,
      accounts: [deployerPrivateKey],
    },
    optimism: {
      url: `https://opt-mainnet.g.alchemy.com/v2/${providerApiKey}`,
      chainId: 10,
      accounts: [deployerPrivateKey],
    },
    optimismSepolia: {
      url: `https://opt-sepolia.g.alchemy.com/v2/${providerApiKey}`,
      chainId: 11155420,
      accounts: [deployerPrivateKey],
    },
    linea: {
      url: `https://linea-mainnet.g.alchemy.com/v2/${providerApiKey}`,
      chainId: 59144,
      accounts: [deployerPrivateKey],
    },
    polygon: {
      url: `https://polygon-mainnet.g.alchemy.com/v2/${providerApiKey}`,
      accounts: [deployerPrivateKey],
      verify: {
        etherscan: {
          apiUrl: "https://api.polygonscan.com",
          apiKey: polygonscanApiKey,
        },
      },
    },
    polygonMumbai: {
      url: `https://polygon-mumbai.g.alchemy.com/v2/${providerApiKey}`,
      accounts: [deployerPrivateKey],
      verify: {
        etherscan: {
          apiUrl: "https://api-testnet.polygonscan.com",
          apiKey: polygonscanApiKey,
        },
      },
    },
    polygonZkEvm: {
      url: `https://polygonzkevm-mainnet.g.alchemy.com/v2/${providerApiKey}`,
      accounts: [deployerPrivateKey],
    },
    polygonZkEvmTestnet: {
      url: `https://polygonzkevm-testnet.g.alchemy.com/v2/${providerApiKey}`,
      accounts: [deployerPrivateKey],
    },
    gnosis: {
      url: "https://rpc.gnosischain.com",
      accounts: [deployerPrivateKey],
    },
    chiado: {
      url: "https://rpc.chiadochain.net",
      accounts: [deployerPrivateKey],
    },
    base: {
      url: `https://base-mainnet.g.alchemy.com/v2/${providerApiKey}`,
      chainId: 8453,
      accounts: [deployerPrivateKey],
    },
    baseSepolia: {
      url: `https://base-sepolia.g.alchemy.com/v2/${providerApiKey}`,
      chainId: 84532,
      accounts: [deployerPrivateKey],
    },
    scrollSepolia: {
      url: "https://sepolia-rpc.scroll.io",
      accounts: [deployerPrivateKey],
    },
    scroll: {
      url: "https://rpc.scroll.io",
      accounts: [deployerPrivateKey],
    },
    pgn: {
      url: "https://rpc.publicgoods.network",
      accounts: [deployerPrivateKey],
    },
    pgnTestnet: {
      url: "https://sepolia.publicgoods.network",
      accounts: [deployerPrivateKey],
    },
    celo: {
      url: "https://forno.celo.org",
      accounts: [deployerPrivateKey],
    },
    celoAlfajores: {
      url: "https://alfajores-forno.celo-testnet.org",
      accounts: [deployerPrivateKey],
    },
    bnb: {
      url: "https://bsc-dataseed.binance.org",
      accounts: [deployerPrivateKey],
      verify: {
        etherscan: {
          apiUrl: "https://api.bscscan.com",
          apiKey: bscscanApiKey,
        },
      },
    },
    bnbTestnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545",
      accounts: [deployerPrivateKey],
      verify: {
        etherscan: {
          apiUrl: "https://api-testnet.bscscan.com",
          apiKey: bscscanApiKey,
        },
      },
    },
  },
  // configuration for hardhat-verify plugin (Etherscan V2 API)
  // V2 API uses a single apiKey for all networks - the plugin automatically adds chainId
  etherscan: {
    apiKey: etherscanApiKey,  // Single Etherscan.io API key for V2 API
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api",  // V2 aggregator - plugin adds chainId automatically
          browserURL: "https://basescan.org",
        },
      },
      {
        network: "linea",
        chainId: 59144,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api",  // V2 aggregator - plugin adds chainId automatically
          browserURL: "https://lineascan.build",
        },
      },
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api",  // V2 aggregator - plugin adds chainId automatically
          browserURL: "https://sepolia.basescan.org",
        },
      },
      {
        network: "arbitrum",
        chainId: 42161,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api",  // V2 aggregator - plugin adds chainId automatically
          browserURL: "https://arbiscan.io",
        },
      },
      {
        network: "arbitrumSepolia",
        chainId: 421614,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api",  // V2 aggregator - plugin adds chainId automatically
          browserURL: "https://sepolia.arbiscan.io",
        },
      },
      {
        network: "optimism",
        chainId: 10,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api",  // V2 aggregator - plugin adds chainId automatically
          browserURL: "https://optimistic.etherscan.io",
        },
      },
      {
        network: "optimisticSepolia",
        chainId: 11155420,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api",  // V2 aggregator - plugin adds chainId automatically
          browserURL: "https://sepolia-optimistic.etherscan.io",
        },
      },
      {
        network: "bnb",
        chainId: 56,
        urls: {
          apiURL: "https://api.bscscan.com/api",
          browserURL: "https://bscscan.com",
        },
      },
      {
        network: "bnbTestnet",
        chainId: 97,
        urls: {
          apiURL: "https://api-testnet.bscscan.com/api",
          browserURL: "https://testnet.bscscan.com",
        },
      },
    ],
  },
  // configuration for etherscan-verify from hardhat-deploy plugin
  verify: {
    etherscan: {
      apiKey: `${etherscanApiKey}`,
    },
  },
  sourcify: {
    enabled: false,
  },
  gasReporter: {
    enabled: false,
  },
};

// Extend the deploy task
task("deploy").setAction(async (args, hre, runSuper) => {
  // Run the original deploy task
  await runSuper(args);
  // Force run the generateTsAbis script
  await generateTsAbis(hre);

  // Log verification instruction
  console.log("\n====================");
  console.log("Deployment completed! To verify contracts manually:");
  console.log("npx hardhat verify --network <NETWORK> <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>");
  console.log("====================\n");
});

export default config;
