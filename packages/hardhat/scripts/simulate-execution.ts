import { ethers } from "hardhat";
import { formatUnits } from "ethers";

async function main() {
  const orderHash = "0x3f7aaef3df1ef4fdebdafece5c8d865473363ef2519cca3aa98dcb5c3a6bad71";
  const managerAddress = "0x5c2Eb176a178B6Ae56ffB70c55D5BD68496C3e9a";
  const adapterAddress = "0x86a79fe057FfF0f288aDbfDcc607243fa210bCA9";
  const userAddress = "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3";
  const sellToken = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"; // WETH
  const buyToken = "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f"; // WBTC
  const sellAmount = "104493911441093056"; // ~0.1045 WETH
  const buyAmount = "319778"; // ~0.00319778 WBTC

  console.log("=== Simulating Order Execution ===");
  console.log("OrderHash:", orderHash);
  console.log("Selling:", formatUnits(sellAmount, 18), "WETH");
  console.log("Buying:", formatUnits(buyAmount, 8), "WBTC");

  // Get a whale to fund the swap (we need WBTC to simulate the buy)
  const wbtcWhale = "0x489ee077994B6658eAfA855C308275EAd8097C4A"; // Aave

  // Impersonate the whale and fund with ETH
  await ethers.provider.send("hardhat_impersonateAccount", [wbtcWhale]);
  await ethers.provider.send("hardhat_setBalance", [wbtcWhale, "0x10000000000000000"]);
  const whale = await ethers.getSigner(wbtcWhale);

  // Check user's position first
  console.log("\n=== Pre-execution State ===");

  const weth = await ethers.getContractAt("IERC20", sellToken);
  const wbtc = await ethers.getContractAt("IERC20", buyToken);

  console.log("Manager WETH balance:", formatUnits(await weth.balanceOf(managerAddress), 18));
  console.log("Manager WBTC balance:", formatUnits(await wbtc.balanceOf(managerAddress), 8));
  console.log("Adapter WETH balance:", formatUnits(await weth.balanceOf(adapterAddress), 18));

  // Fund manager with WBTC (simulating the swap result)
  console.log("\n=== Funding Manager with WBTC (simulating swap) ===");
  await wbtc.connect(whale).transfer(managerAddress, buyAmount);
  console.log("Manager WBTC balance after:", formatUnits(await wbtc.balanceOf(managerAddress), 8));

  // Get the actual salt
  const manager = await ethers.getContractAt(
    ["function orderSalts(bytes32) view returns (bytes32)", "function flashLoanAndSettle(address,bytes32) external"],
    managerAddress
  );
  const salt = await manager.orderSalts(orderHash);
  console.log("Salt:", salt);

  // Try to execute the post-hook (flashLoanAndSettle)
  console.log("\n=== Simulating flashLoanAndSettle (post-hook) ===");

  // Impersonate the cow settlement contract
  const cowSettlement = "0x9008D19f58AAbD9eD0D60971565AA8510560ab41";
  await ethers.provider.send("hardhat_impersonateAccount", [cowSettlement]);
  const settlement = await ethers.getSigner(cowSettlement);

  // Give settlement some ETH for gas
  await ethers.provider.send("hardhat_setBalance", [cowSettlement, "0x10000000000000000"]);

  try {
    // This is what the post-hook calls
    const tx = await manager.connect(settlement).flashLoanAndSettle(userAddress, salt);
    const receipt = await tx.wait();
    console.log("SUCCESS! Gas used:", receipt?.gasUsed.toString());
    console.log("\n=== Post-execution State ===");
    console.log("Manager WETH balance:", formatUnits(await weth.balanceOf(managerAddress), 18));
    console.log("Manager WBTC balance:", formatUnits(await wbtc.balanceOf(managerAddress), 8));
    console.log("Adapter WETH balance:", formatUnits(await weth.balanceOf(adapterAddress), 18));
  } catch (e: unknown) {
    const error = e as Error & { data?: string; reason?: string };
    console.log("FAILED!");
    console.log("Reason:", error.reason || error.message?.slice(0, 500));
    if (error.data) console.log("Data:", error.data.slice(0, 200));
  }
}

main().catch(console.error);
