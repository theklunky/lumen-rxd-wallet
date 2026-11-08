/** All derived receive addresses with per-address activity. */
import { useState } from "react";
import { useApp } from "../state/AppContext";
import { fmtRxd } from "../lib/format";
import { CopyButton, ExternalIcon, PlusIcon } from "../components/ui";
import { explorerAddressUrl, openExternal } from "../lib/explorer";
import { QrModal } from "./QrModal";

interface AddressRow {
  address: string;
  path: string;
  index: number;
}

export function AddressesView() {
  const { scan, addresses, settings, newAddress } = useApp();
  const [qr, setQr] = useState<AddressRow | null>(null);
  if (!addresses || !scan) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl border border-line bg-card px-4 py-3">
        <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-muted">
          Every receive address is derived from your 12-word seed, so funds
          sent to <em>any</em> of these addresses belong to this wallet. The
          current address is the one used for new payments.
        </p>
        <button
          onClick={() => void newAddress()}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-medium text-muted hover:bg-card2 hover:text-text"
        >
          <PlusIcon size={14} />
          New address
        </button>
      </div>

      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
        {addresses.map((a) => {
          const stats = scan.perAddress[a.address];
          const balance = (stats?.confirmed ?? 0n) + (stats?.unconfirmed ?? 0n);
          const isCurrent = a.index === settings.receiveIndex;
          return (
            <li key={a.address} className="flex items-center gap-3 px-4 py-3">
              <span
                className={`w-9 shrink-0 rounded-md px-1.5 py-0.5 text-center text-[11px] font-semibold ${
                  isCurrent ? "bg-accent/15 text-accent" : "bg-card2 text-muted"
                }`}
              >
                #{a.index}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-mono text-[12.5px]">{a.address}</span>
                  {isCurrent && (
                    <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[10.5px] font-semibold text-accent">
                      current
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[12px] text-faint">
                  {fmtRxd(balance)} RXD · {stats?.txCount ?? 0} transactions · {a.path}
                </div>
              </div>
              <CopyButton text={a.address} />
              <button
                title="Show QR code"
                className="rounded-md p-1.5 text-muted hover:bg-card2 hover:text-text"
                onClick={() => setQr(a)}
              >
                <span className="block px-0.5 text-[11px] font-semibold">QR</span>
              </button>
              <button
                title="View in explorer"
                className="rounded-md p-1.5 text-muted hover:bg-card2 hover:text-text"
                onClick={() => void openExternal(explorerAddressUrl(settings.network, a.address))}
              >
                <ExternalIcon />
              </button>
            </li>
          );
        })}
      </ul>

      {qr && (
        <QrModal
          address={qr.address}
          network={settings.network}
          onClose={() => setQr(null)}
        />
      )}
    </div>
  );
}