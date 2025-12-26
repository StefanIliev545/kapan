"use client";

import * as React from "react";
import type { FC } from "react";
import {
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  DataList,
  Flex,
  IconButton,
  Inset,
  ScrollArea,
  SegmentedControl,
  Spinner,
  Table,
  Text,
  TextField,
  Tooltip,
} from "@radix-ui/themes";
import { Search, X, ArrowDown, ArrowUp } from "lucide-react";

import type { MorphoMarket } from "~~/hooks/useMorphoLendingPositions";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { encodeMorphoContext } from "~~/utils/v2/instructionHelpers";
import { useModal } from "~~/hooks/useModal";
import { DepositModal } from "~~/components/modals/DepositModal";

type SortKey = "liquidity" | "apy" | "utilization";
type SortDirection = "desc" | "asc";

interface MorphoMarketsSectionProps {
  markets: MorphoMarket[];
  marketPairs: Map<string, MorphoMarket[]>;
  isLoading: boolean;
  chainId: number;

  /**
   * Optional: wire this to open your supply flow (modal / route / drawer).
   */
  onSupply?: (market: MorphoMarket) => void;

  /**
   * Optional: default 20.
   */
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 20;

function toNumberSafe(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function pow10(decimals: number): number {
  // decimals are typically <= 18; safe for JS numbers in this context.
  return 10 ** Math.max(0, Math.min(36, decimals));
}

function truncateMiddle(value: string, left = 6, right = 4): string {
  if (!value) return "";
  if (value.length <= left + right + 3) return value;
  return `${value.slice(0, left)}…${value.slice(-right)}`;
}

function utilizationBadgeColor(utilization: number): "red" | "amber" | "green" {
  if (utilization >= 0.9) return "red";
  if (utilization >= 0.7) return "amber";
  return "green";
}

function makeUsdFormatter() {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  });
}

function formatPercent(value01: number, digits: number): string {
  const fmt = new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return fmt.format(value01);
}

function TokenPairAvatars(props: { collateralSymbol?: string; loanSymbol: string }) {
  const collateralSymbol = (props.collateralSymbol ?? "").toLowerCase();
  const loanSymbol = (props.loanSymbol ?? "").toLowerCase();

  const collateralSrc = tokenNameToLogo(collateralSymbol);
  const loanSrc = tokenNameToLogo(loanSymbol);

  return (
    <Flex align="center" style={{ position: "relative" }}>
      <Box style={{ position: "relative", zIndex: 2 }}>
        <Avatar
          size="2"
          radius="full"
          src={collateralSrc}
          fallback={(props.collateralSymbol ?? "?").slice(0, 2).toUpperCase()}
        />
      </Box>

      <Box style={{ position: "relative", marginLeft: "-10px", zIndex: 1 }}>
        <Avatar size="2" radius="full" src={loanSrc} fallback={props.loanSymbol.slice(0, 2).toUpperCase()} />
      </Box>
    </Flex>
  );
}

export const MorphoMarketsSection: FC<MorphoMarketsSectionProps> = ({
  markets,
  marketPairs,
  isLoading,
  chainId,
  onSupply,
  pageSize = DEFAULT_PAGE_SIZE,
}) => {
  const [sortKey, setSortKey] = React.useState<SortKey>("liquidity");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("desc");
  const [search, setSearch] = React.useState("");
  const deferredSearch = React.useDeferredValue(search);
  const [visibleCount, setVisibleCount] = React.useState(pageSize);

  const usd = React.useMemo(() => makeUsdFormatter(), []);

  const depositModal = useModal();
  const [selectedMarket, setSelectedMarket] = React.useState<MorphoMarket | null>(null);

  const resetPaging = React.useCallback(() => setVisibleCount(pageSize), [pageSize]);

  React.useEffect(() => {
    resetPaging();
  }, [deferredSearch, sortKey, sortDirection, resetPaging]);

  const rows = React.useMemo(() => {
    const searchValue = deferredSearch.trim().toLowerCase();

    const candidates = markets
      .filter(m => Boolean(m.collateralAsset)) // only pairs (as in your original)
      .map(m => {
        const loanDecimals = toNumberSafe(m.loanAsset?.decimals);
        const loanPriceUsd = toNumberSafe(m.loanAsset?.priceUsd);

        const supplyAssetsRaw = toNumberSafe(m.state?.supplyAssets);
        const borrowAssetsRaw = toNumberSafe(m.state?.borrowAssets);
        const liquidityAssetsRaw = toNumberSafe(m.state?.liquidityAssets ?? m.state?.supplyAssets);

        const denom = pow10(loanDecimals);

        const supplyUsd = denom > 0 ? (supplyAssetsRaw / denom) * loanPriceUsd : 0;
        const borrowUsd = denom > 0 ? (borrowAssetsRaw / denom) * loanPriceUsd : 0;
        const liquidityUsd = denom > 0 ? (liquidityAssetsRaw / denom) * loanPriceUsd : 0;

        const utilization01 = toNumberSafe(m.state?.utilization);
        const supplyApy01 = toNumberSafe(m.state?.supplyApy);
        const borrowApy01 = toNumberSafe(m.state?.borrowApy);

        const lltv01 = toNumberSafe(m.lltv) / 1e18;

        const collateralSymbol = m.collateralAsset?.symbol ?? "";
        const loanSymbol = m.loanAsset?.symbol ?? "";

        const searchable = `${collateralSymbol}/${loanSymbol} ${collateralSymbol} ${loanSymbol} ${m.uniqueKey}`.toLowerCase();

        return {
          market: m,
          collateralSymbol,
          loanSymbol,
          liquidityUsd,
          supplyUsd,
          borrowUsd,
          utilization01,
          supplyApy01,
          borrowApy01,
          lltv01,
          searchable,
        };
      })
      .filter(r => (searchValue ? r.searchable.includes(searchValue) : true));

    const sorted = [...candidates].sort((a, b) => {
      let delta = 0;

      switch (sortKey) {
        case "liquidity":
          delta = a.liquidityUsd - b.liquidityUsd;
          break;
        case "apy":
          delta = a.supplyApy01 - b.supplyApy01;
          break;
        case "utilization":
          delta = a.utilization01 - b.utilization01;
          break;
        default:
          delta = 0;
      }

      return sortDirection === "asc" ? delta : -delta;
    });

    return sorted;
  }, [markets, deferredSearch, sortKey, sortDirection]);

  const totalPairs = marketPairs?.size ?? 0;

  const handleSupply = React.useCallback(
    (m: MorphoMarket) => {
      if (onSupply) {
        onSupply(m);
        return;
      }
      setSelectedMarket(m);
      depositModal.open();
    },
    [onSupply, depositModal]
  );

  if (isLoading) {
    return (
      <Card size="2">
        <Flex align="center" justify="center" py="6">
          <Spinner size="3" />
        </Flex>
      </Card>
    );
  }

  if (markets.length === 0) {
    return (
      <Card size="2">
        <Flex direction="column" gap="2">
          <Text weight="bold">No markets available</Text>
          <Text color="gray">No markets were returned for this chain (chainId: {chainId}).</Text>
        </Flex>
      </Card>
    );
  }

  return (
    <Flex direction="column" gap="4">
      <Card size="2">
        <Flex direction="column" gap="3">
          <Flex align="center" justify="between" wrap="wrap" gap="3">
            <Flex direction="column" gap="1">
              <Text weight="bold">Morpho Markets</Text>
              <Text size="2" color="gray">
                Chain ID: {chainId}
                {totalPairs > 0 ? ` • Pairs: ${totalPairs}` : ""}
              </Text>
            </Flex>

            <DataList.Root orientation={{ initial: "vertical", sm: "horizontal" }} size="1">
              <DataList.Item>
                <DataList.Label>Results</DataList.Label>
                <DataList.Value>{rows.length}</DataList.Value>
              </DataList.Item>
              <DataList.Item>
                <DataList.Label>Showing</DataList.Label>
                <DataList.Value>{Math.min(visibleCount, rows.length)}</DataList.Value>
              </DataList.Item>
            </DataList.Root>
          </Flex>

          <Flex align="center" wrap="wrap" gap="3">
            <Box style={{ minWidth: 260, flex: 1 }}>
              <TextField.Root
                size="2"
                variant="surface"
                placeholder="Search markets (e.g., ETH, USDC, WBTC/USDC)…"
                value={search}
                onChange={e => setSearch(e.currentTarget.value)}
              >
                <TextField.Slot>
                  <Search width="16" height="16" />
                </TextField.Slot>

                {search ? (
                  <TextField.Slot side="right">
                    <IconButton
                      size="1"
                      variant="ghost"
                      aria-label="Clear search"
                      onClick={() => setSearch("")}
                    >
                      <X width="16" height="16" />
                    </IconButton>
                  </TextField.Slot>
                ) : null}
              </TextField.Root>
            </Box>

            <Flex align="center" gap="2" wrap="wrap">
              <Text size="2" color="gray">
                Sort
              </Text>

              <SegmentedControl.Root
                size="2"
                value={sortKey}
                onValueChange={v => setSortKey(v as SortKey)}
                aria-label="Sort markets"
              >
                <SegmentedControl.Item value="liquidity">Liquidity</SegmentedControl.Item>
                <SegmentedControl.Item value="apy">Supply APY</SegmentedControl.Item>
                <SegmentedControl.Item value="utilization">Utilization</SegmentedControl.Item>
              </SegmentedControl.Root>

              <Tooltip content={sortDirection === "desc" ? "Descending" : "Ascending"}>
                <IconButton
                  size="2"
                  variant="surface"
                  aria-label="Toggle sort direction"
                  onClick={() => setSortDirection(d => (d === "desc" ? "asc" : "desc"))}
                >
                  {sortDirection === "desc" ? <ArrowDown width="16" height="16" /> : <ArrowUp width="16" height="16" />}
                </IconButton>
              </Tooltip>
            </Flex>
          </Flex>
        </Flex>
      </Card>

      <Card size="2">
        <Inset side="x" my="3">
          <ScrollArea scrollbars="horizontal" type="auto">
            <Box px="3" pb="3">
              {rows.length === 0 ? (
                <Card variant="surface" size="2">
                  <Flex direction="column" gap="2">
                    <Text weight="bold">No matches</Text>
                    <Text color="gray" size="2">
                      Try a different symbol or clear the search filter.
                    </Text>
                    <Flex gap="2">
                      <Button variant="soft" onClick={() => setSearch("")} disabled={!search}>
                        Clear search
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSearch("");
                          setSortKey("liquidity");
                          setSortDirection("desc");
                        }}
                      >
                        Reset all
                      </Button>
                    </Flex>
                  </Flex>
                </Card>
              ) : (
                <Table.Root variant="ghost" layout="fixed" size="2">
                  <Table.Header>
                    <Table.Row align="center">
                      <Table.ColumnHeaderCell minWidth="260px">Market</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell justify="end" width="140px">
                        Supply
                      </Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell justify="end" width="140px">
                        Borrow
                      </Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell justify="end" width="140px">
                        Utilization
                      </Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell justify="end" width="130px">
                        Supply APY
                      </Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell justify="end" width="130px">
                        Borrow APY
                      </Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell justify="end" width="110px">
                        Max LTV
                      </Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell justify="end" width="130px" />
                    </Table.Row>
                  </Table.Header>

                  <Table.Body>
                    {rows.slice(0, visibleCount).map(r => {
                      const { market } = r;

                      return (
                        <Table.Row key={market.uniqueKey} align="center">
                          <Table.RowHeaderCell>
                            <Flex align="center" gap="3">
                              <TokenPairAvatars collateralSymbol={r.collateralSymbol} loanSymbol={r.loanSymbol} />

                              <Flex direction="column" gap="1" style={{ minWidth: 0 }}>
                                <Text weight="medium" style={{ lineHeight: 1.1 }}>
                                  {r.collateralSymbol}/{r.loanSymbol}
                                </Text>

                                <Flex align="center" gap="2" wrap="wrap">
                                  <Text size="1" color="gray">
                                    {truncateMiddle(market.uniqueKey, 10, 6)}
                                  </Text>
                                </Flex>
                              </Flex>
                            </Flex>
                          </Table.RowHeaderCell>

                          <Table.Cell justify="end">
                            <Text>{usd.format(r.supplyUsd)}</Text>
                          </Table.Cell>

                          <Table.Cell justify="end">
                            <Text>{usd.format(r.borrowUsd)}</Text>
                          </Table.Cell>

                          <Table.Cell justify="end">
                            <Badge
                              variant="soft"
                              color={utilizationBadgeColor(r.utilization01)}
                              radius="large"
                            >
                              {formatPercent(r.utilization01, 1)}
                            </Badge>
                          </Table.Cell>

                          <Table.Cell justify="end">
                            <Text color="green">{formatPercent(r.supplyApy01, 2)}</Text>
                          </Table.Cell>

                          <Table.Cell justify="end">
                            <Text color="red">{formatPercent(r.borrowApy01, 2)}</Text>
                          </Table.Cell>

                          <Table.Cell justify="end">
                            <Text>{formatPercent(r.lltv01, 0)}</Text>
                          </Table.Cell>

                          <Table.Cell justify="end">
                            <Button size="2" variant="solid" onClick={() => handleSupply(market)}>
                              Supply
                            </Button>
                          </Table.Cell>
                        </Table.Row>
                      );
                    })}
                  </Table.Body>
                </Table.Root>
              )}
            </Box>
          </ScrollArea>
        </Inset>

        {rows.length > visibleCount ? (
          <Flex align="center" justify="center" pb="4">
            <Button variant="soft" onClick={() => setVisibleCount(v => Math.min(v + pageSize, rows.length))}>
              Show more
            </Button>
          </Flex>
        ) : null}
      </Card>

      {selectedMarket && (
        <DepositModal
          isOpen={depositModal.isOpen}
          onClose={() => {
            depositModal.close();
            setSelectedMarket(null);
          }}
          token={{
            name: selectedMarket.loanAsset.symbol,
            icon: tokenNameToLogo(selectedMarket.loanAsset.symbol),
            address: selectedMarket.loanAsset.address,
            currentRate: selectedMarket.state.supplyApy * 100, // Convert from decimal (0.05) to percentage (5)
            usdPrice: selectedMarket.loanAsset.priceUsd ?? undefined,
            decimals: selectedMarket.loanAsset.decimals,
          }}
          protocolName="morpho"
          chainId={chainId}
          context={encodeMorphoContext({
            marketId: selectedMarket.id,
            loanToken: selectedMarket.loanAsset.address,
            collateralToken: selectedMarket.collateralAsset?.address || "",
            oracle: selectedMarket.oracle?.address || "",
            irm: selectedMarket.irmAddress,
            lltv: BigInt(selectedMarket.lltv),
          })}
        />
      )}
    </Flex>
  );
};
