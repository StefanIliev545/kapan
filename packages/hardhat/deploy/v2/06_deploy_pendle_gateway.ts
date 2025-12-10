import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { deterministicSalt } from "../../utils/deploySalt";
import { getEffectiveChainId, logForkConfig } from "../../utils/forkChain";

const deployPendleGateway: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy, execute } = deployments;
    const { deployer } = await getNamedAccounts();

    const router = await deployments.get("KapanRouter");

    // Pendle Router addresses per chain (same address on all supported chains)
    const PENDLE_ROUTERS: { [key: number]: string } = {
        1: "0x888888888889758F76e7103c6CbF23ABbF58F946", // Mainnet
        10: "0x888888888889758F76e7103c6CbF23ABbF58F946", // Optimism
        42161: "0x888888888889758F76e7103c6CbF23ABbF58F946", // Arbitrum
        8453: "0x888888888889758F76e7103c6CbF23ABbF58F946", // Base
    };

    const chainId = parseInt(await hre.getChainId());
    const effectiveChainId = getEffectiveChainId(chainId);
    logForkConfig(chainId);

    const pendleRouter = PENDLE_ROUTERS[effectiveChainId];

    if (!pendleRouter) {
        console.warn(`No Pendle Router address found for chainId ${chainId}. Skipping PendleGateway deployment.`);
        return;
    }

    console.log("Deploying PendleGateway...");
    const gateway = await deploy("PendleGateway", {
        from: deployer,
        args: [router.address, deployer],
        log: true,
        autoMine: true,
        waitConfirmations: 3,
        deterministicDeployment: deterministicSalt(hre, "PendleGateway"),
    });

    console.log("Deploying PendleAdapter...");
    const adapter = await deploy("PendleAdapter", {
        from: deployer,
        args: [gateway.address, pendleRouter],
        log: true,
        autoMine: true,
        waitConfirmations: 3,
        deterministicDeployment: deterministicSalt(hre, "PendleAdapter"),
    });

    const gatewayContract = await ethers.getContractAt("PendleGateway", gateway.address);
    if ((await gatewayContract.adapter()) !== adapter.address) {
        console.log("Setting adapter in PendleGateway...");
        await execute(
            "PendleGateway",
            { from: deployer, log: true, waitConfirmations: 3 },
            "setAdapter",
            adapter.address
        );
    }

    const routerContract = await ethers.getContractAt("KapanRouter", router.address);
    const existingGateway = await routerContract.gateways("pendle");
    if (existingGateway !== gateway.address) {
        console.log("Registering PendleGateway in KapanRouter...");
        await execute(
            "KapanRouter",
            { from: deployer, log: true, waitConfirmations: 3 },
            "addGateway",
            "pendle",
            gateway.address
        );
    }

    console.log("Pendle integration deployed!");
};

export default deployPendleGateway;
deployPendleGateway.tags = ["PendleGateway"];
deployPendleGateway.dependencies = ["KapanRouter"];
