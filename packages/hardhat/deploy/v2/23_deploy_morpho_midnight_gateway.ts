import { DeployFunction } from "hardhat-deploy/types";
import { getEffectiveChainId } from "../../utils/forkChain";
import { deterministicSalt } from "../../utils/deploySalt";
import { safeDeploy, safeExecute, getWaitConfirmations } from "../../utils/safeExecute";

// Explicit deployment only. Reuse the live router/helper without running their setup scripts.
// https://docs.morpho.org/developers/contracts/addresses/ (verified 2026-09-27)
const MIDNIGHT: Record<number, string> = {
  1: "0x471686c42792F93528B000beF54bC10E3aa2045f",
  8453: "0xAdedD8ab6dE832766Fedf0FaC4992E5C4D3EA18A",
};
const PROTOCOLS = ["aave-v3", "compound-v3", "morpho-blue", "euler-v2", "venus", "alchemix-v3"];

const deploy: DeployFunction = async hre => {
  const chainId = Number(await hre.getChainId());
  const midnight = process.env.MORPHO_MIDNIGHT_ADDRESS || MIDNIGHT[getEffectiveChainId(chainId)];
  if (!midnight) throw new Error("No Midnight deployment configured for this chain");
  const { deployer } = await hre.getNamedAccounts();
  const { get, read } = hre.deployments;
  const router = await get("KapanRouter");
  const helper = await get("KapanAuthorizationHelper");
  const previousView = await get("KapanViewRouter");
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const zero = hre.ethers.ZeroAddress;

  // Complete preflight before spending gas or changing deployment records.
  for (const [name, address] of Object.entries({
    Midnight: midnight,
    KapanRouter: router.address,
    KapanAuthorizationHelper: helper.address,
    KapanViewRouter: previousView.address,
  })) {
    if ((await hre.ethers.provider.getCode(address)) === "0x") throw new Error(`${name} has no code`);
  }
  for (const name of ["KapanRouter", "KapanAuthorizationHelper", "KapanViewRouter"]) {
    if (!same(await read(name, "owner"), deployer)) throw new Error(`Deployer must own ${name}`);
  }
  if (
    !same(await read("KapanRouter", "authorizationHelper"), helper.address) ||
    !same(await read("KapanAuthorizationHelper", "router"), router.address)
  ) {
    throw new Error("Router and authorization helper deployment records do not match live wiring");
  }
  const registeredWrite = await read("KapanRouter", "gateways", "morpho-midnight");
  const existingWrite = await hre.deployments.getOrNull("MorphoMidnightGatewayWrite");
  if (!same(registeredWrite, zero) && (!existingWrite || !same(registeredWrite, existingWrite.address))) {
    throw new Error("Midnight already registered at an unknown address; reconcile before deploying");
  }
  const plannedWrite = await hre.deployments.deterministic("MorphoMidnightGatewayWrite", {
    from: deployer,
    args: [router.address, midnight],
    salt: deterministicSalt(hre, "MorphoMidnightGatewayWrite"),
  });
  if (!same(registeredWrite, zero) && !same(registeredWrite, plannedWrite.address)) {
    throw new Error("Midnight gateway bytecode changed; the existing registration cannot be overwritten");
  }
  const names: string[] = [];
  const addresses: string[] = [];
  for (const protocol of PROTOCOLS) {
    const address = await read("KapanViewRouter", "gateways", protocol);
    if (!same(address, zero)) {
      names.push(protocol);
      addresses.push(address);
    }
  }

  const options = { from: deployer, log: true, autoMine: true, waitConfirmations: getWaitConfirmations(chainId) };
  // A separate read router is necessary because the old bytecode does not dispatch Midnight.
  // Existing order triggers retain their old immutable view-router address and registrations.
  const viewRouter = await safeDeploy(hre, deployer, "KapanViewRouter", {
    ...options,
    args: [deployer],
    deterministicDeployment: deterministicSalt(hre, "KapanViewRouter"),
  });
  if (names.length) await safeExecute(hre, deployer, "KapanViewRouter", "setGateways", [names, addresses]);
  const write = await safeDeploy(hre, deployer, "MorphoMidnightGatewayWrite", {
    ...options,
    args: [router.address, midnight],
    deterministicDeployment: deterministicSalt(hre, "MorphoMidnightGatewayWrite"),
  });
  const view = await safeDeploy(hre, deployer, "MorphoMidnightGatewayView", {
    ...options,
    args: [midnight],
    deterministicDeployment: deterministicSalt(hre, "MorphoMidnightGatewayView"),
  });
  // Register authorization and read paths before making the write gateway discoverable by the UI.
  await safeExecute(hre, deployer, "KapanAuthorizationHelper", "syncGateway", ["morpho-midnight", write.address]);
  await safeExecute(hre, deployer, "KapanViewRouter", "setGateway", ["morpho-midnight", view.address]);
  await safeExecute(hre, deployer, "KapanRouter", "addGateway", ["morpho-midnight", write.address]);
  console.log(
    `Midnight ready: router ${router.address}, write ${write.address}, view ${view.address}, view router ${viewRouter.address}`,
  );
};
deploy.tags = ["MorphoMidnightGateway"];
deploy.dependencies = [];
export default deploy;
