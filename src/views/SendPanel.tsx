/**
 * Send RXD: recipient (address or WAVE name), amount, fee preview,
 * confirmation modal, broadcast + result.
 */
import { useMemo, useState } from "react";
import {
  rxdToPhotons,
  photonsToRxd,
  waveResolve,
} from "@radiant-core/sdk";
import { useApp, friendly } from "../state/AppContext";
import { fmtRxd, truncateMiddle } from "../lib/format";
import {
  Button,
  ErrorNote,
  ExternalIcon,
  Field,
  inputCls,
  Modal,
  SendIcon,
  Spinner,
  CheckIcon,
} from "../components/ui";
import { openExternal, explorerTxUrl } from "../lib/explorer";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{26,60}$/;

export function SendPanel() {
  const { scan, settings, send } = useApp();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [waveBusy, setWaveBusy] = useState(false);
  const [waveError, setWaveError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<{ name: string; address: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [result, setResult] = useState<{ txid: string; fee: bigint } | null>(null);

  const trimmed = recipient.trim();
  const looksLikeAddress = BASE58.test(trimmed);
  const destination = trimmed ? (looksLikeAddress ? trimmed : resolved?.address ?? null) : null;

  const fundingTotal = useMemo(() => {
    let t = 0n;
    for (const u of scan?.utxos ?? []) if (!u.refs?.length) t += u.value;
    return t;
  }, [scan]);

  // 3-input / 2-output worst case at the network floor (real fee is measured).
  const feeEstimate = 10_000n * (10n + 148n * 3n + 34n * 2n);

  const parsedAmount = useMemo(() => {
    try {
      if (!amount.trim()) return null;
      const p = rxdToPhotons(amount.trim());
      return p > 0n ? p : null;
    } catch {
      return null;
    }
  }, [amount]);

  const maxPhotons = fundingTotal > feeEstimate * 2n ? fundingTotal - feeEstimate * 2n : 0n;

  if (result) {
    return (
      <div className="rounded-2xl border border-good/30 bg-good/5 p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-good/15 text-good">
            <CheckIcon size={20} />
          </span>
          <div>
            <div className="font-semibold">Transaction broadcast</div>
            <div className="text-[12.5px] text-muted">
              Fee paid: {fmtRxd(result.fee)} RXD · awaiting first confirmation
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <span className="break-all font-mono text-[12px] text-muted">{result.txid}</span>
          <Button
            variant="ghost"
            className="px-3 py-1.5 text-[12.5px]"
            onClick={() => void openExternal(explorerTxUrl(settings.network, result.txid))}
          >
            <ExternalIcon />
            View in explorer
          </Button>
          <Button
            variant="subtle"
            className="ml-auto px-3 py-1.5 text-[12.5px]"
            onClick={() => {
              setResult(null);
              setRecipient("");
              setAmount("");
              setResolved(null);
            }}
          >
            Send another
          </Button>
        </div>
      </div>
    );
  }

  const doResolve = async () => {
    setWaveBusy(true);
    setWaveError(null);
    try {
      const rec = await waveResolve(trimmed);
      if (rec.registered && rec.address) {
        setResolved({ name: trimmed, address: rec.address });
      } else {
        setResolved(null);
        setWaveError(`“${truncateMiddle(trimmed, 24, 12)}” is not a registered WAVE name`);
      }
    } catch (e) {
      setWaveError(friendly(e));
    } finally {
      setWaveBusy(false);
    }
  };

  const doSend = async () => {
    if (!destination || !parsedAmount) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await send(destination, parsedAmount);
      setResult(res);
    } catch (e) {
      setSendError(friendly(e));
    } finally {
      setSending(false);
      setConfirming(false);
    }
  };

  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <SendIcon size={16} className="text-accent" />
        <span className="text-[14px] font-semibold">Send RXD</span>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Recipient" hint="RXD address or WAVE name">
          <div className="flex gap-2">
            <input
              className={inputCls}
              placeholder="1… or a WAVE name"
              value={recipient}
              onChange={(e) => {
                setRecipient(e.target.value);
                setResolved(null);
                setWaveError(null);
              }}
            />
            {!looksLikeAddress && trimmed && (
              <Button
                variant="subtle"
                className="shrink-0 px-3"
                onClick={doResolve}
                busy={waveBusy}
                title="Resolve WAVE name"
              >
                {waveBusy ? <Spinner /> : "WAVE"}
              </Button>
            )}
          </div>
          {resolved && (
            <div className="mt-1.5 break-all font-mono text-[11.5px] text-good">
              → {resolved.address}
            </div>
          )}
        </Field>
        <Field
          label="Amount"
          hint={`${fundingTotal > 0n ? fmtRxd(fundingTotal) : "0"} RXD available`}
        >
          <div className="flex gap-2">
            <input
              className={inputCls}
              placeholder="0.00"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <Button
              variant="subtle"
              className="shrink-0 px-3"
              onClick={() =>
                maxPhotons > 0n &&
                setAmount(photonsToRxd(maxPhotons).replace(/\.?0+$/, ""))
              }
              disabled={maxPhotons === 0n}
              title="Send maximum (minus fees)"
            >
              Max
            </Button>
          </div>
        </Field>
      </div>

      <div className="mt-3 flex items-center justify-between text-[12px] text-faint">
        <span>Network fee ≈ {fmtRxd(feeEstimate * 2n)} RXD (measured exactly before broadcasting)</span>
        <button
          className="text-accent hover:brightness-110 disabled:opacity-40"
          onClick={() => setConfirming(true)}
          disabled={!destination || !parsedAmount || parsedAmount > fundingTotal}
        >
          Review &amp; send →
        </button>
      </div>

      {waveError && (
        <div className="mt-3">
          <ErrorNote text={waveError} onDismiss={() => setWaveError(null)} />
        </div>
      )}
      {sendError && (
        <div className="mt-3">
          <ErrorNote text={sendError} onDismiss={() => setSendError(null)} />
        </div>
      )}
      {parsedAmount !== null && parsedAmount > fundingTotal && (
        <div className="mt-3">
          <ErrorNote text="Not enough confirmed RXD to cover this amount plus the fee." />
        </div>
      )}

      {confirming && destination !== null && parsedAmount !== null && (
        <ConfirmSend
          to={destination}
          viaWave={resolved?.name ?? null}
          amount={parsedAmount}
          feeEstimate={feeEstimate}
          busy={sending}
          onBack={() => setConfirming(false)}
          onConfirm={doSend}
        />
      )}
    </div>
  );
}

function ConfirmSend({
  to,
  viaWave,
  amount,
  feeEstimate,
  busy,
  onBack,
  onConfirm,
}: {
  to: string;
  viaWave: string | null;
  amount: bigint;
  feeEstimate: bigint;
  busy: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal title="Confirm transaction" onClose={onBack}>
      <dl className="space-y-2.5 text-[13.5px]">
        <Row k="To" v={<span className="break-all font-mono text-[12px]">{to}</span>} />
        {viaWave && <Row k="WAVE name" v={viaWave} />}
        <Row k="Amount" v={<span className="font-semibold">{fmtRxd(amount)} RXD</span>} />
        <Row k="Network fee" v={`≈ ${fmtRxd(feeEstimate * 2n)} RXD (floor rate)`} />
        <Row k="Change" v="Returns to your latest receive address" />
      </dl>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button onClick={onConfirm} busy={busy}>
          <SendIcon size={15} />
          Broadcast
        </Button>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-faint">
        Blockchain transactions are irreversible. Double-check the recipient before broadcasting.
      </p>
    </Modal>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-muted">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}
