import { useEffect, useRef } from "react";
import { useGlobalState } from "~~/services/store/store";
import { priceService } from "~~/services/web3/PriceService";

export const useNativeCurrencyPrice = () => {
  const setNativeCurrencyPrice = useGlobalState(
    (state) => state.setNativeCurrencyPrice,
  );
  const setStrkCurrencyPrice = useGlobalState(
    (state) => state.setStrkCurrencyPrice,
  );
  const ref = useRef<object>({ id: priceService.getNextId() });
  useEffect(() => {
    const idObj = ref.current;
    priceService.startPolling(idObj, price => {
      setNativeCurrencyPrice(price);
      setStrkCurrencyPrice(price);
    });
    return () => {
      priceService.stopPolling(idObj);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
