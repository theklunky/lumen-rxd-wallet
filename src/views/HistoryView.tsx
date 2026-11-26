/** Transaction history list. */
import type { NetworkName } from "@radiant-core/sdk";
import { useApp } from "../state/AppContext";
import type { HistoryItem } from "../lib/walletService";
import { fmtRxd, fmtSignedRxd, fmtTime, truncateMiddle } from "../lib/format";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyButton,
  EmptyState,
  ExternalIcon,
} from "../components/ui";
import { openExternal, explorerTxUrl } from "../lib/explorer";

export function HistoryView() {
  const { scan, settings } = useApp();
  if (!scan) return null;
  return (
    <div>
      {scan.history.length === 0 ? (
        <EmptyState
          title="No transactions yet"
          body="Payments to any of your receive addresses will appear here automatically."
        />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
          {scan.history.map((h) => (
            <HistoryRow key={h.txid} item={h} network={settings.network} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function HistoryRow({ item, network }: { item: HistoryItem; network: NetworkName }) {
  const delta = item.received - item.sent;
  const isIn = item.received > 0n && item.sent === 0n;
  const isOut = item.sent > 0n && item.received === 0n;
  const isUnknown = !isIn && !isOut && item.received === 0n && item.sent === 0n;
  const label = isIn ? "Received RXD" : isOut ? "Sent RXD" : isUnknown ? "Transaction" : "Internal transfer";

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          isIn ? "bg-good/12 text-good" : "bg-card2 text-muted"
        }`}
      >
        {isIn ? <ArrowDownIcon size={16} /> : <ArrowUpIcon size={16} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[13.5px] font-medium">
          {label}
          {item.height === 0 && (
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10.5px] font-semibold text-accent">
              unconfirmed
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-[12px] text-faint">
          {fmtTime(item.time)}
          {item.height > 0 && <span> · block {item.height.toLocaleString()}</span>}
          {item.counterparty && <span> · {truncateMiddle(item.counterparty, 8, 6)}</span>}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div
          title={isIn || isOut ? undefined : isUnknown ? "Amount unavailable from server" : "Amount moved between your own addresses"}
          className={`text-[13.5px] font-semibold ${isIn ? "text-good" : "text-text"}`}
        >
          {isUnknown ? "—" : isIn || isOut ? fmtSignedRxd(delta) : fmtRxd(item.received)} RXD
        </div>
        {item.fee > 0n && item.sent > 0n && (
          <div className="text-[11px] text-faint">incl. fee {fmtRxd(item.fee)} RXD</div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5 pl-1">
        <CopyButton text={item.txid} />
        <button
          title="View in explorer"
          className="rounded-md p-1.5 text-muted hover:bg-card2 hover:text-text"
          onClick={() => void openExternal(explorerTxUrl(network, item.txid))}
        >
          <ExternalIcon />
        </button>
      </div>
    </li>
  );
}
