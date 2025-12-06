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
    cacheScope = "default",
  ): Promise<string | undefined> {
    const cacheKey = `${address}-${blockIdentifier}`;
    const throttleKey = `${cacheKey}:${cacheScope}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const blockedUntil = this.failedUntil.get(throttleKey);
    if (blockedUntil && blockedUntil > Date.now()) {
      return undefined;
    }

    if (this.pendingRequests.has(throttleKey)) {
      return this.pendingRequests.get(throttleKey);
    }

    const pendingRequest = this.fetchClassHash(
      publicClient,
      address,
      blockIdentifier,
      cacheKey,
      throttleKey,
    );
    this.pendingRequests.set(throttleKey, pendingRequest);

    try {
      return await pendingRequest;
    } finally {
      this.pendingRequests.delete(throttleKey);
    }
  }

  private async fetchClassHash(
    publicClient: ProviderInterface,
    address: string,
    blockIdentifier: BlockIdentifier,
    cacheKey: string,
    throttleKey: string,
  ): Promise<string | undefined> {
    try {
      const classHash = await publicClient.getClassHashAt(
        address,
        blockIdentifier,
      );
      this.cache.set(cacheKey, classHash);
      this.failedUntil.delete(throttleKey);
      return classHash;
    } catch (error) {
      console.error("Failed to fetch class hash:", error);
      this.failedUntil.set(throttleKey, Date.now() + this.retryDelayMs);
      return undefined;
    }
  }

  public clear(): void {
    this.cache.clear();
    this.failedUntil.clear();
    this.pendingRequests.clear();
  }
}
