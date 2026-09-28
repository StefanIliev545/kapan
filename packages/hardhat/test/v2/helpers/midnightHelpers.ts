import { ethers } from "hardhat";
export const coder = ethers.AbiCoder.defaultAbiCoder();
export const Z = ethers.ZeroAddress;
export const MAX = ethers.MaxUint256;
export const U128 = (1n << 128n) - 1n;
export const WAD = 10n ** 18n;
export const cash = (n: number) => BigInt(n) * 10n ** 6n;
export const col = (n: number) => BigInt(n) * WAD;
export const NAME = "morpho-midnight";
export const MARKET =
  "tuple(uint256 chainId,address midnight,address loanToken,tuple(address token,uint256 lltv,uint256 liquidationCursor,address oracle)[] collateralParams,uint256 maturity,uint256 rcfThreshold,address enterGate,address liquidatorGate)";
export const OFFER = `tuple(${MARKET} market,bool buy,address maker,uint256 start,uint256 expiry,uint256 tick,bytes32 group,address callback,bytes callbackData,address receiverIfMakerIsSeller,address ratifier,bool reduceOnly,uint128 maxUnits,uint128 maxAssets,uint256 continuousFeeCap)`;
export const TAKE = `tuple(${OFFER} offer,bytes ratifierData,uint256 maxUnits)`;
export const TRADE = `tuple(uint256 deadline,uint256 maxUnits,uint256 minUnits,uint256 priceLimit,uint256 maxApr,uint256 minHealthFactor,address planProvider,bytes32 planKey,${TAKE}[] takes)`;
export const ctx = (id: string, index = 0, trade?: any) =>
  coder.encode(["bytes32", "uint256", "bytes"], [id, index, trade ? coder.encode([TRADE], [trade]) : "0x"]);
export function marketId(market: any) {
  const initHash = ethers.keccak256(ethers.concat(["0x600b380380600b5f395ff3", coder.encode([MARKET], [market])]));
  return ethers.keccak256(
    ethers.solidityPacked(["bytes1", "address", "uint256", "bytes32"], ["0xff", market.midnight, 0, initHash]),
  );
}
export async function deploy(name: string, ...args: any[]) {
  const c: any = await (await ethers.getContractFactory(name)).deploy(...args);
  await c.waitForDeployment();
  return c;
}
