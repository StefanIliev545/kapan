"use client";

import { ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";

type QRCodeModalBaseProps = {
  address: string;
  modalId: string;
  children: ReactNode;
};

/**
 * A reusable QR code modal base component.
 * Used across scaffold-eth and scaffold-stark AddressQRCodeModal components.
 *
 * @param address - The address to encode in the QR code
 * @param modalId - Unique modal ID for checkbox toggle
 * @param children - Address display component (chain-specific)
 */
export const QRCodeModalBase = ({ address, modalId, children }: QRCodeModalBaseProps) => {
  return (
    <div>
      <input type="checkbox" id={`${modalId}`} className="modal-toggle" />
      <label htmlFor={`${modalId}`} className="modal cursor-pointer">
        <label className="modal-box relative">
          {/* dummy input to capture event onclick on modal box */}
          <input className="absolute left-0 top-0 size-0" />
          <label htmlFor={`${modalId}`} className="btn btn-ghost btn-sm btn-circle absolute right-3 top-3">
            ✕
          </label>
          <div className="space-y-3 py-6">
            <div className="flex flex-col items-center gap-6">
              <QRCodeSVG value={address} size={256} />
              {children}
            </div>
          </div>
        </label>
      </label>
    </div>
  );
};
