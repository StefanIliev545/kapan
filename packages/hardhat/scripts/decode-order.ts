import { ethers } from "hardhat";

async function main() {
  const ORDER_MANAGER = "0x12F80f5Fff3C0CCC283c7b2A2cC9742ddf8c093A";
  const USER = "0xa9b108038567f76f55219c630bb0e590b748790d";
  const SALT = "0x8f724256abc0d74642bf4af5bc5305cd10010ba3156a3e5f37b11ba7a04b46d1";
  
  const orderManager = await ethers.getContractAt([
    "function userSaltToOrderHash(address user, bytes32 salt) view returns (bytes32)",
    "function getOrder(bytes32 orderHash) view returns (tuple(tuple(address user, bytes[] preInstructionsPerIteration, uint256 preTotalAmount, address sellToken, address buyToken, uint256 chunkSize, uint256 minBuyPerChunk, bytes[] postInstructionsPerIteration, uint8 completion, uint256 targetValue, uint256 minHealthFactor, bytes32 appDataHash, bool isFlashLoanOrder) params, uint8 status, uint256 executedAmount, uint256 iterationCount, uint256 createdAt))",
  ], ORDER_MANAGER);
  
  const orderHash = await orderManager.userSaltToOrderHash(USER, SALT);
  console.log("Order hash:", orderHash);
  
  const order = await orderManager.getOrder(orderHash);
  console.log("\n=== Order Params ===");
  console.log("User:", order.params.user);
  console.log("SellToken:", order.params.sellToken);
  console.log("BuyToken:", order.params.buyToken);
  console.log("ChunkSize:", order.params.chunkSize.toString());
  console.log("isFlashLoanOrder:", order.params.isFlashLoanOrder);
  
  console.log("\n=== Post Instructions ===");
  console.log("Count:", order.params.postInstructionsPerIteration.length);
  
  const coder = ethers.AbiCoder.defaultAbiCoder();
  
  for (let i = 0; i < order.params.postInstructionsPerIteration.length; i++) {
    console.log(`\n--- Iteration ${i} ---`);
    const encoded = order.params.postInstructionsPerIteration[i];
    
    // Decode as ProtocolInstruction[]
    const decoded = coder.decode(["tuple(string protocolName, bytes data)[]"], encoded);
    const instructions = decoded[0];
    
    for (let j = 0; j < instructions.length; j++) {
      const [protocolName, data] = instructions[j];
      console.log(`  [${j}] Protocol: ${protocolName}`);
      
      if (protocolName === "router") {
        try {
          // Try to decode as RouterInstruction with input
          const routerInstrWithInput = coder.decode(
            ["tuple(tuple(uint256 amount, address token, address user, uint8 instructionType), tuple(uint256 index))"],
            data
          );
          const [[amount, token, user, instrType], input] = routerInstrWithInput[0];
          const typeNames = ["FlashLoan", "PullToken", "PushToken", "ToOutput", "Approve", "Split", "Add", "Subtract"];
          console.log(`       Type: ${typeNames[Number(instrType)]} (${instrType})`);
          console.log(`       Token: ${token}`);
          console.log(`       User/Target: ${user}`);
          console.log(`       Amount: ${amount.toString()}`);
          console.log(`       Input index: ${input.index.toString()}`);
        } catch {
          // Try simple RouterInstruction
          try {
            const routerInstr = coder.decode(
              ["tuple(uint256 amount, address token, address user, uint8 instructionType)"],
              data
            );
            const [amount, token, user, instrType] = routerInstr[0];
            const typeNames = ["FlashLoan", "PullToken", "PushToken", "ToOutput", "Approve", "Split", "Add", "Subtract"];
            console.log(`       Type: ${typeNames[Number(instrType)]} (${instrType})`);
            console.log(`       Token: ${token}`);
            console.log(`       User/Target: ${user}`);
            console.log(`       Amount: ${amount.toString()}`);
          } catch (e2) {
            console.log(`       (Failed to decode router instruction)`);
            console.log(`       Raw: ${data.slice(0, 200)}...`);
          }
        }
      } else {
        // Decode LendingInstruction
        try {
          const lendingInstr = coder.decode(
            ["tuple(uint8 op, address token, address user, uint256 amount, bytes context, tuple(uint256 index) input)"],
            data
          );
          const [op, token, user, amount, context, input] = lendingInstr[0];
          const opNames = ["Deposit", "DepositCollateral", "WithdrawCollateral", "Borrow", "Repay", "GetBorrowBalance", "GetSupplyBalance", "Swap", "SwapExactOut"];
          console.log(`       Op: ${opNames[Number(op)]} (${op})`);
          console.log(`       Token: ${token}`);
          console.log(`       User: ${user}`);
          console.log(`       Amount: ${amount.toString()}`);
          console.log(`       Input index: ${input.index.toString()}`);
        } catch {
          console.log(`       (Failed to decode lending instruction)`);
        }
      }
    }
  }
  
  // Also show expected adapter address
  console.log("\n=== Expected Addresses ===");
  console.log("KapanCowAdapter:", "0xF6342053a12AdBc92C03831BF88029608dB4C0B6");
  console.log("(PushToken target should be the adapter for flash loan repayment)");
}

main().catch(console.error);
