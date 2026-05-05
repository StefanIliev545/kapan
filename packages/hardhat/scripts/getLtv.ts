import { ethers, network } from "hardhat";
const VR = "0x79D4b55a88560d2EaA4CAF15C55139416bc2cb36";
const ALCHEMIX_ID = "0x036d0e16";
const USER = "0x6Ba9d7209f54D0Dbc039D2e6EC4826E4b52647b1";
async function main() {
  for (let i = 0; i < 3; i++) await network.provider.send("evm_mine", []);
  const router = await ethers.getContractAt(
    ["function getCurrentLtv(bytes4,address,bytes) view returns (uint256)",
     "function getPositionValue(bytes4,address,bytes) view returns (uint256,uint256)"],
    VR,
  );
  // ctx = (marketId=1, tokenId=1435)
  const ctx = ethers.AbiCoder.defaultAbiCoder().encode(["uint256","uint256"], [1n, 1435n]);
  const ltv = await router.getCurrentLtv(ALCHEMIX_ID, USER, ctx);
  const [coll, debt] = await router.getPositionValue(ALCHEMIX_ID, USER, ctx);
  console.log(`Current LTV: ${ltv} bps = ${Number(ltv) / 100}%`);
  console.log(`Collateral USD (8d): ${coll}`);
  console.log(`Debt USD       (8d): ${debt}`);
}
main().catch(e => { console.error(e); process.exit(1); });
