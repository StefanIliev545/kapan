import { ReactNode } from "react";
import { formatUnits } from "viem";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { ProtocolPosition } from "~~/components/ProtocolView";

export interface TokenPositionInput {
  symbol: string;
  token: string;
  balance?: bigint;
  borrowBalance?: bigint;
  supplyRate?: bigint;
  borrowRate?: bigint;
  price: bigint;
  decimals: number;
  collateralView?: ReactNode;
}

/**
 * Builds supplied and borrowed protocol positions from raw token data.
 */
export const buildProtocolPositions = (
  tokens: TokenPositionInput[],
  convertRate: (rate: bigint) => number,
): { suppliedPositions: ProtocolPosition[]; borrowedPositions: ProtocolPosition[] } => {
  const supplied: ProtocolPosition[] = [];
  const borrowed: ProtocolPosition[] = [];

  tokens.forEach(token => {
    const tokenPrice = Number(formatUnits(token.price, 8));
    const balance = token.balance ? Number(formatUnits(token.balance, token.decimals)) : 0;
    const borrowBalance = token.borrowBalance ? Number(formatUnits(token.borrowBalance, token.decimals)) : 0;

    supplied.push({
      icon: tokenNameToLogo(token.symbol),
      name: token.symbol,
      balance: balance * tokenPrice,
      tokenBalance: token.balance || 0n,
      currentRate: token.supplyRate ? convertRate(token.supplyRate) : 0,
      tokenAddress: token.token,
      tokenPrice: token.price,
      tokenDecimals: token.decimals,
      tokenSymbol: token.symbol,
    });

    borrowed.push({
      icon: tokenNameToLogo(token.symbol),
      name: token.symbol,
      balance: -(borrowBalance * tokenPrice),
      tokenBalance: token.borrowBalance || 0n,
      currentRate: token.borrowRate ? convertRate(token.borrowRate) : 0,
      tokenAddress: token.token,
      tokenPrice: token.price,
      tokenDecimals: token.decimals,
      tokenSymbol: token.symbol,
      collateralView: token.collateralView,
    });
  });

  return { suppliedPositions: supplied, borrowedPositions: borrowed };
};

// Specific rate converters for various protocols
export const convertAaveRate = (rate: bigint): number => Number(rate) / 1e25;

export const convertCompoundRate = (ratePerSecond: bigint): number => {
  const SECONDS_PER_YEAR = 60 * 60 * 24 * 365;
  const SCALE = 1e18;
  return (Number(ratePerSecond) * SECONDS_PER_YEAR * 100) / SCALE;
};
