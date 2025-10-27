"use client";

import Image from "next/image";
import { Card } from "@radix-ui/themes";

type BasicToken = { name: string; icon: string; decimals: number };

export type SwapOption = {
  sellToken: BasicToken;
  sellAmount: string;
  sellAmountUsd?: number;
  buyToken: BasicToken;
  buyAmount: string;
  buyAmountUsd?: number;
  avnuFeeAmount?: string;
  avnuFeeUsd?: number;
  integratorFeeAmount?: string;
  integratorFeeUsd?: number;
  networkFeeUsd?: number;
};

export type SwitchCollateralCardProps = {
  options: SwapOption[];
};

const formatUsd = (value?: number) =>
  value == null ? "-" : (() => { try { return value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 }); } catch { return `$${value.toFixed(2)}`; } })();

const SwitchCollateralCard = ({ options }: SwitchCollateralCardProps) => {
  const safeOptions = (options || []).filter(opt => opt && opt.sellToken && opt.buyToken);
  const first = safeOptions[0];
  return (
    <Card className="bg-base-100 text-base-content border border-base-300 w-full md:w-[32rem] mx-auto" size="1" variant="classic">
      <div className="p-3 space-y-3">
        <div className="space-y-2">
          {safeOptions.map((opt, idx) => (
            <div key={`${opt.sellToken?.name}-${opt.buyToken?.name}-${idx}`} className="flex items-center justify-between bg-base-200/40 p-2 rounded min-h-12">
              {/* Left (sell) */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="w-6 h-6 relative flex-shrink-0">
                  <Image src={opt.sellToken?.icon || "/logos/usdc.svg"} alt={opt.sellToken?.name || "SELL"} fill className="object-contain" />
                </div>
                <div className="flex flex-col justify-center leading-tight truncate">
                  <div className="text-base font-medium truncate">{opt.sellAmount} {opt.sellToken?.name || ""}</div>
                  <div className="text-[11px] text-base-content/60 truncate">{formatUsd(opt.sellAmountUsd)}</div>
                </div>
              </div>

              {/* Arrow */}
              <div className="text-base-content/50 w-6 text-center flex-shrink-0">→</div>

              {/* Right (buy) - fixed width to align icons */}
              <div className="flex items-center gap-2 justify-end w-52 flex-shrink-0">
                <div className="w-6 h-6 relative">
                  <Image src={opt.buyToken?.icon || "/logos/usdt.svg"} alt={opt.buyToken?.name || "BUY"} fill className="object-contain" />
                </div>
                <div className="flex flex-col justify-center text-right leading-tight min-w-0">
                  <div className="text-base font-medium truncate">{opt.buyAmount} {opt.buyToken?.name || ""}</div>
                  <div className="text-[11px] text-base-content/60 truncate">{formatUsd(opt.buyAmountUsd)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-1 pt-2 border-t border-base-200">
          <div className="flex justify-between text-[12px]">
            <span className="text-base-content/70">AVNU fee</span>
            <span>
              {first?.avnuFeeAmount ? `${first.avnuFeeAmount} ${first?.buyToken?.name || ""}` : "-"}
              <span className="text-base-content/50"> · {formatUsd(first?.avnuFeeUsd)}</span>
            </span>
          </div>
          {first?.integratorFeeAmount && (
            <div className="flex justify-between text-[12px]">
              <span className="text-base-content/70">Integrator fee</span>
              <span>
                {first.integratorFeeAmount} {first?.buyToken?.name || ""}
                <span className="text-base-content/50"> · {formatUsd(first.integratorFeeUsd)}</span>
              </span>
            </div>
          )}
          <div className="flex justify-between text-[12px]">
            <span className="text-base-content/70">Network fee</span>
            <span className="text-base-content/80">{formatUsd(first?.networkFeeUsd)}</span>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default SwitchCollateralCard;


