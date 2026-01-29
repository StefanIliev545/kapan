const { ethers } = require("hardhat");

async function main() {
  const signature = "0x5fd7e97d69d78e7a7cafcaf924483f99f65e8f4e303a99a446db7ab319f9d40e940bced2d5a25ba2e97094ad7d83dc28a6572da797d6b3e7fc6663bd93efb789fc17e48900000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000220000000000000000000000000000000000000000000000000000000000000018000000000000000000000000041ca7586cc1311807b4605fbb748a3b8862b42b5000000000000000000000000fd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb900000000000000000000000034cf47e892e8cf68ecace7268407952904289b43000000000000000000000000000000000000000000000000000000001972e785000000000000000000000000000000000000000000000000000000001cf56441000000000000000000000000000000000000000000000000000000006978d8532810aac55d91d0b6b0680568ee55ed0e1530e5295c830a26580cf1c74893e1a70000000000000000000000000000000000000000000000000000000000000000f3b277728b3fee749481eb3e0b3b48980dbbab78658fc419025cb16eee34677500000000000000000000000000000000000000000000000000000000000000005a28e9363bb942b639270062aa6bb295f434bcdfc42c97267bf003f272060dc95a28e9363bb942b639270062aa6bb295f434bcdfc42c97267bf003f272060dc900000000000000000000000000000000000000000000000000000000000001600000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000120000000000000000000000000000000000000000000000000000000000000000000000000000000000000000034cf47e892e8cf68ecace7268407952904289b437fb9500edd470124185c5f7fe19589a01001d0fe14e060edb168e9d1c927705c000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000201ab3c9222b76ecd22e07ae76b4786a5a9826a6200fe96e091447c380b856d8670000000000000000000000000000000000000000000000000000000000000000";

  // ComposableCoW signature has a special prefix for non-Safe owners
  // Let me check the first 65 bytes - might be similar to ECDSA format or have special meaning
  console.log("First 65 bytes (possible prefix):");
  console.log(signature.slice(0, 132));
  
  // Skip potential prefix and try to find the order
  // Looking at the hex, I see addresses like:
  // 41ca7586cc1311807b4605fbb748a3b8862b42b5 - sellToken (weETH)
  // fd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9 - buyToken (USDT)
  // 34cf47e892e8cf68ecace7268407952904289b43 - receiver/manager
  
  // Find where the order starts by looking for sellToken address
  const sellTokenPos = signature.toLowerCase().indexOf("41ca7586cc1311807b4605fbb748a3b8862b42b5");
  console.log("\nSellToken found at position:", sellTokenPos);
  
  // The order starts 24 chars before (for the address padding)
  const orderStartByte = (sellTokenPos - 2 - 24) / 2;
  console.log("Order starts at byte:", orderStartByte);
  
  // Let's decode starting from different offsets
  const decoder = ethers.AbiCoder.defaultAbiCoder();
  
  // Try offset 0x80 = 128 bytes = 256 chars + 2 for 0x
  const offset80 = 2 + 256;
  console.log("\nTrying decode from offset 0x80 (byte 128):");
  console.log("Data from offset:", signature.slice(offset80, offset80 + 200) + "...");
  
  // The structure seems to have:
  // - Some prefix (first 64-65 bytes?)
  // - Offset pointers
  // - Then the actual data
  
  // Let's manually parse based on what we see in the hex
  // At position ~280 we see the addresses
  const manualParse = {
    sellToken: "0x" + signature.slice(282, 322),
    buyToken: "0x" + signature.slice(346, 386),
    receiver: "0x" + signature.slice(410, 450),
    sellAmount: BigInt("0x" + signature.slice(450, 514)).toString(),
    buyAmount: BigInt("0x" + signature.slice(514, 578)).toString(),
    validTo: BigInt("0x" + signature.slice(578, 642)).toString(),
    appData: "0x" + signature.slice(642, 706),
  };
  
  console.log("\n=== Manual Parse (order from signature) ===");
  console.log("sellToken:", manualParse.sellToken);
  console.log("buyToken:", manualParse.buyToken);
  console.log("receiver:", manualParse.receiver);
  console.log("sellAmount:", manualParse.sellAmount);
  console.log("buyAmount:", manualParse.buyAmount);
  console.log("validTo:", manualParse.validTo);
  console.log("appData:", manualParse.appData);

  // Now compare with what we POST to API
  console.log("\n=== What we POST to API ===");
  console.log("sellAmount: 426960773");
  console.log("buyAmount: 485844033");
  console.log("validTo: 1769527379");
}

main().catch(console.error);
