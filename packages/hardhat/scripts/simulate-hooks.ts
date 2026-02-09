import { ethers } from "hardhat";

async function main() {
  const user = "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3";
  const manager = "0x72Ee97f652D871F05532E8a08dEDD1d05016f592";
  const adapter = "0xC25C324708e094DF505274D7BC190BE1be14D3D2";
  const salt = "0x479f178892c5a46e3ed67778a782f390dfc5abb5c8959574e206f3f5765b8155";
  const hooksTrampoline = "0x01DcB88678aedD0C4cC9552B20F4718550250574"; // CoW HooksTrampoline
  const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";

  console.log("=== Simulating Hook Execution ===\n");

  // Get the order hash
  const Manager = await ethers.getContractAt(
    ["function userSaltToOrderHash(address user, bytes32 salt) view returns (bytes32)",
     "function hooksTrampoline() view returns (address)"],
    manager
  );
  const orderHash = await Manager.userSaltToOrderHash(user, salt);
  console.log("Order hash:", orderHash);

  const actualTrampoline = await Manager.hooksTrampoline();
  console.log("Manager's hooksTrampoline:", actualTrampoline);
  console.log("Expected hooksTrampoline:", hooksTrampoline);

  // Encode pre-hook #1: fundOrderWithBalance(user, salt, token, recipient)
  const adapterIface = new ethers.Interface([
    "function fundOrderWithBalance(address user, bytes32 salt, address token, address recipient)"
  ]);
  const preHook1Data = adapterIface.encodeFunctionData("fundOrderWithBalance", [
    user, salt, USDC, manager
  ]);
  console.log("\nPre-hook #1 calldata:", preHook1Data.slice(0, 50) + "...");

  // Encode pre-hook #2: executePreHookBySalt(user, salt)
  const managerIface = new ethers.Interface([
    "function executePreHookBySalt(address user, bytes32 salt)"
  ]);
  const preHook2Data = managerIface.encodeFunctionData("executePreHookBySalt", [user, salt]);
  console.log("Pre-hook #2 calldata:", preHook2Data.slice(0, 50) + "...");

  // Try to simulate pre-hook #1 (as if called from hooksTrampoline)
  console.log("\n--- Simulating Pre-hook #1: fundOrderWithBalance ---");
  const Adapter = await ethers.getContractAt(
    ["function fundOrderWithBalance(address user, bytes32 salt, address token, address recipient)"],
    adapter
  );

  try {
    // This will fail because we're not the hooksTrampoline and don't have flash loaned tokens
    // But let's see what error we get
    await Adapter.fundOrderWithBalance.staticCall(user, salt, USDC, manager);
    console.log("Pre-hook #1: Would succeed (unexpected!)");
  } catch (e: unknown) {
    const err = e as Error & { data?: string };
    console.log("Pre-hook #1 reverted:", err.message?.slice(0, 200));
    if (err.data) {
      console.log("Error data:", err.data.slice(0, 100));
    }
  }

  // Try to simulate pre-hook #2
  console.log("\n--- Simulating Pre-hook #2: executePreHookBySalt ---");
  const ManagerContract = await ethers.getContractAt(
    ["function executePreHookBySalt(address user, bytes32 salt)"],
    manager
  );

  try {
    await ManagerContract.executePreHookBySalt.staticCall(user, salt);
    console.log("Pre-hook #2: Would succeed (unexpected!)");
  } catch (e: unknown) {
    const err = e as Error & { data?: string };
    console.log("Pre-hook #2 reverted:", err.message?.slice(0, 200));
    if (err.data) {
      console.log("Error data:", err.data.slice(0, 100));
    }
  }

  // Check if we can impersonate hooksTrampoline and try
  console.log("\n--- Impersonating HooksTrampoline ---");
  try {
    await ethers.provider.send("hardhat_impersonateAccount", [actualTrampoline]);
    const trampolineSigner = await ethers.getSigner(actualTrampoline);

    // Fund the trampoline with some ETH for gas
    const [deployer] = await ethers.getSigners();
    await deployer.sendTransaction({
      to: actualTrampoline,
      value: ethers.parseEther("1")
    });

    // Try pre-hook #2 as hooksTrampoline
    console.log("Calling executePreHookBySalt as hooksTrampoline...");
    try {
      await ManagerContract.connect(trampolineSigner).executePreHookBySalt.staticCall(user, salt);
      console.log("Pre-hook #2 as trampoline: Would succeed!");
    } catch (e: unknown) {
      const err = e as Error & { data?: string, reason?: string };
      console.log("Pre-hook #2 as trampoline reverted!");
      console.log("Reason:", err.reason || err.message?.slice(0, 300));
      if (err.data) {
        console.log("Error data:", err.data.slice(0, 200));
      }
    }

    await ethers.provider.send("hardhat_stopImpersonatingAccount", [actualTrampoline]);
  } catch (e) {
    console.log("Impersonation failed:", (e as Error).message?.slice(0, 100));
  }

  // Check order state
  console.log("\n--- Order State ---");
  const Manager2 = await ethers.getContractAt(
    ["function getOrder(bytes32 orderHash) view returns (tuple(tuple(address user, address trigger, bytes triggerStaticData, bytes preInstructions, address sellToken, address buyToken, bytes postInstructions, bytes32 appDataHash, uint256 maxIterations, address sellTokenRefundAddress, bool isKindBuy) params, uint8 status, uint256 iterationCount, uint256 createdAt))",
     "function preHookExecutedForIteration(bytes32 orderHash) view returns (uint256)"],
    manager
  );

  const orderCtx = await Manager2.getOrder(orderHash);
  console.log("Order status:", orderCtx.status);
  console.log("Iteration count:", orderCtx.iterationCount.toString());
  console.log("Created at:", new Date(Number(orderCtx.createdAt) * 1000).toISOString());

  const preHookIteration = await Manager2.preHookExecutedForIteration(orderHash);
  console.log("Pre-hook executed for iteration:", preHookIteration.toString());
}

main().catch(console.error);
