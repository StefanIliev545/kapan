export interface MorphoApiAsset {
  address: string;
  symbol: string;
  decimals: number;
  price?: {
    usd: number;
  } | null;
}

/** Keep the existing client asset shape while Morpho exposes prices as an object. */
export function normalizeMorphoAsset(asset: MorphoApiAsset) {
  const { price, ...metadata } = asset;
  return {
    ...metadata,
    priceUsd: price?.usd ?? null,
  };
}

/** Failed discovery must not be represented as a successful empty collection. */
export async function readMorphoGraphQLItems<T>(
  response: Response,
  collection: "markets" | "marketPositions",
): Promise<T[]> {
  if (!response.ok) {
    throw new Error(`Morpho API request failed (HTTP ${response.status})`);
  }
  const body = await response.json();
  if (body.errors?.length) {
    throw new Error("Morpho API GraphQL request failed");
  }
  const items = body.data?.[collection]?.items;
  if (!Array.isArray(items)) {
    throw new Error(`Morpho API returned an invalid ${collection} response`);
  }
  return items;
}
