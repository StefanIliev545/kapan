import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { deterministicSalt } from "../../utils/deploySalt";
import { getEffectiveChainId, logForkConfig } from "../../utils/forkChain";

const deployKyberSwapGateway: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy, execute } = deployments;
    const { deployer } = await getNamedAccounts();

    const router = await deployments.get("KapanRouter");

    const KYBER_ROUTERS: { [key: number]: string } = {
        1: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5", // Mainnet
        10: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5", // Optimism
        56: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5", // BSC
        137: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5", // Polygon
        42161: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5", // Arbitrum
        59144: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5", // Linea
        8453: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5", // Base
        9745: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5", // Plasma
    };

    const chainId = parseInt(await hre.getChainId());
    const effectiveChainId = getEffectiveChainId(chainId);
    logForkConfig(chainId);

    const kyberRouter = KYBER_ROUTERS[effectiveChainId];

    if (!kyberRouter) {
        console.warn(`No Kyber router address found for chainId ${chainId}. Skipping KyberSwap deployment.`);
        return;
    }

    console.log("Deploying KyberSwapGateway...");
    const gateway = await deploy("KyberSwapGateway", {
        from: deployer,
        args: [router.address, deployer],
        log: true,
        autoMine: true,
        waitConfirmations: 3,
        deterministicDeployment: deterministicSalt(hre, "KyberSwapGateway"),
    });

    console.log("Deploying KyberSwapAdapter...");
    const adapter = await deploy("KyberSwapAdapter", {
        from: deployer,
        args: [gateway.address, kyberRouter],
        log: true,
        autoMine: true,
        waitConfirmations: 3,
        deterministicDeployment: deterministicSalt(hre, "KyberSwapAdapter"),
    });

    const gatewayContract = await ethers.getContractAt("KyberSwapGateway", gateway.address);
    if ((await gatewayContract.adapter()) !== adapter.address) {
        console.log("Setting adapter in KyberSwapGateway...");
        await execute("KyberSwapGateway", { from: deployer, log: true, waitConfirmations: 3 }, "setAdapter", adapter.address);
    }

    const routerContract = await ethers.getContractAt("KapanRouter", router.address);
    const existingGateway = await routerContract.gateways("kyberswap");
    if (existingGateway !== gateway.address) {
        console.log("Registering KyberSwapGateway in KapanRouter...");
        await execute("KapanRouter", { from: deployer, log: true, waitConfirmations: 3 }, "addGateway", "kyberswap", gateway.address);
    }

    console.log("KyberSwap integration deployed!");
};

export default deployKyberSwapGateway;
deployKyberSwapGateway.tags = ["KyberSwapGateway"];
deployKyberSwapGateway.dependencies = ["KapanRouter"];
