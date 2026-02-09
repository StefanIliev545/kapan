import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";
import { deterministicSalt } from "../../utils/deploySalt";
import { getEffectiveChainId, logForkConfig } from "../../utils/forkChain";
import { safeExecute, safeDeploy, waitForPendingTxs } from "../../utils/safeExecute";

const deployKyberGateway: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deployer } = await getNamedAccounts();

    const router = await deployments.get("KapanRouter");

    // Kyberswap MetaAggregationRouterV2 addresses
    // See: https://docs.kyberswap.com/kyberswap-solutions/kyberswap-aggregator/contracts/aggregator-contract-addresses
    const KYBER_ROUTERS: { [key: number]: string } = {
        1: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5", // Mainnet
        42161: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5", // Arbitrum
        10: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5", // Optimism
        137: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5", // Polygon
        56: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5", // BSC
        8453: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5", // Base
        59144: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5", // Linea
        43114: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5", // Avalanche
        250: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5", // Fantom
        324: "0x3F95eF3f2eAca871858dbE20A93c01daF6C2e923", // zkSync (different address)
        534352: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5", // Scroll
    };

    const chainId = parseInt(await hre.getChainId());
    const effectiveChainId = getEffectiveChainId(chainId);
    logForkConfig(chainId);

    const kyberRouter = KYBER_ROUTERS[effectiveChainId];

    if (!kyberRouter) {
        console.warn(`No Kyber Router address found for chainId ${chainId}. Skipping KyberGateway deployment.`);
        return;
    }

    console.log("Deploying KyberGateway...");
    const gateway = await safeDeploy(hre, deployer, "KyberGateway", {
        from: deployer,
        args: [router.address, deployer],
        log: true,
        autoMine: true,
        waitConfirmations: 1,
        deterministicDeployment: deterministicSalt(hre, "KyberGateway"),
    });

    console.log("Deploying KyberAdapter...");
    const adapter = await safeDeploy(hre, deployer, "KyberAdapter", {
        from: deployer,
        args: [gateway.address, kyberRouter],
        log: true,
        autoMine: true,
        waitConfirmations: 1,
        deterministicDeployment: deterministicSalt(hre, "KyberAdapter"),
    });

    // Set adapter in gateway
    const gatewayContract = await ethers.getContractAt("KyberGateway", gateway.address);
    if ((await gatewayContract.adapter()) !== adapter.address) {
        console.log("Setting adapter in KyberGateway...");
        await safeExecute(hre, deployer, "KyberGateway", "setAdapter", [adapter.address], { waitConfirmations: 1, log: true });
    }

    const routerContract = await ethers.getContractAt("KapanRouter", router.address);
    const existingGateway = await routerContract.gateways("kyber");
    if (existingGateway !== gateway.address) {
        console.log("Registering KyberGateway in KapanRouter...");
        await safeExecute(hre, deployer, "KapanRouter", "addGateway", ["kyber", gateway.address], { waitConfirmations: 1, log: true });
    }

    console.log("Kyber integration deployed!");
    // Gateway sync is handled by 99_sync_authorization_helper.ts to avoid nonce race conditions

    await waitForPendingTxs(hre, deployer);
};

export default deployKyberGateway;
deployKyberGateway.tags = ["KyberGateway"];
deployKyberGateway.dependencies = ["KapanRouter"];
