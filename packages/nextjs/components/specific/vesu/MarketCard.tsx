// Re-export the shared MarketCard component from markets module
// This component is protocol-agnostic and can be used for any market display
import { FC } from "react";
import { MarketCard as SharedMarketCard, MarketProps } from "~~/components/markets";

// VesuMarketCard props are a simplified version - force vesu protocol
export type VesuMarketCardProps = Omit<MarketProps, "protocol" | "network" | "allowDeposit">;

export const MarketCard: FC<VesuMarketCardProps> = (props) => {
  return (
    <SharedMarketCard
      {...props}
      network="starknet"
      protocol="vesu"
      allowDeposit={true}
    />
  );
};
