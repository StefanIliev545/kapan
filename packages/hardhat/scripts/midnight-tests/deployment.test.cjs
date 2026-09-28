const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const addr = n => `0x${n.toString(16).padStart(40, "0")}`;
const zero = addr(0),
  owner = addr(1),
  router = addr(2),
  helper = addr(3),
  oldView = addr(4);
const write = addr(5),
  view = addr(6),
  newView = addr(7),
  blue = addr(8),
  alchemix = addr(9);
function setup({ wrongOwner, wrongHelper, registered = zero, existing, predicted = write, noCode } = {}) {
  const calls = [];
  const records = { KapanRouter: router, KapanAuthorizationHelper: helper, KapanViewRouter: oldView };
  const deployed = { KapanViewRouter: newView, MorphoMidnightGatewayWrite: write, MorphoMidnightGatewayView: view };
  const exports = {};
  const source = ts.transpileModule(
    fs.readFileSync(path.resolve(__dirname, "../../deploy/v2/23_deploy_morpho_midnight_gateway.ts"), "utf8"),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    },
  ).outputText;
  vm.runInNewContext(source, {
    exports,
    console: { log() {} },
    process: { env: {} },
    require: name => {
      if (name.endsWith("forkChain")) return { getEffectiveChainId: n => n };
      if (name.endsWith("deploySalt")) return { deterministicSalt: (_, name) => name };
      if (name.endsWith("safeExecute"))
        return {
          getWaitConfirmations: () => 1,
          safeDeploy: async (_, __, name, opts) => {
            calls.push(["deploy", name, opts.args]);
            return { address: deployed[name] };
          },
          safeExecute: async (_, __, name, method, args) => {
            calls.push(["execute", name, method, args]);
          },
        };
      throw Error(`Unexpected dependency ${name}`);
    },
  });
  const hre = {
    getChainId: async () => "8453",
    getNamedAccounts: async () => ({ deployer: owner }),
    ethers: { ZeroAddress: zero, provider: { getCode: async a => (a === noCode ? "0x" : "0x1234") } },
    deployments: {
      get: async name => ({ address: records[name] }),
      getOrNull: async () => (existing ? { address: existing } : null),
      deterministic: async () => ({ address: predicted }),
      read: async (name, method, protocol) => {
        if (method === "owner") return name === wrongOwner ? addr(99) : owner;
        if (method === "authorizationHelper") return wrongHelper ? addr(99) : helper;
        if (method === "router") return router;
        if (method === "gateways")
          return name === "KapanRouter"
            ? registered
            : { "morpho-blue": blue, "alchemix-v3": alchemix }[protocol] || zero;
        throw Error(`Unexpected read ${name}.${method}`);
      },
    },
  };
  return { run: () => exports.default(hre), deploy: exports.default, calls };
}
test("targeted deployment preserves live views, reuses the router/helper, and enables writes last", async () => {
  const s = setup();
  await s.run();
  assert.deepEqual(Array.from(s.deploy.dependencies), []);
  assert.deepEqual(
    s.calls.filter(c => c[0] === "deploy").map(c => c[1]),
    ["KapanViewRouter", "MorphoMidnightGatewayWrite", "MorphoMidnightGatewayView"],
  );
  const copy = s.calls.find(c => c[2] === "setGateways");
  assert.deepEqual(JSON.parse(JSON.stringify(copy[3])), [
    ["morpho-blue", "alchemix-v3"],
    [blue, alchemix],
  ]);
  assert.equal(s.calls.at(-1)[2], "addGateway");
  assert.equal(s.calls.find(c => c[1] === "MorphoMidnightGatewayWrite")[2][0], router);
});
for (const name of ["KapanRouter", "KapanAuthorizationHelper", "KapanViewRouter"]) {
  test(`rejects wrong ${name} owner before any transaction`, async () => {
    const s = setup({ wrongOwner: name });
    await assert.rejects(s.run(), /Deployer must own/);
    assert.equal(s.calls.length, 0);
  });
}
test("rejects stale helper wiring before spending gas", async () => {
  const s = setup({ wrongHelper: true });
  await assert.rejects(s.run(), /live wiring/);
  assert.equal(s.calls.length, 0);
});
test("rejects absent deployment code before spending gas", async () => {
  const s = setup({ noCode: helper });
  await assert.rejects(s.run(), /has no code/);
  assert.equal(s.calls.length, 0);
});
test("rejects unknown existing Midnight registration", async () => {
  const s = setup({ registered: addr(99) });
  await assert.rejects(s.run(), /unknown address/);
  assert.equal(s.calls.length, 0);
});
test("rejects changed bytecode for an already registered gateway before spending gas", async () => {
  const s = setup({ registered: write, existing: write, predicted: addr(99) });
  await assert.rejects(s.run(), /bytecode changed/);
  assert.equal(s.calls.length, 0);
});
test("allows a repeat deployment of the same registered gateway", async () => {
  const s = setup({ registered: write, existing: write });
  await s.run();
  assert.equal(s.calls.at(-1)[2], "addGateway");
});
