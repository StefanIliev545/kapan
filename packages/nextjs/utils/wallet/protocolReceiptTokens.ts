import { type Address, type PublicClient, isAddress, parseAbi, zeroAddress } from "viem";

const AAVE_ADDRESSES_ABI = parseAbi(["function getPoolDataProvider() view returns (address)"]);
const AAVE_DATA_ABI = parseAbi(["function getAllATokens() view returns ((string symbol, address tokenAddress)[])"]);
const COMPOUND_REGISTRY_ABI = parseAbi(["function allActiveComets() view returns (address[])"]);

function receiptAddressSet(addresses: readonly string[]): Set<string> {
  return new Set(
    addresses
      .map(address => {
        return address.toLowerCase();
      })
      .filter(address => {
        return isAddress(address) && address !== zeroAddress;
      }),
  );
}

export async function readAaveReceiptTokens(
  client: Pick<PublicClient, "readContract">,
  addressesProvider: Address,
): Promise<Set<string>> {
  const dataProvider = await client.readContract({
    address: addressesProvider,
    abi: AAVE_ADDRESSES_ABI,
    functionName: "getPoolDataProvider",
  });
  const tokens = await client.readContract({
    address: dataProvider,
    abi: AAVE_DATA_ABI,
    functionName: "getAllATokens",
  });
  return receiptAddressSet(
    tokens.map(token => {
      return token.tokenAddress;
    }),
  );
}

export async function readCompoundReceiptTokens(
  client: Pick<PublicClient, "readContract">,
  gateway: Address,
): Promise<Set<string>> {
  const comets = await client.readContract({
    address: gateway,
    abi: COMPOUND_REGISTRY_ABI,
    functionName: "allActiveComets",
  });
  return receiptAddressSet(comets);
}
