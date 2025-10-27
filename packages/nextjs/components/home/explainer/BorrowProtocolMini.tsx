"use client";

import { Card, Flex } from "@radix-ui/themes";
import Image from "next/image";
import { SupplyPosition } from "../../SupplyPosition";
import { BorrowPosition } from "../../BorrowPosition";
import DataCycle from "../../ui/DataCycle";

type TokenDef = {
  icon: string;
  name: string;
  tokenAddress: string;
  tokenPrice: bigint;
  tokenDecimals: number;
  balance: number; // positive for supply, negative for borrow (USD)
  tokenBalance: bigint;
  currentRate: number;
};

type BorrowProtocolMiniProps = {
  protocolName: string;
  protocolIcon: string;
  networkType?: "evm" | "starknet";
  supplies: TokenDef[];
  borrows: Array<{
    token: TokenDef;
    best?: { protocol: string; rate: number };
  }>;
};

const BorrowProtocolMini = ({ protocolName, protocolIcon, networkType = "evm", supplies, borrows }: BorrowProtocolMiniProps) => {
  return (
    <Card className="bg-base-100 text-base-content border border-base-300" size="1" variant="classic">
      <div className="p-3">
        {/* Header */}
        <Flex align="center" gap="2" className="mb-3">
          <div className="w-7 h-7 relative">
            <Image src={protocolIcon} alt={protocolName} fill className="object-contain" />
          </div>
          <div className="font-semibold">{protocolName}</div>
        </Flex>

        <Flex direction={{ initial: "column", md: "row" }} gap="3">
          {/* Supplied */}
          <Flex direction="column" className="flex-1">
            <div className="text-sm font-medium border-b border-base-200 pb-1 mb-2">Supplied</div>
            <div className="space-y-2">
              {supplies.map(supply => (
                <SupplyPosition
                  key={supply.name}
                  icon={supply.icon}
                  name={supply.name}
                  balance={Math.abs(supply.balance)}
                  tokenBalance={supply.tokenBalance}
                  currentRate={supply.currentRate}
                  protocolName={protocolName}
                  tokenAddress={supply.tokenAddress}
                  tokenPrice={supply.tokenPrice}
                  tokenDecimals={supply.tokenDecimals}
                  networkType={networkType}
                  position={undefined}
                  disableMove={true}
                  availableActions={{ deposit: true, withdraw: true, move: false, swap: false }}
                  actionsDisabled
                  suppressDisabledMessage
                />
              ))}
            </div>
          </Flex>

          {/* Borrow - cycles different assets */}
          <Flex direction="column" className="flex-1">
            <div className="text-sm font-medium border-b border-base-200 pb-1 mb-2">Borrowed</div>
            <DataCycle
              intervalMs={3500}
              animation="slideX"
              items={borrows}
              render={(b) => (
                <BorrowPosition
                  icon={b.token.icon}
                  name={b.token.name}
                  balance={-Math.abs(b.token.balance)}
                  tokenBalance={b.token.tokenBalance}
                  currentRate={b.token.currentRate}
                  protocolName={protocolName}
                  tokenAddress={b.token.tokenAddress}
                  tokenPrice={b.token.tokenPrice}
                  tokenDecimals={b.token.tokenDecimals}
                  networkType={networkType}
                  availableActions={{ borrow: true, repay: true, move: true, close: false, swap: false }}
                  actionsDisabled
                  suppressDisabledMessage
                  demoOptimalOverride={b.best}
                />
              )}
            />
          </Flex>
        </Flex>
      </div>
    </Card>
  );
};

export default BorrowProtocolMini;


