import { Address as AddressType } from "@starknet-react/chains";
import { QRCodeModalBase } from "~~/components/common";
import { Address } from "~~/components/scaffold-stark";

type AddressQRCodeModalProps = {
  address: AddressType;
  modalId: string;
};

export const AddressQRCodeModal = ({
  address,
  modalId,
}: AddressQRCodeModalProps) => {
  return (
    <QRCodeModalBase address={address} modalId={modalId}>
      <Address address={address} format="short" disableAddressLink />
    </QRCodeModalBase>
  );
};
