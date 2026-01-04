import { ethers } from "hardhat";

// Addresses on Base
const KAPAN_ORDER_MANAGER = "0x12F80f5Fff3C0CCC283c7b2A2cC9742ddf8c093A";
const KAPAN_ORDER_HANDLER = "0x7906fe3b144BC86F33B820AfeE2f22faf6Bb013F";

async function main() {
  console.log("Setting OrderHandler on KapanOrderManager...\n");
  
  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);
  
  // Check if signer is owner
  const orderManager = await ethers.getContractAt(
    "KapanOrderManager",
    KAPAN_ORDER_MANAGER
  );
  
  const owner = await orderManager.owner();
  console.log("Owner:", owner);
  
  if (signer.address.toLowerCase() !== owner.toLowerCase()) {
    console.error("ERROR: Signer is not the owner of KapanOrderManager");
    
    // Generate the calldata for the owner to execute
    const iface = orderManager.interface;
    const calldata = iface.encodeFunctionData("setOrderHandler", [KAPAN_ORDER_HANDLER]);
    
    console.log("\n--- Safe Transaction Data ---");
    console.log("To:", KAPAN_ORDER_MANAGER);
    console.log("Data:", calldata);
    console.log("");
    console.log("The owner needs to call setOrderHandler with the OrderHandler address.");
    console.log("");
    console.log("cast send command (for owner):");
    console.log(`cast send ${KAPAN_ORDER_MANAGER} "setOrderHandler(address)" ${KAPAN_ORDER_HANDLER} --rpc-url https://mainnet.base.org --private-key <OWNER_PRIVATE_KEY>`);
    return;
  }
  
  // Check current handler
  const currentHandler = await orderManager.orderHandler();
  console.log("Current OrderHandler:", currentHandler);
  
  if (currentHandler === KAPAN_ORDER_HANDLER) {
    console.log("OrderHandler is already set correctly!");
    return;
  }
  
  // Set the handler
  console.log("Setting OrderHandler to:", KAPAN_ORDER_HANDLER);
  const tx = await orderManager.setOrderHandler(KAPAN_ORDER_HANDLER);
  console.log("Transaction hash:", tx.hash);
  
  await tx.wait();
  console.log("OrderHandler set successfully!");
  
  // Verify
  const newHandler = await orderManager.orderHandler();
  console.log("New OrderHandler:", newHandler);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
