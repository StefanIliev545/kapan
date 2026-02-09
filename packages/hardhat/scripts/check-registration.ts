import { ethers } from "hardhat";

async function main() {
  const orderHash = "0x3f7aaef3df1ef4fdebdafece5c8d865473363ef2519cca3aa98dcb5c3a6bad71";
  const managerAddress = "0x5c2Eb176a178B6Ae56ffB70c55D5BD68496C3e9a";
  const handlerAddress = "0xB048352915d26126904c162345d40a3A891E414a";
  const composableCoWAddress = "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74";

  // Get the actual salt from the manager
  const manager = await ethers.getContractAt(
    ["function orderSalts(bytes32) view returns (bytes32)"],
    managerAddress
  );
  const actualSalt = await manager.orderSalts(orderHash);
  console.log("Actual salt from manager:", actualSalt);

  // Check if order is registered in ComposableCoW
  const composableCoW = await ethers.getContractAt(
    [
      "function singleOrders(address,bytes32) view returns (bool)",
      "function cabinet(address,bytes32) view returns (bytes32)"
    ],
    composableCoWAddress
  );

  // The order params hash using the ACTUAL salt (not orderHash)
  const staticData = ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [orderHash]);
  const paramsHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "bytes32", "bytes"],
    [handlerAddress, actualSalt, staticData]
  ));

  console.log("Checking ComposableCoW registration...");
  console.log("Manager:", managerAddress);
  console.log("Handler:", handlerAddress);
  console.log("OrderHash:", orderHash);
  console.log("StaticData:", staticData);
  console.log("ParamsHash:", paramsHash);

  const isRegistered = await composableCoW.singleOrders(managerAddress, paramsHash);
  console.log("\nIs registered in singleOrders:", isRegistered);

  const cabinetValue = await composableCoW.cabinet(managerAddress, paramsHash);
  console.log("Cabinet value:", cabinetValue);

  if (!isRegistered) {
    console.log("\n*** ORDER IS NOT REGISTERED WITH COMPOSABLECOW ***");
    console.log("This is why solvers can't fill it!");
  }
}

main().catch(console.error);
