const path = require("path");
require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("ts-node/register/transpile-only");
const cache = process.env.MIDNIGHT_TEST_CACHE;
if (!cache) throw new Error("Run scripts/midnight-tests/run.cjs");
module.exports = {
  solidity: "0.8.30",
  networks: {
    hardhat: {
      hardfork: "osaka",
      allowUnlimitedContractSize: false,
      ...(process.env.MIDNIGHT_FORK_RPC_URL
        ? {
            chainId: 8453,
            forking: { url: process.env.MIDNIGHT_FORK_RPC_URL, blockNumber: 51860129 },
          }
        : {}),
    },
  },
  paths: {
    root: cache,
    sources: path.join(cache, "sources"),
    tests: path.resolve(__dirname, "../../test/v2"),
    cache: path.join(cache, "cache"),
    artifacts: path.join(cache, "artifacts"),
  },
  mocha: { timeout: 240000 },
};
