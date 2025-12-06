import { BlockIdentifier, ProviderInterface } from "starknet";

export class ContractClassHashCache {
  private static instance: ContractClassHashCache;
  private cache = new Map<string, string>();
  private failedUntil = new Map<string, number>();
  private pendingRequests = new Map<string, Promise<string | undefined>>();
  private readonly retryDelayMs = 30_000;

  public static getInstance(): ContractClassHashCache {
    if (!ContractClassHashCache.instance) {
      ContractClassHashCache.instance = new ContractClassHashCache();
    }
    return ContractClassHashCache.instance;
  }

  public async getClassHash(
    publicClient: ProviderInterface,
    address: string,
    blockIdentifier: BlockIdentifier = "latest",
  ): Promise<string | undefined> {
    const cacheKey = `${address}-${blockIdentifier}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const blockedUntil = this.failedUntil.get(cacheKey);
    if (blockedUntil && blockedUntil > Date.now()) {
      return undefined;
    }

    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey);
    }

    const pendingRequest = this.fetchClassHash(
      publicClient,
      address,
      blockIdentifier,
      cacheKey,
    );
    this.pendingRequests.set(cacheKey, pendingRequest);

    try {
      return await pendingRequest;
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  private async fetchClassHash(
    publicClient: ProviderInterface,
    address: string,
    blockIdentifier: BlockIdentifier,
    cacheKey: string,
  ): Promise<string | undefined> {
    try {
      const classHash = await publicClient.getClassHashAt(
        address,
        blockIdentifier,
      );
      this.cache.set(cacheKey, classHash);
      this.failedUntil.delete(cacheKey);
      return classHash;
    } catch (error) {
      console.error("Failed to fetch class hash:", error);
      this.failedUntil.set(cacheKey, Date.now() + this.retryDelayMs);
      return undefined;
    }
  }

  public clear(): void {
    this.cache.clear();
    this.failedUntil.clear();
    this.pendingRequests.clear();
  }
}
