// Isolate the Osaka runtime from the application's older Hardhat dependency tree.
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");
const { createHash } = require("crypto");
const mode = process.argv[2] || "unit";
if (!["unit", "upstream", "fork", "all"].includes(mode)) throw new Error("Mode: unit | upstream | fork | all");
if (Number(process.versions.node.split(".")[0]) < 22) throw new Error("Node 22.13+ required for Osaka");
const requestedCache = path.resolve(
  process.env.MIDNIGHT_TEST_CACHE || path.join(os.tmpdir(), "kapan-midnight-contract-tests"),
);
fs.mkdirSync(requestedCache, { recursive: true });
const cache = fs.realpathSync(requestedCache);
const spec = fs.readFileSync(path.join(__dirname, "package.json"));
const lock = path.join(__dirname, "package-lock.json");
const fingerprint = createHash("sha256").update(spec).update(fs.readFileSync(lock)).digest("hex");
const marker = path.join(cache, ".installed-spec");
function exec(command, args, env = process.env, cwd = cache) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
if (
  !fs.existsSync(marker) ||
  fs.readFileSync(marker, "utf8") !== fingerprint ||
  !fs.existsSync(path.join(cache, "node_modules/hardhat"))
) {
  fs.writeFileSync(path.join(cache, "package.json"), spec);
  if (fs.existsSync(lock)) fs.copyFileSync(lock, path.join(cache, "package-lock.json"));
  exec("npm", [fs.existsSync(lock) ? "ci" : "install", "--ignore-scripts", "--no-audit", "--no-fund"]);
  fs.writeFileSync(marker, fingerprint);
}
const env = {
  ...process.env,
  MIDNIGHT_TEST_CACHE: cache,
  NODE_PATH: path.join(cache, "node_modules"),
  TS_NODE_COMPILER_OPTIONS: JSON.stringify({ module: "commonjs", moduleResolution: "node" }),
};
delete env.MIDNIGHT_ARTIFACT;
delete env.MIDNIGHT_FORK_RPC_URL;
exec(process.execPath, [path.join(__dirname, "compile.cjs")], env);
const cli = path.join(cache, "node_modules/hardhat/internal/cli/cli.js");
function test(file, extra = {}) {
  exec(
    process.execPath,
    [
      cli,
      "--config",
      path.join(__dirname, "hardhat.config.cjs"),
      "test",
      "--no-compile",
      ...[].concat(file).map(f => path.resolve(__dirname, "../../test/v2", f)),
    ],
    { ...env, ...extra },
  );
}
async function main() {
  if (mode === "unit" || mode === "all") {
    exec(process.execPath, ["--test", path.join(__dirname, "deployment.test.cjs")], env);
    test([
      "MorphoMidnight.test.ts",
      "KapanRouter.math.test.ts",
      "KapanRouter.approve.test.ts",
      "KapanRouter.authorization.test.ts",
    ]);
  }
  if (mode === "upstream" || mode === "all") {
    const commit = "fade1a4c3fedfcc44cd61f663b45018405561b4c";
    if (!fs.existsSync(path.join(cache, `midnight-${commit}/src/Midnight.sol`))) {
      const response = await fetch(`https://codeload.github.com/morpho-org/midnight/tar.gz/${commit}`);
      if (!response.ok) throw new Error(`Upstream source download failed: ${response.status}`);
      const tar = path.join(cache, "midnight-upstream.tar.gz");
      fs.writeFileSync(tar, Buffer.from(await response.arrayBuffer()));
      exec("tar", ["-xzf", tar, "-C", cache]);
    }
    exec(process.execPath, [path.join(__dirname, "compile-upstream.cjs")], env);
    test("MorphoMidnight.test.ts", { MIDNIGHT_ARTIFACT: path.join(cache, "upstream-midnight.json") });
  }
  if (mode === "fork" || mode === "all") {
    test("MorphoMidnight.fork.test.ts", {
      MIDNIGHT_FORK_RPC_URL: process.env.MIDNIGHT_FORK_RPC_URL || "https://mainnet.base.org",
    });
  }
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
