"use client";

import * as React from "react";
import type { FC } from "react";
import { createPortal } from "react-dom";
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
import { Search, X, ArrowDown, ArrowUp, ChevronDown } from "lucide-react";

import type { MorphoMarket } from "~~/hooks/useMorphoLendingPositions";
import { tokenNameToLogo } from "~~/contracts/externalContracts";
import { encodeMorphoContext } from "~~/utils/v2/instructionHelpers";
import { useModal } from "~~/hooks/useModal";
import { DepositModal } from "~~/components/modals/DepositModal";
import { useAccount } from "wagmi";
import { notification } from "~~/utils/scaffold-eth/notification";

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

// Searchable Select Component
interface SearchableSelectProps {
  options: string[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  allLabel: string;
  style?: React.CSSProperties;
}

function SearchableSelect({ options, value, onValueChange, placeholder, allLabel, style }: SearchableSelectProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Filter options based on search term
  const filteredOptions = React.useMemo(() => {
    if (!searchTerm.trim()) return options;
    const term = searchTerm.toLowerCase();
    return options.filter(opt => opt.toLowerCase().includes(term));
  }, [options, searchTerm]);

  // Get display value
  const displayValue = value === "all" ? allLabel : value;

  // Calculate position for dropdown
  const [position, setPosition] = React.useState<{ top: number; left: number; width: number } | null>(null);

  const updatePosition = React.useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
  }, []);

  React.useEffect(() => {
    if (isOpen) {
      updatePosition();
      
      // Update position on scroll/resize
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
      
      return () => {
        window.removeEventListener("scroll", updatePosition, true);
        window.removeEventListener("resize", updatePosition);
      };
    } else {
      setPosition(null);
    }
  }, [isOpen, updatePosition]);

  // Handle outside click
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchTerm("");
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Focus input when opened
  React.useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        const input = dropdownRef.current?.querySelector('input[type="text"]') as HTMLInputElement;
        if (input) {
          input.focus();
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleSelect = (option: string) => {
    onValueChange(option);
    setIsOpen(false);
    setSearchTerm("");
  };

  return (
    <Box style={{ position: "relative", ...style }} ref={containerRef}>
      <Button
        size="2"
        variant="surface"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        style={{ minWidth: 140, justifyContent: "space-between" }}
      >
        <Text size="2" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {displayValue}
        </Text>
        <ChevronDown width="16" height="16" style={{ flexShrink: 0, marginLeft: 8 }} />
      </Button>

      {isOpen && position && typeof document !== "undefined" && createPortal(
        <div
          ref={dropdownRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: position.top,
            left: position.left,
            width: position.width,
            zIndex: 9999,
            maxWidth: "90vw",
          }}
          className="bg-base-100 border border-base-300 rounded-xl shadow-2xl overflow-hidden"
        >
          <Box style={{ padding: 8, borderBottom: "1px solid var(--gray-6)" }}>
            <TextField.Root
              size="2"
              variant="surface"
              placeholder={`Search ${placeholder.toLowerCase()}...`}
              value={searchTerm}
              onChange={e => setSearchTerm(e.currentTarget.value)}
            >
              <TextField.Slot>
                <Search width="14" height="14" />
              </TextField.Slot>
              {searchTerm ? (
                <TextField.Slot side="right">
                  <IconButton
                    size="1"
                    variant="ghost"
                    aria-label="Clear search"
                    onClick={() => setSearchTerm("")}
                  >
                    <X width="12" height="12" />
                  </IconButton>
                </TextField.Slot>
              ) : null}
            </TextField.Root>
          </Box>

          <ScrollArea style={{ maxHeight: 300 }}>
            <Box style={{ padding: 4 }}>
              <Button
                size="2"
                variant={value === "all" ? "solid" : "ghost"}
                style={{ width: "100%", justifyContent: "flex-start" }}
                onClick={() => handleSelect("all")}
              >
                {allLabel}
              </Button>
              {filteredOptions.length === 0 ? (
                <Box style={{ padding: 12, textAlign: "center" }}>
                  <Text size="2" color="gray">
                    No matches found
                  </Text>
                </Box>
              ) : (
                filteredOptions.map(option => (
                  <Button
                    key={option}
                    size="2"
                    variant={value === option ? "solid" : "ghost"}
                    style={{ width: "100%", justifyContent: "flex-start", marginTop: 2 }}
                    onClick={() => handleSelect(option)}
                  >
                    {option}
                  </Button>
                ))
              )}
            </Box>
          </ScrollArea>
        </div>,
        document.body
      )}
    </Box>
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
  const [selectedCollateral, setSelectedCollateral] = React.useState<string>("all");
  const [selectedDebtAsset, setSelectedDebtAsset] = React.useState<string>("all");

  const usd = React.useMemo(() => makeUsdFormatter(), []);

  const depositModal = useModal();
  const [selectedMarket, setSelectedMarket] = React.useState<MorphoMarket | null>(null);
  const { address: walletAddress, chainId: walletChainId } = useAccount();

  // Extract unique collateral and debt assets from markets
  const { collateralAssets, debtAssets } = React.useMemo(() => {
    const collateralSet = new Set<string>();
    const debtSet = new Set<string>();

    markets.forEach(m => {
      if (m.collateralAsset?.symbol) {
        collateralSet.add(m.collateralAsset.symbol);
      }
      if (m.loanAsset?.symbol) {
        debtSet.add(m.loanAsset.symbol);
      }
    });

    return {
      collateralAssets: Array.from(collateralSet).sort(),
      debtAssets: Array.from(debtSet).sort(),
    };
  }, [markets]);

  const resetPaging = React.useCallback(() => setVisibleCount(pageSize), [pageSize]);

  React.useEffect(() => {
    resetPaging();
  }, [deferredSearch, sortKey, sortDirection, selectedCollateral, selectedDebtAsset, resetPaging]);

  const rows = React.useMemo(() => {
    const searchValue = deferredSearch.trim().toLowerCase();

    const candidates = markets
      .filter(m => Boolean(m.collateralAsset)) // only pairs (as in your original)
      .filter(m => {
        // Filter by selected collateral asset
        if (selectedCollateral !== "all") {
          if (m.collateralAsset?.symbol !== selectedCollateral) return false;
        }
        // Filter by selected debt asset
        if (selectedDebtAsset !== "all") {
          if (m.loanAsset?.symbol !== selectedDebtAsset) return false;
        }
        return true;
      })
      .map(m => {
        const loanDecimals = toNumberSafe(m.loanAsset?.decimals);
        const loanPriceUsd = toNumberSafe(m.loanAsset?.priceUsd);

        // Prefer USD values directly from API if available (more accurate)
        const supplyAssetsUsd = toNumberSafe(m.state?.supplyAssetsUsd);
        const borrowAssetsUsd = toNumberSafe(m.state?.borrowAssetsUsd);
        const liquidityAssetsUsd = toNumberSafe(m.state?.liquidityAssetsUsd);

        // Fallback to calculating from raw assets if USD values not available
        const supplyAssetsRaw = toNumberSafe(m.state?.supplyAssets);
        const borrowAssetsRaw = toNumberSafe(m.state?.borrowAssets);
        const liquidityAssetsRaw = toNumberSafe(m.state?.liquidityAssets ?? m.state?.supplyAssets);
        const denom = pow10(loanDecimals);

        // Use API USD values if available, otherwise calculate
        const supplyUsd = supplyAssetsUsd > 0 
          ? supplyAssetsUsd 
          : (denom > 0 ? (supplyAssetsRaw / denom) * loanPriceUsd : 0);
        const borrowUsd = borrowAssetsUsd > 0
          ? borrowAssetsUsd
          : (denom > 0 ? (borrowAssetsRaw / denom) * loanPriceUsd : 0);
        const liquidityUsd = liquidityAssetsUsd > 0
          ? liquidityAssetsUsd
          : (denom > 0 ? (liquidityAssetsRaw / denom) * loanPriceUsd : 0);

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
  }, [markets, deferredSearch, sortKey, sortDirection, selectedCollateral, selectedDebtAsset]);

  const totalPairs = marketPairs?.size ?? 0;

  const handleSupply = React.useCallback(
    (m: MorphoMarket) => {
      if (onSupply) {
        onSupply(m);
        return;
      }
      
      // Check if wallet is connected
      if (!walletAddress) {
        notification.error("Please connect your wallet to deposit");
        return;
      }
      
      // Check if wallet is on the correct chain
      if (walletChainId !== chainId) {
        notification.error(`Please switch to chain ID ${chainId} to deposit`);
        return;
      }
      
      setSelectedMarket(m);
      depositModal.open();
    },
    [onSupply, depositModal, walletAddress, walletChainId, chainId]
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

            {/* Collateral Asset Filter */}
            <SearchableSelect
              options={collateralAssets}
              value={selectedCollateral}
              onValueChange={setSelectedCollateral}
              placeholder="Collateral"
              allLabel="All Collaterals"
              style={{ minWidth: 140 }}
            />

            {/* Debt Asset Filter */}
            <SearchableSelect
              options={debtAssets}
              value={selectedDebtAsset}
              onValueChange={setSelectedDebtAsset}
              placeholder="Debt Asset"
              allLabel="All Debt Assets"
              style={{ minWidth: 140 }}
            />

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
                          setSelectedCollateral("all");
                          setSelectedDebtAsset("all");
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
            name: selectedMarket.collateralAsset?.symbol ?? "",
            icon: tokenNameToLogo(selectedMarket.collateralAsset?.symbol ?? ""),
            address: selectedMarket.collateralAsset?.address ?? "",
            currentRate: 0, // Collateral doesn't earn yield in Morpho (supplyApy is for lending loan asset)
            usdPrice: selectedMarket.collateralAsset?.priceUsd ?? undefined,
            decimals: selectedMarket.collateralAsset?.decimals,
          }}
          protocolName="morpho-blue"
          chainId={chainId}
          context={encodeMorphoContext({
            marketId: selectedMarket.uniqueKey,
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
