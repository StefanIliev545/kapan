const fs = require("fs"),
  path = require("path"),
  solc = require("solc-midnight");
const cache = process.env.MIDNIGHT_TEST_CACHE;
const root = path.join(cache, "midnight-fade1a4c3fedfcc44cd61f663b45018405561b4c");
const input = {
  language: "Solidity",
  sources: { "src/Midnight.sol": { content: fs.readFileSync(path.join(root, "src/Midnight.sol"), "utf8") } },
  settings: {
    evmVersion: "osaka",
    viaIR: true,
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};
const out = JSON.parse(
  solc.compile(JSON.stringify(input), { import: p => ({ contents: fs.readFileSync(path.join(root, p), "utf8") }) }),
);
for (const e of out.errors || []) console.log(e.formattedMessage);
if ((out.errors || []).some(e => e.severity === "error")) process.exit(1);
const c = out.contracts["src/Midnight.sol"].Midnight;
fs.writeFileSync(
  path.join(cache, "upstream-midnight.json"),
  JSON.stringify({ abi: c.abi, bytecode: "0x" + c.evm.bytecode.object }),
);
console.log("Compiled pinned upstream Midnight", solc.version(), c.evm.bytecode.object.length / 2, "bytes");
