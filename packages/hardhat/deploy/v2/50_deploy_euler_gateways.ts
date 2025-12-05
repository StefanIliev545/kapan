import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

function mustGetEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy, execute, getOrNull, log } = deployments;
  const { deployer } = await getNamedAccounts();

  const routerNames = ["KapanRouter", "KapanRouterV2", "Router"] as const;
  let routerName: (typeof routerNames)[number] | null = null;
  let routerDep: Awaited<ReturnType<typeof getOrNull>> = null;

  for (const name of routerNames) {
    const dep = await getOrNull(name);
    if (dep) {
      routerDep = dep;
      routerName = name;
      break;
    }
  }

  if (!routerDep || !routerName) {
    throw new Error("Router deployment not found (KapanRouter/KapanRouterV2/Router)");
  }

  const priceOracle = mustGetEnv("EULER_PRICE_ORACLE");
  const evc = mustGetEnv("EULER_EVC");
  const vaults = mustGetEnv("EULER_VAULTS")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  log(`\nNetwork: ${network.name}`);
  log(`Router (${routerName}): ${routerDep.address}`);
  log(`Euler priceOracle: ${priceOracle}`);
  log(`Euler EVC: ${evc}`);
  log(`Euler vault count: ${vaults.length}\n`);

  const view = await deploy("EulerGatewayView", {
    from: deployer,
    args: [priceOracle, deployer],
    log: true,
  });

  const write = await deploy("EulerGatewayWrite", {
    from: deployer,
    args: [routerDep.address, evc, deployer],
    log: true,
  });

  for (const vault of vaults) {
    await execute("EulerGatewayView", { from: deployer, log: true }, "addEulerMarket", vault);
    await execute("EulerGatewayWrite", { from: deployer, log: true }, "addEulerMarket", vault);
  }

  await execute(routerName, { from: deployer, log: true }, "addGateway", "euler", write.address);

  log(`EulerGatewayView deployed:  ${view.address}`);
  log(`EulerGatewayWrite deployed: ${write.address}`);
};

export default func;
func.tags = ["EulerGateways", "v2"];
func.dependencies = ["KapanRouter"];
