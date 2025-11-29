
const hre = require("hardhat");

async function main() {
    const deployments = await hre.deployments.all();
    const venusGatewayView = await hre.ethers.getContractAt("VenusGatewayView", deployments.VenusGatewayView.address);

    console.log("VenusGatewayView address:", venusGatewayView.address);

    // Get all markets to see what's listed
    const markets = await venusGatewayView.getAllVenusMarkets();
    console.log("All Venus Markets:", markets.tokens);
    console.log("Symbols:", markets.symbols);

    // Check getSupportedCollaterals for a known market (or random one)
    // We need a market address. Let's pick the first one from the list if available.
    if (markets.tokens.length > 0) {
        const market = markets.tokens[0];
        console.log(`Checking supported collaterals for market: ${market} (${markets.symbols[0]})`);
        const supported = await venusGatewayView.getSupportedCollaterals(market);
        console.log("Supported Collaterals:", supported);
    } else {
        console.log("No markets found in VenusGatewayView");
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
