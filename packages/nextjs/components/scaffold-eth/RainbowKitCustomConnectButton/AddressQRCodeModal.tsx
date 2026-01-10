import { Address as AddressType } from "viem";
import { QRCodeModalBase } from "~~/components/common";
import { Address } from "~~/components/scaffold-eth";

type AddressQRCodeModalProps = {
  address: AddressType;
  modalId: string;
};

export const AddressQRCodeModal = ({ address, modalId }: AddressQRCodeModalProps) => {
  return (
    <QRCodeModalBase address={address} modalId={modalId}>
      <Address address={address} format="long" disableAddressLink onlyEnsOrAddress />
    </QRCodeModalBase>
  );
};
