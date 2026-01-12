import { ethers } from "hardhat";

async function main() {
  const KAPAN_ROUTER = "0xFA3B0Efb7E26CDd22F8b467B153626Ce5d34D64F";
  const WSTETH = "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452";
  const USER = "0xa9b108038567f76f55219c630bb0e590b748790d";
  const MARGIN_AMOUNT = 1680506473014949n; // From the order's PullToken instruction
  
  console.log("\n=== Checking Authorization for PullToken ===");
  console.log("Router:", KAPAN_ROUTER);
  console.log("Token:", WSTETH);
  console.log("User:", USER);
  console.log("Amount:", MARGIN_AMOUNT.toString(), `(${ethers.formatEther(MARGIN_AMOUNT)} wstETH)`);
  
  // Check current allowance
  const wsteth = await ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", WSTETH);
  const currentAllowance = await wsteth.allowance(USER, KAPAN_ROUTER);
  console.log("\nCurrent allowance:", currentAllowance.toString(), `(${ethers.formatEther(currentAllowance)} wstETH)`);
  
  // Check if allowance is sufficient
  if (currentAllowance >= MARGIN_AMOUNT) {
    console.log("✅ Allowance is sufficient!");
  } else {
    console.log("❌ Allowance is INSUFFICIENT - need approval!");
    console.log("   Shortfall:", (MARGIN_AMOUNT - currentAllowance).toString());
  }
  
  // Check user's wstETH balance
  const balance = await wsteth.balanceOf(USER);
  console.log("\nUser wstETH balance:", ethers.formatEther(balance));
  
  // Simulate what authorizeInstructions would return
  const coder = ethers.AbiCoder.defaultAbiCoder();
  
  // Build PullToken instruction
  const pullTokenData = coder.encode(
    ["tuple(uint256 amount, address token, address user, uint8 instructionType)"],
    [[MARGIN_AMOUNT, WSTETH, USER, 1]] // PullToken = 1
  );
  
  const instruction = {
    protocolName: "router",
    data: pullTokenData,
  };
  
  console.log("\n=== Calling authorizeInstructions ===");
  
  const router = await ethers.getContractAt([
    "function authorizeInstructions(tuple(string protocolName, bytes data)[], address) view returns (address[], bytes[])",
  ], KAPAN_ROUTER);
  
  try {
    const [targets, callDatas] = await router.authorizeInstructions([instruction], USER);
    console.log("Returned", targets.length, "auth calls");
    
    for (let i = 0; i < targets.length; i++) {
      console.log(`  [${i}] Target: ${targets[i]}`);
      console.log(`       Data: ${callDatas[i]?.slice(0, 74)}...`);
      
      if (targets[i] !== ethers.ZeroAddress && callDatas[i] && callDatas[i].length > 2) {
        // Decode the approve call
        const iface = new ethers.Interface(["function approve(address spender, uint256 amount)"]);
        try {
          const decoded = iface.decodeFunctionData("approve", callDatas[i]);
          console.log(`       → approve(${decoded[0]}, ${decoded[1].toString()})`);
        } catch {
          console.log("       (not an approve call)");
        }
      }
    }
  } catch (error: any) {
    console.log("Error:", error.message);
  }
}

main().catch(console.error);
