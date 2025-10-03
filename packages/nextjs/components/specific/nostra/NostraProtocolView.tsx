import { FC } from "react";

import { ProtocolView } from "../../ProtocolView";
import { useAccount } from "~~/hooks/useAccount";
import { useNostraLendingPositions } from "~~/hooks/useNostraLendingPositions";

export const NostraProtocolView: FC = () => {
  const { address: connectedAddress } = useAccount();
  const { suppliedPositions, borrowedPositions } = useNostraLendingPositions();

  const [switchDebtSource, setSwitchDebtSource] = useState<ProtocolPosition | null>(null);
  const [isSwitchTokenModalOpen, setIsSwitchTokenModalOpen] = useState(false);
  const [switchTargetAddress, setSwitchTargetAddress] = useState<string | null>(null);
  const [isSwitchModalOpen, setIsSwitchModalOpen] = useState(false);
  const [closeDebtPosition, setCloseDebtPosition] = useState<ProtocolPosition | null>(null);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);

  const tokenMetadata = useMemo(
    () =>
      tokenAddresses.map(address => {
        const symbol = symbolMap[address] ?? "";
        const decimals = tokenToDecimals[address] ?? 18;
        const borrowInfo = borrowedPositions.find(pos => pos.tokenAddress === address);
        return {
          address,
          symbol,
          decimals,
          borrowAPR: borrowInfo?.currentRate ?? 0,
          icon: tokenNameToLogo(symbol.toLowerCase()),
        };
      }),
    [tokenAddresses, symbolMap, tokenToDecimals, borrowedPositions],
  );

  const selectableTargets = useMemo(
    () => tokenMetadata.filter(meta => meta.address !== (switchDebtSource?.tokenAddress ?? "")),
    [tokenMetadata, switchDebtSource?.tokenAddress],
  );

  const handleOpenSwitch = (position: ProtocolPosition) => {
    setSwitchDebtSource(position);
    setSwitchTargetAddress(null);
    setIsSwitchTokenModalOpen(true);
  };

  const handleCloseSwitchPicker = () => {
    setIsSwitchTokenModalOpen(false);
    setSwitchTargetAddress(null);
    setSwitchDebtSource(null);
  };

  const handleSelectTarget = (address: string) => {
    setSwitchTargetAddress(address);
    setIsSwitchTokenModalOpen(false);
    setIsSwitchModalOpen(true);
  };

  const handleSwitchModalClose = () => {
    setIsSwitchModalOpen(false);
    setSwitchTargetAddress(null);
    setSwitchDebtSource(null);
  };

  const handleOpenClosePosition = (position: ProtocolPosition) => {
    setCloseDebtPosition(position);
    setIsCloseModalOpen(true);
  };

  const handleClosePositionModal = () => {
    setIsCloseModalOpen(false);
    setCloseDebtPosition(null);
  };

  const currentDebtInfo: SwitchTokenInfo | null = useMemo(() => {
    if (!switchDebtSource) return null;
    return {
      name: switchDebtSource.name,
      address: switchDebtSource.tokenAddress,
      decimals: switchDebtSource.tokenDecimals ?? 18,
      icon: switchDebtSource.icon,
    };
  }, [switchDebtSource]);

  const targetDebtInfo: SwitchTokenInfo | null = useMemo(() => {
    if (!switchTargetAddress) return null;
    const meta = tokenMetadata.find(token => token.address === switchTargetAddress);
    if (!meta) return null;
    return {
      name: meta.symbol,
      address: meta.address,
      decimals: meta.decimals,
      icon: meta.icon,
    };
  }, [switchTargetAddress, tokenMetadata]);

  const closeDebtInfo: CloseTokenInfo | null = useMemo(() => {
    if (!closeDebtPosition) return null;
    return {
      name: closeDebtPosition.name,
      address: closeDebtPosition.tokenAddress,
      decimals: closeDebtPosition.tokenDecimals ?? 18,
      icon: closeDebtPosition.icon,
    };
  }, [closeDebtPosition]);

  const switchDebtBalance = switchDebtSource?.tokenBalance ?? 0n;
  const closeDebtBalance = closeDebtPosition?.tokenBalance ?? 0n;

  const enhancedSuppliedPositions = useMemo(
    () =>
      suppliedPositions.map(position => ({
        ...position,
        extraActions: (
          <button
            type="button"
            className="btn btn-sm btn-outline btn-block"
            disabled
            title="Collateral switching coming soon"
          >
            Switch collateral (coming soon)
          </button>
        ),
      })),
    [suppliedPositions],
  );

  const enhancedBorrowedPositions = useMemo(
    () =>
      borrowedPositions.map(position => ({
        ...position,
        availableActions: { ...position.availableActions, move: false },
        extraActions: (
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={event => {
                event.stopPropagation();
                handleOpenSwitch(position);
              }}
            >
              Switch debt
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline btn-error"
              onClick={event => {
                event.stopPropagation();
                handleOpenClosePosition(position);
              }}
            >
              Close position
            </button>
          </div>
        ),
      })),
    [borrowedPositions],
  );

  return (
    <>
      <ProtocolView
        protocolName="Nostra"
        protocolIcon="/logos/nostra.svg"
        ltv={75}
        maxLtv={90}
        suppliedPositions={enhancedSuppliedPositions}
        borrowedPositions={enhancedBorrowedPositions}
        forceShowAll={!connectedAddress}
        networkType="starknet"
        disableMoveSupply
      />

      <BaseModal
        isOpen={isSwitchTokenModalOpen}
        onClose={handleCloseSwitchPicker}
        maxWidthClass="max-w-md"
        boxClassName="p-4"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Select new debt token</h3>
            <button className="btn btn-ghost btn-sm" onClick={handleCloseSwitchPicker}>
              Cancel
            </button>
          </div>

          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {selectableTargets.length === 0 ? (
              <div className="text-sm text-base-content/60">No other assets available.</div>
            ) : (
              selectableTargets.map(meta => (
                <button
                  key={meta.address}
                  type="button"
                  className="w-full rounded-md border border-base-300 p-3 flex items-center justify-between hover:border-primary transition-colors"
                  onClick={() => handleSelectTarget(meta.address)}
                >
                  <div className="flex items-center gap-2">
                    <Image src={meta.icon} alt={meta.symbol} width={28} height={28} className="rounded-full" />
                    <div>
                      <div className="font-medium">{meta.symbol}</div>
                      <div className="text-xs text-base-content/60">{meta.borrowAPR.toFixed(2)}% APR</div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </BaseModal>

      <NostraSwitchDebtModal
        isOpen={isSwitchModalOpen}
        onClose={handleSwitchModalClose}
        currentDebt={currentDebtInfo}
        targetDebt={targetDebtInfo}
        debtBalance={switchDebtBalance}
      />

      <NostraClosePositionModal
        isOpen={isCloseModalOpen}
        onClose={handleClosePositionModal}
        debt={closeDebtInfo}
        debtBalance={closeDebtBalance}
      />
    </>
  );
};

export default NostraProtocolView;
