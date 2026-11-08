/** QR code modal for the receive address. */
import { QRCodeSVG } from "qrcode.react";
import type { NetworkName } from "@radiant-core/sdk";
import { Modal, CopyButton, Button } from "../components/ui";
import { explorerAddressUrl, openExternal } from "../lib/explorer";
import { ExternalIcon } from "../components/ui";

export function QrModal({
  address,
  network,
  onClose,
}: {
  address: string;
  network: NetworkName;
  onClose: () => void;
}) {
  return (
    <Modal title="Receive RXD" onClose={onClose} width={360}>
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-2xl bg-white p-4">
          <QRCodeSVG value={address} size={220} marginSize={1} />
        </div>
        <div className="w-full break-all rounded-lg bg-panel p-3 text-center font-mono text-[12px] leading-relaxed">
          {address}
        </div>
        <div className="flex w-full items-center justify-center gap-2">
          <CopyButton text={address} />
          <Button
            variant="ghost"
            className="px-3 py-1.5 text-[12.5px]"
            onClick={() => void openExternal(explorerAddressUrl(network, address))}
          >
            <ExternalIcon />
            View in explorer
          </Button>
        </div>
      </div>
    </Modal>
  );
}
