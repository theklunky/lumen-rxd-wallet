/**
 * Glyph tokens (FT / NFT) discovered from this wallet's history, with a
 * simple transfer flow. Token-bearing UTXOs are never used as RXD funding
 * (ref-safe selection) so viewing/transferring here can't burn anything.
 */
import { useState } from "react";
import { waveResolve } from "@radiant-core/sdk";
import { useApp, friendly } from "../state/AppContext";
import type { TokenHolding } from "../lib/walletService";
import { fmtRxd, shortHash } from "../lib/format";
import {
  Button,
  CheckIcon,
  CopyButton,
  EmptyState,
  ErrorNote,
  ExternalIcon,
  Field,
  inputCls,
  Modal,
  SendIcon,
  Spinner,
} from "../components/ui";
import { openExternal, explorerTxUrl } from "../lib/explorer";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{26,60}$/;

export function TokensView() {
  const { scan } = useApp();
  const [transferring, setTransferring] = useState<TokenHolding | null>(null);

  if (!scan) return null;
  if (scan.tokens.length === 0) {
    return (
      <EmptyState
        title="No Glyph tokens found"
        body="FT and NFT token outputs owned by this wallet are discovered automatically from its transaction history."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-muted">
        Token-bearing UTXOs are protected: they can never be spent as plain RXD
        funding, and transfers move the token without consuming its value.
      </p>
      <ul className="space-y-3">
        {scan.tokens.map((t) => (
          <TokenCard key={`${t.txid}:${t.vout}`} token={t} onTransfer={() => setTransferring(t)} />
        ))}
      </ul>
      {transferring && (
        <TransferModal token={transferring} onClose={() => setTransferring(null)} />
      )}
    </div>
  );
}

function TokenCard({ token, onTransfer }: { token: TokenHolding; onTransfer: () => void }) {
  const { settings } = useApp();
  const isFt = token.kind === "ft";
  return (
    <li className="flex items-center gap-4 rounded-xl border border-line bg-card p-4">
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold ${
          isFt ? "bg-accent/15 text-accent" : "bg-[#a78bfa]/15 text-[#a78bfa]"
        }`}
      >
        {isFt ? "FT" : "NFT"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-semibold">
            {isFt ? `${fmtRxd(token.value)} units` : "Unique item"}
          </span>
          {!token.mintedConfirmed && (
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10.5px] font-semibold text-accent">
              mint unconfirmed
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[12px] text-faint">
          <span className="font-mono">
            ref {shortHash(token.refDisplay.replace(/:.*$/, ""), 10, 6)}:{token.refDisplay.split(":")[1] ?? ""}
          </span>
          <CopyButton text={token.refDisplay} />
          <button
            className="flex items-center gap-1 text-muted hover:text-text"
            title="View token tx in explorer"
            onClick={() => void openExternal(explorerTxUrl(settings.network, token.txid))}
          >
            <ExternalIcon />
            mint tx
          </button>
        </div>
      </div>
      <Button variant="ghost" className="shrink-0 px-3 py-1.5 text-[13px]" onClick={onTransfer}>
        <SendIcon size={14} />
        Transfer
      </Button>
    </li>
  );
}

function TransferModal({ token, onClose }: { token: TokenHolding; onClose: () => void }) {
  const { scan, settings, transfer } = useApp();
  const [recipient, setRecipient] = useState("");
  const [resolved, setResolved] = useState<{ name: string; address: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const trimmed = recipient.trim();
  const destination = trimmed ? (BASE58.test(trimmed) ? trimmed : resolved?.address ?? null) : null;

  const resolve = async () => {
    setBusy(true);
    setError(null);
    try {
      const rec = await waveResolve(trimmed);
      if (rec.registered && rec.address) setResolved({ name: trimmed, address: rec.address });
      else {
        setResolved(null);
        setError(`“${trimmed}” is not a registered WAVE name`);
      }
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  const go = async () => {
    if (!destination) return;
    setBusy(true);
    setError(null);
    try {
      const res = await transfer(token, destination);
      setDone(res.txid);
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  const fundingTotal = (scan?.utxos ?? [])
    .filter((u) => !u.refs?.length)
    .reduce((a, u) => a + u.value, 0n);

  if (done) {
    return (
      <Modal title="Token transfer broadcast" onClose={onClose}>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-good/15 text-good">
            <CheckIcon size={20} />
          </span>
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold">Commit/reveal broadcast</div>
            <div className="break-all font-mono text-[11.5px] text-muted">{done}</div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => void openExternal(explorerTxUrl(settings.network, done))}>
            <ExternalIcon />
            Explorer
          </Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Transfer ${token.kind.toUpperCase()}`} onClose={onClose}>
      <Field label="Recipient" hint="RXD address or WAVE name">
        <div className="flex gap-2">
          <input
            className={inputCls}
            placeholder="1… or a WAVE name"
            value={recipient}
            onChange={(e) => {
              setRecipient(e.target.value);
              setResolved(null);
              setError(null);
            }}
          />
          {!BASE58.test(trimmed) && trimmed && (
            <Button variant="subtle" className="shrink-0 px-3" onClick={resolve} busy={busy} title="Resolve WAVE name">
              {busy ? <Spinner /> : "WAVE"}
            </Button>
          )}
        </div>
        {resolved && (
          <div className="mt-1.5 break-all font-mono text-[11.5px] text-good">→ {resolved.address}</div>
        )}
      </Field>
      {fundingTotal === 0n && (
        <div className="mt-3">
          <ErrorNote text="No spendable RXD available to pay the transfer fee." />
        </div>
      )}
      {error && (
        <div className="mt-3">
          <ErrorNote text={error} onDismiss={() => setError(null)} />
        </div>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={go} disabled={!destination || fundingTotal === 0n} busy={busy}>
          <SendIcon size={15} />
          Transfer
        </Button>
      </div>
    </Modal>
  );
}

