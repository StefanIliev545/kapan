import scaffoldConfig from "~~/scaffold.config";
import { withRetry } from "~~/utils/retry";

export const fetchPrice = async (retries = 3): Promise<number> => {
  try {
    return await withRetry(
      async () => {
        const response = await fetch(`/api/price`);
        const data = await response.json();
        return data.starknet.usd as number;
      },
      {
        retries,
        baseDelay: 1000,
        onRetry: (attempt, error) => {
          console.error(`Attempt ${attempt} - Error fetching STRK price from Coingecko: `, error);
        },
      }
    );
  } catch {
    console.error(`Failed to fetch price after ${retries + 1} attempts.`);
    return 0;
  }
};

class PriceService {
  private static instance: PriceService;
  private intervalId: NodeJS.Timeout | null = null;
  private listeners = new Map<
    object,
    {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      setNativeCurrencyPrice: (price: number) => void;
    }
  >();
  private currentNativeCurrencyPrice = 0;
  private idCounter = 0;

  static getInstance(): PriceService {
    if (!PriceService.instance) {
      PriceService.instance = new PriceService();
    }
    return PriceService.instance;
  }

  public getNextId(): number {
    return ++this.idCounter;
  }

  public startPolling(ref: object, setNativeCurrencyPrice: (price: number) => void) {
    if (this.listeners.has(ref)) return;
    this.listeners.set(ref, { setNativeCurrencyPrice });

    if (this.intervalId) {
      setNativeCurrencyPrice(this.currentNativeCurrencyPrice);
      return;
    }

    this.fetchPrices();
    this.intervalId = setInterval(() => {
      this.fetchPrices();
    }, scaffoldConfig.pollingInterval);
  }

  public stopPolling(ref: object) {
    if (!this.intervalId) return;
    if (!this.listeners.has(ref)) return;

    this.listeners.delete(ref);
    if (this.listeners.size === 0) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  public getCurrentNativeCurrencyPrice() {
    return this.currentNativeCurrencyPrice;
  }

  private async fetchPrices() {
    try {
      const strkPrice = await fetchPrice();
      if (strkPrice) {
        this.currentNativeCurrencyPrice = strkPrice;
      }
      this.listeners.forEach(listener => {
        listener.setNativeCurrencyPrice(strkPrice || this.currentNativeCurrencyPrice);
      });
    } catch (error) {
      console.error("Error fetching prices:", error);
    }
  }
}

export const priceService = PriceService.getInstance();
