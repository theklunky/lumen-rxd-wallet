/**
 * Wallet setup: create new (generate + confirm phrase) or restore from a
 * BIP-39 phrase, then set the vault password.
 */
import { useMemo, useState } from "react";
import { HDWallet, RADIANT_COIN_TYPE } from "@radiant-core/sdk";
import { useApp, friendly } from "../state/AppContext";
import {
  Button,
  CheckIcon,
  CopyButton,
  ErrorNote,
  Field,
  inputCls,
  RadiantMark,
  ShieldIcon,
} from "../components/ui";
import { MIN_PASSWORD_LENGTH } from "../lib/crypto";

type Mode = "choose" | "create" | "restore";
type Step = "phrase" | "password";

export function SetupView() {
  const [mode, setMode] = useState<Mode>("choose");
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="w-full max-w-[520px]">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-line bg-card2 shadow-[0_4px_24px_-4px_rgba(56,189,248,0.45)]">
            <RadiantMark size={46} />
          </div>
          <h1 className="text-lg font-semibold">Lumen RXD Wallet</h1>
          <p className="text-[13px] text-muted">
            A non-custodial wallet for the Radiant (RXD) blockchain
          </p>
        </div>
        {mode === "choose" && <ChooseMode onPick={setMode} />}
        {mode === "create" && <CreateFlow onBack={() => setMode("choose")} />}
        {mode === "restore" && <RestoreFlow onBack={() => setMode("choose")} />}
      </div>
    </div>
  );
}

function ChooseMode({ onPick }: { onPick: (m: Mode) => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <button
        className="group rounded-2xl border border-line bg-card p-6 text-left transition-colors hover:border-accent/50 hover:bg-card2"
        onClick={() => onPick("create")}
      >
        <div className="mb-3 text-accent">
          <ShieldIcon size={26} />
        </div>
        <div className="font-semibold">Create a new wallet</div>
        <div className="mt-1 text-[12.5px] text-muted">
          Generate a fresh 12-word recovery phrase and set a password.
        </div>
      </button>
      <button
        className="group rounded-2xl border border-line bg-card p-6 text-left transition-colors hover:border-accent/50 hover:bg-card2"
        onClick={() => onPick("restore")}
      >
        <div className="mb-3 text-accent">
          <CheckIcon size={26} />
        </div>
        <div className="font-semibold">Restore a wallet</div>
        <div className="mt-1 text-[12.5px] text-muted">
          Enter an existing 12-word recovery phrase to regain access.
        </div>
      </button>
    </div>
  );
}

/** Shared password step, invoked after the phrase is confirmed. */
function PasswordStep({
  mnemonic,
  coinType,
  onBack,
  onDone,
}: {
  mnemonic: string;
  coinType: number;
  onBack: () => void;
  onDone: () => void;
}) {
  const { createWallet } = useApp();
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await createWallet(mnemonic, pw1, coinType);
      onDone();
    } catch (e) {
      setError(friendly(e));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted">
        Choose a password to protect your wallet on this Mac. It encrypts the
        recovery phrase locally — nothing is sent anywhere.
      </p>
      <Field label="Password" hint={`min ${MIN_PASSWORD_LENGTH} characters`}>
        <input
          type="password"
          className={inputCls}
          value={pw1}
          onChange={(e) => setPw1(e.target.value)}
          autoFocus
          autoComplete="new-password"
        />
      </Field>
      <Field label="Confirm password">
        <input
          type="password"
          className={inputCls}
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          autoComplete="new-password"
        />
      </Field>
      {error && <ErrorNote text={error} />}
      <div className="flex justify-between pt-1">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button
          onClick={submit}
          busy={busy}
          disabled={pw1.length < MIN_PASSWORD_LENGTH || pw1 !== pw2}
        >
          <ShieldIcon />
          Create wallet
        </Button>
      </div>
    </div>
  );
}
function CreateFlow({ onBack }: { onBack: () => void }) {
  const mnemonic = useMemo(() => HDWallet.generateMnemonic(), []);
  const words = mnemonic.split(" ");
  const [confirmed, setConfirmed] = useState(false);
  const [step, setStep] = useState<Step>("phrase");

  if (step === "password") {
    return (
      <div className="rounded-2xl border border-line bg-card p-6">
        <h2 className="mb-4 text-[15px] font-semibold">Set a password</h2>
        <PasswordStep
          mnemonic={mnemonic}
          coinType={RADIANT_COIN_TYPE}
          onBack={() => setStep("phrase")}
          onDone={() => undefined}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Your recovery phrase</h2>
          <CopyButton text={mnemonic} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {words.map((w, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-lg bg-panel px-2.5 py-1.5 font-mono text-[13px]"
            >
              <span className="w-5 shrink-0 text-right text-faint">{i + 1}.</span>
              {w}
            </div>
          ))}
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-muted">
          Write these 12 words down in order and store them offline. Anyone
          with this phrase controls the funds — the wallet never uploads it.
        </p>
      </div>
      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-card p-4">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-accent"
        />
        <span className="text-[13px] text-muted">
          I have written down my recovery phrase and understand that losing it
          means losing access to my funds.
        </span>
      </label>
      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button disabled={!confirmed} onClick={() => setStep("password")}>
          Continue
        </Button>
      </div>
      <p className="text-center text-[11px] text-faint">
        Derivation path: m/44′/{RADIANT_COIN_TYPE}′/0′/0/k — the standard Radiant path (SLIP-0044 coin type 512)
      </p>
    </div>
  );
}

function RestoreFlow({ onBack }: { onBack: () => void }) {
  const [phrase, setPhrase] = useState("");
  const [legacy, setLegacy] = useState(false);
  const [step, setStep] = useState<Step>("phrase");
  const [error, setError] = useState<string | null>(null);

  const coinType = legacy ? 0 : RADIANT_COIN_TYPE;
  const normalized = phrase.trim().toLowerCase().replace(/\s+/g, " ");

  const valid = useMemo(() => {
    if (normalized.split(" ").length < 12) return false;
    try {
      HDWallet.fromMnemonic(normalized, { coinType });
      return true;
    } catch {
      return false;
    }
  }, [normalized, coinType]);

  if (step === "password") {
    return (
      <div className="rounded-2xl border border-line bg-card p-6">
        <h2 className="mb-4 text-[15px] font-semibold">Set a password</h2>
        <PasswordStep
          mnemonic={normalized}
          coinType={coinType}
          onBack={() => setStep("phrase")}
          onDone={() => undefined}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-card p-5">
        <h2 className="mb-3 text-[15px] font-semibold">Recovery phrase</h2>
        <textarea
          className={`${inputCls} min-h-[92px] resize-y font-mono text-[13px] leading-relaxed`}
          placeholder="Enter your 12 words separated by spaces…"
          value={phrase}
          onChange={(e) => {
            setPhrase(e.target.value);
            setError(null);
          }}
          autoFocus
        />
        {normalized.length > 0 && !valid && (
          <p className="mt-2 text-[12.5px] text-bad">
            That doesn't look like a valid 12-word BIP-39 phrase
            {legacy ? "" : " for the standard Radiant path"}.
          </p>
        )}
      </div>
      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line bg-card p-4">
        <input
          type="checkbox"
          checked={legacy}
          onChange={(e) => setLegacy(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-accent"
        />
        <span className="text-[12.5px] text-muted">
          <span className="text-text">Legacy wallet (coin type 0)</span> — only
          for wallets created before the Radiant coin-type-512 default
          (m/44′/0′/0′/0/k).
        </span>
      </label>
      {error && <ErrorNote text={error} />}
      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button disabled={!valid} onClick={() => setStep("password")}>
          Continue
        </Button>
      </div>
    </div>
  );
}

