/** Overview: balance, receive card (QR / new address), send panel, recent activity. */
import { useState } from "react";
import { useApp } from "../state/AppContext";
import { fmtRxd, fmtSignedRxd, truncateMiddle } from "../lib/format";
import {
  Button,
  CopyButton,
  EmptyState,
  PlusIcon,
} from "../components/ui";
import { SendPanel } from "./SendPanel";
import { QrModal } from "./QrModal";
import { HistoryRow } from "./HistoryView";

export function OverviewView() {
  const { scan, settings, currentAddress, newAddress } = useApp();
  const [showQr, setShowQr] = useState(false);
  const [newAddrBusy, setNewAddrBusy] = useState(false);

  if (!scan || !currentAddress) {
    return <EmptyState title="Syncing…" body="Waiting for the first scan to complete." />;
  }

  const current = currentAddress;
  const currentBusy = (scan.perAddress[current.address]?.txCount ?? 0) > 0;
  const fundingUtxos = scan.utxos.filter((u) => !u.refs?.length);
  const recent = scan.history.slice(0, 5);

  return (
    <div className="space-y-5">
      {/* Balance */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="relative overflow-hidden rounded-2xl border border-line bg-card p-6">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br from-accent/25 to-accent2/5 blur-2xl" />
          <div className="text-[12.5px] font-medium text-muted">Total balance</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[40px] font-semibold leading-none tracking-tight">
              {fmtRxd(scan.confirmed)}
            </span>
            <span className="text-[15px] font-medium text-accent">RXD</span>
          </div>
          {scan.unconfirmed !== 0n && (
            <div className="mt-2 text-[12.5px] text-muted">
              <span className={scan.unconfirmed > 0n ? "text-good" : "text-bad"}>
                {fmtSignedRxd(scan.unconfirmed)}
              </span>{" "}
              pending confirmation
            </div>
          )}
          <div className="mt-4 flex gap-5 text-[12px] text-faint">
            <span>
              {fundingUtxos.length} spendable UTXO{fundingUtxos.length === 1 ? "" : "s"}
            </span>
            <span>
              {scan.tokens.length} token{scan.tokens.length === 1 ? "" : "s"}
            </span>
            <span>
              {scan.history.length} transaction{scan.history.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        {/* Receive */}
        <div className="flex flex-col rounded-2xl border border-line bg-card p-5">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[12.5px] font-medium text-muted">
              Receive — address #{current.index}
            </div>
            <button
              className="flex items-center gap-1 text-[12px] text-accent hover:brightness-110 disabled:opacity-40"
              onClick={async () => {
                setNewAddrBusy(true);
                try {
                  await newAddress();
                } finally {
                  setNewAddrBusy(false);
                }
              }}
              disabled={newAddrBusy}
              title="Derive a fresh receive address"
            >
              <PlusIcon size={13} />
              New address
            </button>
          </div>
          <div className="flex-1">
            <div className="break-all font-mono text-[12.5px] leading-relaxed">
              {current.address}
            </div>
            <div className="mt-1 text-[11px] text-faint">{current.path}</div>
          </div>
          {currentBusy && (
            <div className="mt-2 text-[11.5px] text-accent/90">
              This address has activity — consider “New address” for the next payment.
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <Button variant="ghost" className="flex-1 py-1.5 text-[13px]" onClick={() => setShowQr(true)}>
              Show QR code
            </Button>
            <CopyButton text={current.address} className="self-center" />
          </div>
        </div>
      </div>

      {/* Send */}
      <SendPanel />

      {/* Recent activity */}
      <div>
        <div className="mb-2 text-[13px] font-semibold text-muted">Recent activity</div>
        {recent.length === 0 ? (
          <EmptyState
            title="No transactions yet"
            body={`Send some RXD to ${truncateMiddle(current.address, 10, 10)} to get started.`}
          />
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
            {recent.map((h) => (
              <HistoryRow key={h.txid} item={h} network={settings.network} />
            ))}
          </ul>
        )}
      </div>

      {showQr && (
        <QrModal address={current.address} network={settings.network} onClose={() => setShowQr(false)} />
      )}
    </div>
  );
}
