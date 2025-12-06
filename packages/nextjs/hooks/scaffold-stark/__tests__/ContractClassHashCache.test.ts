import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { ContractClassHashCache } from "../ContractClassHashCache";
import { ProviderInterface } from "starknet";

describe("ContractClassHashCache", () => {
  let cache: ContractClassHashCache;

  // Mock provider
  const mockProvider: Partial<ProviderInterface> = {
    getClassHashAt: vi.fn(),
  };

  beforeEach(() => {
    cache = ContractClassHashCache.getInstance();
    cache.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should be a singleton", () => {
    const instance1 = ContractClassHashCache.getInstance();
    const instance2 = ContractClassHashCache.getInstance();
    expect(instance1).toBe(instance2);
  });

  it("should cache class hash results", async () => {
    const address = "0x123";
    const expectedHash = "0xabc";

    vi.mocked(mockProvider.getClassHashAt)!.mockResolvedValueOnce(expectedHash);

    // First call should fetch from provider
    const result1 = await cache.getClassHash(
      mockProvider as ProviderInterface,
      address,
    );

    // Second call should use cache
    const result2 = await cache.getClassHash(
      mockProvider as ProviderInterface,
      address,
    );

    expect(result1).toBe(expectedHash);
    expect(result2).toBe(expectedHash);
    expect(mockProvider.getClassHashAt).toHaveBeenCalledTimes(1);
  });

  it("should handle provider errors", async () => {
    const address = "0x123";

    vi.mocked(mockProvider.getClassHashAt)!.mockRejectedValueOnce(
      new Error("API Error"),
    );

    const result = await cache.getClassHash(
      mockProvider as ProviderInterface,
      address,
    );

    expect(result).toBeUndefined();
    expect(mockProvider.getClassHashAt).toHaveBeenCalledTimes(1);
  });

  it("should allow a different provider scope to retry immediately after a failure", async () => {
    const address = "0x123";
    const expectedHash = "0xabc";

    vi.mocked(mockProvider.getClassHashAt)!
      .mockRejectedValueOnce(new Error("Primary down"))
      .mockResolvedValueOnce(expectedHash);

    const failedAttempt = await cache.getClassHash(
      mockProvider as ProviderInterface,
      address,
      "latest",
      "primary",
    );

    const fallbackAttempt = await cache.getClassHash(
      mockProvider as ProviderInterface,
      address,
      "latest",
      "secondary",
    );

    expect(failedAttempt).toBeUndefined();
    expect(fallbackAttempt).toBe(expectedHash);
    expect(mockProvider.getClassHashAt).toHaveBeenCalledTimes(2);
  });

  it("should backoff after failures to avoid spamming provider", async () => {
    vi.useFakeTimers();
    const address = "0x123";
    const expectedHash = "0xdef";

    try {
      vi.mocked(mockProvider.getClassHashAt)!.mockRejectedValueOnce(
        new Error("API Error"),
      );

      const firstAttempt = await cache.getClassHash(
        mockProvider as ProviderInterface,
        address,
      );

      const secondAttempt = await cache.getClassHash(
        mockProvider as ProviderInterface,
        address,
      );

      expect(firstAttempt).toBeUndefined();
      expect(secondAttempt).toBeUndefined();
      expect(mockProvider.getClassHashAt).toHaveBeenCalledTimes(1);

      vi.mocked(mockProvider.getClassHashAt)!.mockResolvedValueOnce(expectedHash);

      vi.advanceTimersByTime(30_000);

      const afterBackoff = await cache.getClassHash(
        mockProvider as ProviderInterface,
        address,
      );

      expect(afterBackoff).toBe(expectedHash);
      expect(mockProvider.getClassHashAt).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("should deduplicate concurrent requests", async () => {
    const address = "0x123";
    const expectedHash = "0xabc";

    vi.mocked(mockProvider.getClassHashAt)!.mockImplementation(
      () =>
        new Promise((resolve) => setTimeout(() => resolve(expectedHash), 100)),
    );

    // Make multiple concurrent requests
    const promises = Array(3)
      .fill(null)
      .map(() =>
        cache.getClassHash(mockProvider as ProviderInterface, address),
      );

    const results = await Promise.all(promises);

    // All requests should return the same result
    results.forEach((result) => expect(result).toBe(expectedHash));
    // Provider should only be called once
    expect(mockProvider.getClassHashAt).toHaveBeenCalledTimes(1);
  });

  it("should use different cache keys for different block identifiers", async () => {
    const address = "0x123";
    const hash1 = "0xabc";
    const hash2 = "0xdef";

    vi.mocked(mockProvider.getClassHashAt)!
      .mockResolvedValueOnce(hash1)
      .mockResolvedValueOnce(hash2);

    const result1 = await cache.getClassHash(
      mockProvider as ProviderInterface,
      address,
      "pending",
    );

    const result2 = await cache.getClassHash(
      mockProvider as ProviderInterface,
      address,
      "latest",
    );

    expect(result1).toBe(hash1);
    expect(result2).toBe(hash2);
    expect(mockProvider.getClassHashAt).toHaveBeenCalledTimes(2);
  });

  it("should clear cache when requested", async () => {
    const address = "0x123";
    const expectedHash = "0xabc";

    vi.mocked(mockProvider.getClassHashAt)!.mockResolvedValue(expectedHash);

    // First call
    await cache.getClassHash(mockProvider as ProviderInterface, address);

    // Clear cache
    cache.clear();

    // Second call should fetch again
    await cache.getClassHash(mockProvider as ProviderInterface, address);

    expect(mockProvider.getClassHashAt).toHaveBeenCalledTimes(2);
  });

  it("should handle multiple addresses independently", async () => {
    const address1 = "0x123";
    const address2 = "0x456";
    const hash1 = "0xabc";
    const hash2 = "0xdef";

    vi.mocked(mockProvider.getClassHashAt)!
      .mockResolvedValueOnce(hash1)
      .mockResolvedValueOnce(hash2);

    const result1 = await cache.getClassHash(
      mockProvider as ProviderInterface,
      address1,
    );

    const result2 = await cache.getClassHash(
      mockProvider as ProviderInterface,
      address2,
    );

    expect(result1).toBe(hash1);
    expect(result2).toBe(hash2);
    expect(mockProvider.getClassHashAt).toHaveBeenCalledTimes(2);
  });
});
