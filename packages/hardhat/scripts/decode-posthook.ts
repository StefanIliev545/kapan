import { ethers } from "hardhat";

// Router instruction types
const RouterOps = ["FlashLoan", "PullToken", "PushToken", "ToOutput", "Approve", "Split", "Add", "Subtract"];

// LendingOp enum
const LendingOps = [
  "Deposit",
  "DepositCollateral",
  "WithdrawCollateral",
  "Borrow",
  "Repay",
  "GetBorrowBalance",
  "GetSupplyBalance",
  "Swap",
  "SwapExactOut",
];

const abiCoder = ethers.AbiCoder.defaultAbiCoder();

function decodeRouterInstruction(data: string): void {
  try {
    const decoded = abiCoder.decode(
      ["tuple(uint256 amount, address token, address user, uint8 instructionType)"],
      data
    );
    const instr = decoded[0];
    const opName = RouterOps[Number(instr.instructionType)] || `Unknown(${instr.instructionType})`;
    console.log(`    Router op: ${opName}`);

    if (opName === "PushToken") {
      try {
        const fullDecoded = abiCoder.decode(
          ["tuple(tuple(uint256 amount, address token, address user, uint8 instructionType), tuple(uint256 index))"],
          data
        );
        console.log(`    -> Push UTXO[${fullDecoded[0][1].index}] to ${fullDecoded[0][0].user}`);
      } catch {
        console.log(`    -> to user: ${instr.user}`);
      }
    } else if (opName === "Approve") {
      try {
        const fullDecoded = abiCoder.decode(
          ["tuple(uint256,address,address,uint8)", "string", "tuple(uint256 index)"],
          data
        );
        console.log(`    -> Approve UTXO[${fullDecoded[2].index}] for protocol: ${fullDecoded[1]}`);
      } catch {
        console.log(`    -> (could not decode approve details)`);
      }
    }
  } catch (e) {
    console.log(`    (failed to decode router instruction: ${e})`);
  }
}

function decodeLendingInstruction(data: string, protocolName: string): void {
  try {
    const decoded = abiCoder.decode(
      ["tuple(uint8 op, address token, address user, uint256 amount, bytes context, tuple(uint256 index) input)"],
      data
    );
    const instr = decoded[0];
    const opName = LendingOps[Number(instr.op)] || `Unknown(${instr.op})`;
    console.log(`    ${protocolName.toUpperCase()} op: ${opName}`);
    console.log(`    token: ${instr.token}`);
    console.log(`    inputIndex: ${instr.input.index.toString()}`);
  } catch (e) {
    console.log(`    (failed to decode lending instruction: ${e})`);
  }
}

async function main() {
  // New order creation tx
  const txHash = "0xb91c7e9080150a37c25ee94a165ab5951165d7050e94d73bbd2f550d9c68f90e";
  const managerAddress = "0x5c2Eb176a178B6Ae56ffB70c55D5BD68496C3e9a";

  const provider = ethers.provider;
  const receipt = await provider.getTransactionReceipt(txHash);

  if (!receipt) {
    console.log("Transaction not found");
    return;
  }

  console.log("Transaction block:", receipt.blockNumber);

  // Find order from manager logs
  const managerLog = receipt.logs.find(l => l.address.toLowerCase() === managerAddress.toLowerCase());
  if (!managerLog) {
    console.log("No manager log found");
    return;
  }

  const orderHash = managerLog.topics[1];
  console.log("Order hash:", orderHash);

  // Fetch order
  const orderManager = await ethers.getContractAt(
    [
      "function getOrder(bytes32 orderHash) view returns (tuple(tuple(address user, address trigger, bytes triggerStaticData, bytes preInstructions, address sellToken, address buyToken, bytes postInstructions, bytes32 appDataHash, uint256 maxIterations, address sellTokenRefundAddress, bool isKindBuy) params, uint8 status, uint256 iterationCount, uint256 createdAt))",
    ],
    managerAddress
  );

  const order = await orderManager.getOrder(orderHash);

  console.log("\n=== Order Details ===");
  console.log("User:", order.params.user);
  console.log("Sell Token:", order.params.sellToken);
  console.log("Buy Token:", order.params.buyToken);
  console.log("Status:", order.status);
  console.log("sellTokenRefundAddress:", order.params.sellTokenRefundAddress);

  // Decode postInstructions
  const postInstructions = order.params.postInstructions;
  console.log("\n=== Post Instructions ===");
  console.log("Raw length:", (postInstructions.length - 2) / 2, "bytes");

  try {
    const decoded = abiCoder.decode(
      ["tuple(string protocolName, bytes data)[]"],
      postInstructions
    );

    const instructions = decoded[0];
    console.log("Number of instructions:", instructions.length);

    let hasPushTokenToManager = false;

    for (let i = 0; i < instructions.length; i++) {
      const instr = instructions[i];
      console.log(`\n[${i}] Protocol: ${instr.protocolName}`);

      if (instr.protocolName === "router") {
        decodeRouterInstruction(instr.data);

        // Check if this is PushToken to manager
        try {
          const routerDecoded = abiCoder.decode(
            ["tuple(uint256,address,address,uint8)"],
            instr.data
          );
          const routerOp = RouterOps[Number(routerDecoded[0][3])];
          if (routerOp === "PushToken") {
            const fullDecoded = abiCoder.decode(
              ["tuple(tuple(uint256, address, address user, uint8), tuple(uint256))"],
              instr.data
            );
            const targetUser = fullDecoded[0][0].user.toLowerCase();
            if (targetUser === managerAddress.toLowerCase()) {
              hasPushTokenToManager = true;
              console.log("    *** THIS IS THE FIX - PushToken to manager! ***");
            }
          }
        } catch {
          // ignore
        }
      } else {
        decodeLendingInstruction(instr.data, instr.protocolName);
      }
    }

    console.log("\n=== Analysis ===");
    if (hasPushTokenToManager) {
      console.log("✓ Order HAS PushToken to manager - fix is applied!");
    } else {
      console.log("✗ Order is MISSING PushToken to manager - this is the bug!");
    }

  } catch (e) {
    console.error("Failed to decode:", e);
  }
}

main().catch(console.error);
