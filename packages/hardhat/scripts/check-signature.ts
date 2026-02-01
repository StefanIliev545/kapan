import { ethers } from "hardhat";

async function main() {
  const manager = "0x72Ee97f652D871F05532E8a08dEDD1d05016f592";
  const handler = "0xB3FBB014a668B2FD6887F78B3011F18C5bfB7E14";
  const composableCow = "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74";
  const user = "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3";
  const salt = "0x479f178892c5a46e3ed67778a782f390dfc5abb5c8959574e206f3f5765b8155";

  console.log("=== Checking ERC-1271 Signature ===\n");

  // Get order hash
  const Manager = await ethers.getContractAt(
    ["function userSaltToOrderHash(address user, bytes32 salt) view returns (bytes32)",
     "function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)"],
    manager
  );
  const orderHash = await Manager.userSaltToOrderHash(user, salt);

  // Get the Handler to generate the order
  const Handler = await ethers.getContractAt(
    ["function getTradeableOrder(address owner, address sender, bytes32 ctx, bytes calldata staticInput, bytes calldata offchainInput) view returns (tuple(address sellToken, address buyToken, address receiver, uint256 sellAmount, uint256 buyAmount, uint32 validTo, bytes32 appData, uint256 feeAmount, bytes32 kind, bool partiallyFillable, bytes32 sellTokenBalance, bytes32 buyTokenBalance))"],
    handler
  );

  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const staticInput = abiCoder.encode(["bytes32"], [orderHash]);

  const order = await Handler.getTradeableOrder(
    manager, manager, ethers.ZeroHash, staticInput, "0x"
  );

  console.log("Order from Handler:");
  console.log("  sellToken:", order.sellToken);
  console.log("  buyToken:", order.buyToken);
  console.log("  sellAmount:", order.sellAmount.toString());
  console.log("  buyAmount:", order.buyAmount.toString());
  console.log("  validTo:", order.validTo, "(" + new Date(Number(order.validTo) * 1000).toISOString() + ")");
  console.log("  kind:", order.kind);
  console.log("  appData:", order.appData);

  // Get ComposableCoW domain separator
  const ComposableCoW = await ethers.getContractAt(
    ["function domainSeparator() view returns (bytes32)",
     "function hash(tuple(address handler, bytes32 salt, bytes staticData) params) view returns (bytes32)"],
    composableCow
  );
  const domainSep = await ComposableCoW.domainSeparator();
  console.log("\nDomain separator:", domainSep);

  // Calculate the EIP-712 order hash
  // GPv2Order.TYPE_HASH
  const ORDER_TYPE_HASH = ethers.keccak256(
    ethers.toUtf8Bytes(
      "Order(address sellToken,address buyToken,address receiver,uint256 sellAmount,uint256 buyAmount,uint32 validTo,bytes32 appData,uint256 feeAmount,string kind,bool partiallyFillable,string sellTokenBalance,string buyTokenBalance)"
    )
  );
  console.log("ORDER_TYPE_HASH:", ORDER_TYPE_HASH);

  // Encode the order for hashing
  const KIND_BUY = ethers.keccak256(ethers.toUtf8Bytes("buy"));
  const KIND_SELL = ethers.keccak256(ethers.toUtf8Bytes("sell"));
  const BALANCE_ERC20 = ethers.keccak256(ethers.toUtf8Bytes("erc20"));

  const orderKind = order.kind === KIND_BUY ? KIND_BUY : KIND_SELL;

  const structHash = ethers.keccak256(
    abiCoder.encode(
      ["bytes32", "address", "address", "address", "uint256", "uint256", "uint32", "bytes32", "uint256", "bytes32", "bool", "bytes32", "bytes32"],
      [
        ORDER_TYPE_HASH,
        order.sellToken,
        order.buyToken,
        order.receiver,
        order.sellAmount,
        order.buyAmount,
        order.validTo,
        order.appData,
        order.feeAmount,
        orderKind,
        order.partiallyFillable,
        BALANCE_ERC20,
        BALANCE_ERC20
      ]
    )
  );
  console.log("Struct hash:", structHash);

  // EIP-712 hash
  const orderDigest = ethers.keccak256(
    ethers.solidityPacked(
      ["string", "bytes32", "bytes32"],
      ["\x19\x01", domainSep, structHash]
    )
  );
  console.log("Order digest:", orderDigest);

  // Create the signature (for ComposableCoW, it's the encoded params)
  const cowHash = await ComposableCoW.hash({
    handler: handler,
    salt: salt,
    staticData: staticInput
  });

  // The signature is (cowHash, params, offchainInput)
  const signature = abiCoder.encode(
    ["bytes32", "tuple(address handler, bytes32 salt, bytes staticData)", "bytes"],
    [cowHash, { handler, salt, staticData: staticInput }, "0x"]
  );

  console.log("\nSignature (first 100 chars):", signature.slice(0, 100) + "...");

  // Check if Manager's isValidSignature works
  console.log("\n--- Checking Manager.isValidSignature ---");
  try {
    const magicValue = await Manager.isValidSignature(orderDigest, signature);
    console.log("isValidSignature returned:", magicValue);
    console.log("Expected magic value: 0x1626ba7e");
    console.log("Match:", magicValue === "0x1626ba7e");
  } catch (e: unknown) {
    const err = e as Error;
    console.log("isValidSignature reverted:", err.message?.slice(0, 200));
  }
}

main().catch(console.error);
