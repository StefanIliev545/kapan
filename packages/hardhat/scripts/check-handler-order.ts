import { ethers } from "hardhat";

async function main() {
  const _user = "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3"; // Order user (for reference)
  const manager = "0x72Ee97f652D871F05532E8a08dEDD1d05016f592";
  const handler = "0xB3FBB014a668B2FD6887F78B3011F18C5bfB7E14";
  const salt = "0x479f178892c5a46e3ed67778a782f390dfc5abb5c8959574e206f3f5765b8155";

  const Handler = await ethers.getContractAt(
    ["function getTradeableOrderWithSignature(address owner, tuple(address handler, bytes32 salt, bytes staticInput) params, bytes offchainInput, bytes32[] proof) view returns (tuple(address sellToken, address buyToken, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, bytes32 kind, bool partiallyFillable, bytes32 sellTokenBalance, bytes32 buyTokenBalance) order, bytes signature)"],
    handler
  );

  console.log("Handler:", handler);
  console.log("Manager (owner):", manager);
  console.log("Salt:", salt);

  // Get the orderHash first
  const Manager = await ethers.getContractAt(
    ["function userSaltToOrderHash(address user, bytes32 salt) view returns (bytes32)"],
    manager
  );
  const orderHash = await Manager.userSaltToOrderHash(_user, salt);
  console.log("Order hash:", orderHash);

  // staticInput should be ABI-encoded orderHash
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const staticInput = abiCoder.encode(["bytes32"], [orderHash]);
  console.log("Static input:", staticInput);

  // ComposableCoW params
  const params = {
    handler: handler,
    salt: salt,
    staticInput: staticInput
  };

  // Try calling getTradeableOrder directly first
  const Handler2 = await ethers.getContractAt(
    ["function getTradeableOrder(address owner, address sender, bytes32 ctx, bytes calldata staticInput, bytes calldata offchainInput) view returns (tuple(address sellToken, address buyToken, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, bytes32 kind, bool partiallyFillable, bytes32 sellTokenBalance, bytes32 buyTokenBalance))"],
    handler
  );

  try {
    console.log("\nCalling getTradeableOrder directly...");
    const order = await Handler2.getTradeableOrder(
      manager,    // owner
      manager,    // sender
      "0x0000000000000000000000000000000000000000000000000000000000000000", // ctx
      staticInput,
      "0x"        // offchainInput
    );

    console.log("\nOrder generated successfully!");
    console.log("  sellToken:", order.sellToken);
    console.log("  buyToken:", order.buyToken);
    console.log("  sellAmount:", order.sellAmount.toString());
    console.log("  buyAmount:", order.buyAmount.toString());
    console.log("  validTo:", order.validTo.toString(), "(" + new Date(Number(order.validTo) * 1000).toISOString() + ")");
    console.log("  kind:", order.kind);
    console.log("  receiver:", order.receiver);
  } catch (e: unknown) {
    const err = e as Error & { data?: string };
    console.log("\nError:", err.message?.slice(0, 200));

    // Try to decode custom errors
    if (err.data) {
      console.log("Error data:", err.data);
      // PollTryNextBlock(string) = 0xa992e978
      // PollNever(string) = 0x9fda4cd6
      // OrderNotValid(string) = 0x1a937978
      if (err.data.startsWith("0xa992e978")) {
        const reason = abiCoder.decode(["string"], "0x" + err.data.slice(10))[0];
        console.log("PollTryNextBlock:", reason);
      } else if (err.data.startsWith("0x9fda4cd6")) {
        const reason = abiCoder.decode(["string"], "0x" + err.data.slice(10))[0];
        console.log("PollNever:", reason);
      }
    }
  }

  try {
    console.log("\nCalling getTradeableOrderWithSignature...");
    const [order, signature] = await Handler.getTradeableOrderWithSignature(
      manager, // owner is the Manager contract
      params,
      "0x", // offchainInput
      []    // proof
    );

    console.log("\nOrder generated successfully!");
    console.log("  sellToken:", order.sellToken);
    console.log("  buyToken:", order.buyToken);
    console.log("  sellAmount:", order.sellAmount.toString());
    console.log("  buyAmount:", order.buyAmount.toString());
    console.log("  validTo:", order.validTo.toString(), "(" + new Date(Number(order.validTo) * 1000).toISOString() + ")");
    console.log("  kind:", order.kind);
    console.log("  receiver:", order.receiver);
    console.log("  signature length:", signature.length);
  } catch {
    console.log("\ngetTradeableOrderWithSignature also failed");
  }
}

main().catch(console.error);
