import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { deterministicSalt } from "../../utils/deploySalt";

const deployOneInchGateway: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy, execute } = deployments;
    const { deployer } = await getNamedAccounts();

    const router = await deployments.get("KapanRouter");

    const ONE_INCH_ROUTERS: { [key: number]: string } = {
        1: "0x111111125421ca6dc452d289314280a0f8842a65", // Mainnet
        42161: "0x111111125421ca6dc452d289314280a0f8842a65", // Arbitrum
        10: "0x111111125421ca6dc452d289314280a0f8842a65", // Optimism
        137: "0x111111125421ca6dc452d289314280a0f8842a65", // Polygon
        56: "0x111111125421ca6dc452d289314280a0f8842a65", // BSC
        8453: "0x111111125421ca6dc452d289314280a0f8842a65", // Base
        59144: "0x111111125421ca6dc452d289314280a0f8842a65", // Linea
        31337: "0x111111125421ca6dc452d289314280a0f8842a65", // Hardhat (Arbitrum)
    };

    const chainId = await hre.getChainId();
    const oneInchRouter = ONE_INCH_ROUTERS[parseInt(chainId)];

    if (!oneInchRouter) {
        console.warn(`No 1inch Router address found for chainId ${chainId}. Skipping OneInchAdapter deployment.`);
        return;
    }

    console.log("Deploying OneInchGateway...");
    const gateway = await deploy("OneInchGateway", {
        from: deployer,
        args: [router.address, deployer],
        log: true,
        autoMine: true,
        waitConfirmations: 3,
        deterministicDeployment: deterministicSalt(hre, "OneInchGateway"),
    });

    console.log("Deploying OneInchAdapter...");
    const adapter = await deploy("OneInchAdapter", {
        from: deployer,
        args: [gateway.address, oneInchRouter],
        log: true,
        autoMine: true,
        waitConfirmations: 3,
        deterministicDeployment: deterministicSalt(hre, "OneInchAdapter"),
    });

    // Set adapter in gateway
    const gatewayContract = await ethers.getContractAt("OneInchGateway", gateway.address);
    if ((await gatewayContract.adapter()) !== adapter.address) {
        console.log("Setting adapter in OneInchGateway...");
        await execute("OneInchGateway", { from: deployer, log: true, waitConfirmations: 3 }, "setAdapter", adapter.address);
    }
    const routerContract = await ethers.getContractAt("KapanRouter", router.address);
    const existingGateway = await routerContract.gateways("oneinch");
    if (existingGateway !== gateway.address) {
        console.log("Registering OneInchGateway in KapanRouter...");
        await execute("KapanRouter", { from: deployer, log: true, waitConfirmations: 3 }, "addGateway", "oneinch", gateway.address);
    }

    console.log("OneInch integration deployed!");
};

export default deployOneInchGateway;
deployOneInchGateway.tags = ["OneInchGateway"];
deployOneInchGateway.dependencies = ["KapanRouter"];
