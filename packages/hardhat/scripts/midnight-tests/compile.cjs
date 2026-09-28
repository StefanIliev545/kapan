const fs = require("fs"),
  path = require("path"),
  solc = require("solc");
const root = path.resolve(__dirname, "../..");
const cache = process.env.MIDNIGHT_TEST_CACHE;
if (!cache) throw new Error("Use run.cjs to initialize the isolated test environment");
const roots = [
  "contracts/v2/test/MockGateway.sol",
  "contracts/v2/gateways/oneinch/OneInchGateway.sol",
  "contracts/v2/test/MidnightBlueFixture.sol",
  "contracts/v2/gateways/midnight/MorphoMidnightGatewayWrite.sol",
  "contracts/v2/gateways/midnight/MorphoMidnightGatewayView.sol",
  "contracts/v2/KapanRouter.sol",
  "contracts/v2/KapanAuthorizationHelper.sol",
  "contracts/v2/KapanViewRouter.sol",
  "contracts/v2/gateways/morpho/MorphoBlueGatewayWrite.sol",
  "contracts/v2/test/MidnightFixtures.sol",
  "contracts/v2/test/MockERC20.sol",
  "contracts/v2/cow/KapanConditionalOrderManager.sol",
  "contracts/v2/cow/KapanConditionalOrderHandler.sol",
  "contracts/v2/cow/KapanCowAdapter.sol",
  "contracts/v2/triggers/LimitPriceTrigger.sol",
  "contracts/v2/triggers/LtvTrigger.sol",
  "contracts/v2/test/MockComposableCoW.sol",
  "contracts/v2/test/MockGPv2Settlement.sol",
];
const sources = Object.fromEntries(roots.map(p => [p, { content: fs.readFileSync(path.join(root, p), "utf8") }]));
const input = {
  language: "Solidity",
  sources,
  settings: {
    evmVersion: "cancun",
    viaIR: true,
    optimizer: { enabled: true, runs: 10 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode", "evm.deployedBytecode"] } },
  },
};
const out = JSON.parse(
  solc.compile(JSON.stringify(input), {
    import: p => {
      for (const base of [root, path.join(cache, "node_modules")]) {
        const file = path.join(base, p);
        if (fs.existsSync(file)) return { contents: fs.readFileSync(file, "utf8") };
      }
      return { error: "Missing " + p };
    },
  }),
);
for (const e of out.errors || []) console.log(e.formattedMessage);
if ((out.errors || []).some(e => e.severity === "error")) process.exit(1);
for (const [sourceName, contracts] of Object.entries(out.contracts))
  for (const [contractName, c] of Object.entries(contracts)) {
    const dir = path.join(cache, "artifacts", sourceName);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, contractName + ".json"),
      JSON.stringify({
        _format: "hh-sol-artifact-1",
        contractName,
        sourceName,
        abi: c.abi,
        bytecode: "0x" + c.evm.bytecode.object,
        deployedBytecode: "0x" + c.evm.deployedBytecode.object,
        linkReferences: c.evm.bytecode.linkReferences,
        deployedLinkReferences: c.evm.deployedBytecode.linkReferences,
      }),
    );
    if (contractName.includes("MidnightGateway"))
      console.log(contractName, c.evm.deployedBytecode.object.length / 2, "bytes");
  }
