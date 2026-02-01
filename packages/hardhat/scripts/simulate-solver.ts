import { ethers, network } from "hardhat";
import { formatUnits, parseUnits } from "ethers";

/**
 * Simulate what a CoW solver sees when trying to fill the order.
 * This helps debug why orders aren't being picked up.
 */
async function main() {
  // Order details from user (new WETH order)
  const orderHash = "0x3d8d5e8abce3911f2eef5f0b4f087fbd8abf847af4981d32323f05832b7087f6";
  const userAddress = "0xdedb4d230d8b1e9268fd46779a8028d5daaa8fa3";
  const salt = "0xc813509f0be1b427923141c63c749055a6390e2f8e1d56172c577e728a7f5acf";

  const managerAddress = "0x5c2Eb176a178B6Ae56ffB70c55D5BD68496C3e9a";
  const morphoGatewayAddress = "0x46b1F675277b044a8CC36E9096bc6d7b22e8c7eE";
  const morphoAddress = "0x6c247b1F6182318877311737BaC0844bAa518F5e"; // Arbitrum Morpho

  const sellToken = "0x41CA7586cC1311807B4605fBB748a3B8862b42b5"; // syrupUSDC
  const buyToken = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"; // WETH

  const sellAmount = parseUnits("280.0759", 6);
  const buyAmount = parseUnits("0.1335", 18); // ~0.1335 WETH

  console.log("=== Order Details ===");
  console.log("Order Hash:", orderHash);
  console.log("User:", userAddress);
  console.log("Sell:", formatUnits(sellAmount, 6), "syrupUSDC");
  console.log("Buy:", formatUnits(buyAmount, 8), "WBTC");

  // Get contract instances
  const manager = await ethers.getContractAt("KapanConditionalOrderManager", managerAddress);
  const morpho = await ethers.getContractAt(
    ["function isAuthorized(address, address) view returns (bool)"],
    morphoAddress
  );

  // 1. Check order exists
  console.log("\n=== 1. Check Order State ===");
  try {
    const order = await manager.getOrder(orderHash);
    console.log("Order Status:", order.status.toString(), "(1=Active)");
    console.log("Iteration Count:", order.iterationCount.toString());
    console.log("Has Post Instructions:", order.params.postInstructions.length > 2);
  } catch (e: any) {
    console.log("ERROR getting order:", e.message);
  }

  // 2. Check Morpho authorization
  console.log("\n=== 2. Check Morpho Authorization ===");
  try {
    const isGatewayAuthorized = await morpho.isAuthorized(userAddress, morphoGatewayAddress);
    console.log("Gateway authorized on Morpho:", isGatewayAuthorized);
    if (!isGatewayAuthorized) {
      console.log("⚠️  USER NEEDS TO AUTHORIZE GATEWAY ON MORPHO!");
    }
  } catch (e: any) {
    console.log("ERROR checking auth:", e.message);
  }

  // 3. Check syrupUSDC balance
  console.log("\n=== 3. Check Token Balances ===");
  const erc20 = await ethers.getContractAt("IERC20", sellToken);
  const userBalance = await erc20.balanceOf(userAddress);
  console.log("User syrupUSDC balance:", formatUnits(userBalance, 6));

  // 4. Impersonate HooksTrampoline and simulate pre-hook
  console.log("\n=== 4. Simulate Pre-Hook ===");
  const hooksTrampolineAddress = await manager.hooksTrampoline();
  console.log("HooksTrampoline:", hooksTrampolineAddress);

  // Impersonate the hooks trampoline
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [hooksTrampolineAddress],
  });
  await network.provider.send("hardhat_setBalance", [
    hooksTrampolineAddress,
    "0x56BC75E2D63100000", // 100 ETH
  ]);

  const trampolineSigner = await ethers.getSigner(hooksTrampolineAddress);
  const managerAsTrompoline = manager.connect(trampolineSigner);

  try {
    // The pre-hook would normally be called by settlement with tokens already transferred
    // Let's just check what happens when we call it
    console.log("Attempting executePreHookBySalt...");
    await managerAsTrompoline.executePreHookBySalt.staticCall(userAddress, salt);
    console.log("Pre-hook would succeed!");
  } catch (e: any) {
    console.log("Pre-hook simulation failed:", e.message?.slice(0, 200));
  }

  // 5. Simulate full post-hook (requires tokens to be in place)
  console.log("\n=== 5. Simulate Post-Hook ===");

  // For post-hook to work:
  // - Manager needs sellToken (syrupUSDC) - provided by flash loan
  // - Manager needs buyToken (WETH) - provided by swap

  // Let's fund the manager and simulate
  const weth = await ethers.getContractAt("IERC20", buyToken);

  // Find a WETH whale to fund our simulation
  const wethWhale = "0x489ee077994B6658eAfA855C308275EAd8097C4A"; // Arbitrum whale
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [wethWhale],
  });
  await network.provider.send("hardhat_setBalance", [
    wethWhale,
    "0x56BC75E2D63100000",
  ]);
  const whaleSigner = await ethers.getSigner(wethWhale);

  const whaleWethBalance = await weth.balanceOf(wethWhale);
  console.log("Whale WETH balance:", formatUnits(whaleWethBalance, 18));

  // Transfer WETH to manager (simulating swap output)
  if (whaleWethBalance >= buyAmount) {
    try {
      await weth.connect(whaleSigner).transfer(managerAddress, buyAmount);
      console.log("Transferred", formatUnits(buyAmount, 18), "WETH to manager");
    } catch (e: any) {
      console.log("Transfer failed:", e.message);
    }
  }

  // Also fund manager with sellToken (simulating flash loan)
  const syrupWhale = "0xF977814e90dA44bFA03b6295A0616a897441aceC"; // Binance
  try {
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [syrupWhale],
    });
    const syrupSigner = await ethers.getSigner(syrupWhale);
    const syrupBalance = await erc20.balanceOf(syrupWhale);
    console.log("Checking syrupUSDC whale balance:", formatUnits(syrupBalance, 6));

    if (syrupBalance >= sellAmount) {
      await erc20.connect(syrupSigner).transfer(managerAddress, sellAmount);
      console.log("Transferred", formatUnits(sellAmount, 6), "syrupUSDC to manager");
    }
  } catch (e: any) {
    console.log("SyrupUSDC funding failed:", e.message?.slice(0, 100));
  }

  // Now try post-hook
  try {
    console.log("\nAttempting executePostHookBySalt...");
    await managerAsTrompoline.executePostHookBySalt.staticCall(userAddress, salt);
    console.log("✅ Post-hook would succeed!");
  } catch (e: any) {
    console.log("❌ Post-hook simulation failed:");
    console.log(e.message?.slice(0, 500));

    // Try to get more detailed error
    if (e.data) {
      console.log("Error data:", e.data);
    }
  }

  // Clean up
  await network.provider.request({
    method: "hardhat_stopImpersonatingAccount",
    params: [hooksTrampolineAddress],
  });
}

main().catch(console.error);
