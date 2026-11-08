/**
 * Settings: network & ElectrumX server, auto-lock, security
 * (reveal phrase / change password / erase), and about/links.
 */
import { useState } from "react";
import { useApp, friendly, defaultEndpointFor } from "../state/AppContext";
import {
  Button,
  CopyButton,
  ErrorNote,
  Field,
  inputCls,
  KeyIcon,
  Modal,
  RadiantMark,
  ShieldIcon,
  ExternalIcon,
} from "../components/ui";
import { openExternal } from "../lib/explorer";
import { MIN_PASSWORD_LENGTH } from "../lib/crypto";

export function SettingsView() {
  const { settings, updateSettings } = useApp();
  const [network, setNetwork] = useState(settings.network);
  const [endpoint, setEndpoint] = useState(settings.customEndpoint);
  const [applying, setApplying] = useState(false);
  const [netError, setNetError] = useState<string | null>(null);

  const apply = async () => {
    setApplying(true);
    setNetError(null);
    try {
      const ep = endpoint.trim();
      if (ep && !/^(wss:|ws:)/.test(ep)) {
        throw new Error("Endpoint must start with wss:// or ws://");
      }
      await updateSettings({ network, customEndpoint: ep });
    } catch (e) {
      setNetError(friendly(e));
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="max-w-[720px] space-y-5">
      {/* Network */}
      <section className="rounded-2xl border border-line bg-card p-5">
        <h2 className="mb-4 text-[14px] font-semibold">Network &amp; server</h2>
        <div className="mb-4 grid grid-cols-2 gap-3">
          {(["mainnet", "testnet"] as const).map((n) => (
            <button
              key={n}
              onClick={() => setNetwork(n)}
              className={`rounded-xl border p-3 text-left transition-colors ${
                network === n ? "border-accent/60 bg-accent/10" : "border-line bg-panel hover:bg-card2"
              }`}
            >
              <div className="text-[13.5px] font-semibold">{n === "mainnet" ? "Mainnet" : "Testnet"}</div>
              <div className="mt-0.5 text-[11.5px] text-faint">
                {n === "mainnet" ? "Radiant (RXD)" : "Test network"}
              </div>
            </button>
          ))}
        </div>
        <Field
          label="ElectrumX server"
          hint={endpoint.trim() ? "" : `default: ${defaultEndpointFor(network)}`}
        >
          <input
            className={inputCls}
            placeholder={defaultEndpointFor(network)}
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            spellCheck={false}
          />
        </Field>
        {network === "testnet" && !endpoint.trim() && (
          <p className="mt-2 text-[12px] text-accent">
            No public testnet ElectrumX is published — enter a testnet server
            (e.g. wss://your-testnet-electrumx:443) to sync testnet balances.
          </p>
        )}
        {netError && (
          <div className="mt-3">
            <ErrorNote text={netError} onDismiss={() => setNetError(null)} />
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <Button
            onClick={apply}
            busy={applying}
            disabled={network === settings.network && endpoint.trim() === settings.customEndpoint}
          >
            Apply &amp; reconnect
          </Button>
        </div>
      </section>

      {/* Behavior */}
      <section className="rounded-2xl border border-line bg-card p-5">
        <h2 className="mb-4 text-[14px] font-semibold">Behavior</h2>
        <Field label="Auto-lock after inactivity">
          <select
            className={inputCls}
            value={String(settings.autoLockMinutes)}
            onChange={(e) => void updateSettings({ autoLockMinutes: Number(e.target.value) })}
          >
            <option value="0">Never</option>
            <option value="1">1 minute</option>
            <option value="15">15 minutes</option>
            <option value="60">1 hour</option>
          </select>
        </Field>
      </section>

      <SecuritySection />

      {/* About */}
      <section className="rounded-2xl border border-line bg-card p-5">
        <h2 className="mb-3 text-[14px] font-semibold">About</h2>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-line bg-card2">
            <RadiantMark size={30} />
          </span>
          <div>
            <div className="text-[13.5px] font-semibold">Lumen Wallet 0.1.0</div>
            <div className="text-[12px] text-muted">
              Non-custodial wallet for the Radiant (RXD) blockchain · HD path m/44′/512′/0′/0/k
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <LinkChip href="https://radiantcore.org" label="radiantcore.org" />
          <LinkChip href="https://github.com/Radiant-Core" label="GitHub" />
          <LinkChip href="https://radiantcore.org/docs/sdk.html" label="SDK docs" />
          <LinkChip href="https://explorer.radiantblockchain.org" label="Explorer" />
        </div>
        <p className="mt-4 text-[11.5px] leading-relaxed text-faint">
          Your recovery phrase is encrypted with your password (PBKDF2 → AES-256-GCM) and
          stored only on this Mac. The wallet talks to ElectrumX servers; no keys ever leave
          the app.
        </p>
      </section>
    </div>
  );
}

function LinkChip({ href, label }: { href: string; label: string }) {
  return (
    <button
      onClick={() => void openExternal(href)}
      className="flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 text-[12.5px] text-muted hover:bg-card2 hover:text-text"
    >
      <ExternalIcon />
      {label}
    </button>
  );
}
// ---- Security ----------------------------------------------------------------

function SecuritySection() {
  const { revealMnemonic, changePassword, erase } = useApp();
  const [modal, setModal] = useState<null | "reveal" | "changepw" | "erase">(null);
  return (
    <section className="rounded-2xl border border-line bg-card p-5">
      <h2 className="mb-4 flex items-center gap-2 text-[14px] font-semibold">
        <ShieldIcon size={16} className="text-accent" />
        Security
      </h2>
      <div className="space-y-2">
        <SecurityRow
          title="Recovery phrase"
          body="Show and copy your 12-word backup (password required)."
          action="Reveal"
          onClick={() => setModal("reveal")}
        />
        <SecurityRow
          title="Change password"
          body={`Re-encrypt the vault with a new password (min ${MIN_PASSWORD_LENGTH} characters).`}
          action="Change"
          onClick={() => setModal("changepw")}
        />
        <SecurityRow
          title="Erase wallet"
          body="Delete the encrypted vault from this Mac. Verifies your password first."
          action="Erase"
          danger
          onClick={() => setModal("erase")}
        />
      </div>

      {modal === "reveal" && <RevealModal onClose={() => setModal(null)} onReveal={revealMnemonic} />}
      {modal === "changepw" && <ChangePwModal onClose={() => setModal(null)} onChange={changePassword} />}
      {modal === "erase" && <EraseModal onClose={() => setModal(null)} onErase={erase} />}
    </section>
  );
}

function SecurityRow({
  title,
  body,
  action,
  danger,
  onClick,
}: {
  title: string;
  body: string;
  action: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-panel px-4 py-3">
      <div>
        <div className="text-[13.5px] font-medium">{title}</div>
        <div className="text-[12px] text-muted">{body}</div>
      </div>
      <Button
        variant={danger ? "danger" : "ghost"}
        className="shrink-0 px-3 py-1.5 text-[12.5px]"
        onClick={onClick}
      >
        {action}
      </Button>
    </div>
  );
}

function RevealModal({
  onClose,
  onReveal,
}: {
  onClose: () => void;
  onReveal: (password: string) => Promise<string>;
}) {
  const [pw, setPw] = useState("");
  const [words, setWords] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      setWords((await onReveal(pw)).split(" "));
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Recovery phrase" onClose={onClose} width={520}>
      {!words ? (
        <div className="space-y-4">
          <p className="text-[13px] text-muted">
            Enter your wallet password to decrypt and display the recovery phrase.
          </p>
          <Field label="Password">
            <input
              type="password"
              className={inputCls}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoFocus
              autoComplete="off"
            />
          </Field>
          {error && <ErrorNote text={error} />}
          <div className="flex justify-end">
            <Button onClick={go} busy={busy} disabled={!pw}>
              <KeyIcon size={15} />
              Reveal
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[12.5px] text-muted">Write these down and store them offline:</p>
            <CopyButton text={words.join(" ")} />
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
          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
function ChangePwModal({
  onClose,
  onChange,
}: {
  onClose: () => void;
  onChange: (oldPw: string, newPw: string) => Promise<void>;
}) {
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      if (newPw !== newPw2) throw new Error("New passwords do not match");
      await onChange(oldPw, newPw);
      setOk(true);
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Change password" onClose={onClose}>
      {ok ? (
        <div className="space-y-4">
          <p className="text-[13.5px] font-medium text-good">Password updated.</p>
          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Current password">
            <input
              type="password"
              className={inputCls}
              value={oldPw}
              onChange={(e) => setOldPw(e.target.value)}
              autoFocus
              autoComplete="off"
            />
          </Field>
          <Field label="New password" hint={`min ${MIN_PASSWORD_LENGTH} characters`}>
            <input
              type="password"
              className={inputCls}
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Confirm new password">
            <input
              type="password"
              className={inputCls}
              value={newPw2}
              onChange={(e) => setNewPw2(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          {error && <ErrorNote text={error} />}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={go}
              busy={busy}
              disabled={!oldPw || newPw.length < MIN_PASSWORD_LENGTH || newPw !== newPw2}
            >
              Save
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function EraseModal({
  onClose,
  onErase,
}: {
  onClose: () => void;
  onErase: (password: string) => Promise<void>;
}) {
  const [pw, setPw] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await onErase(pw);
      // phase switches to "setup" on success
    } catch (e) {
      setError(friendly(e));
      setBusy(false);
    }
  };

  return (
    <Modal title="Erase wallet" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-[13px] leading-relaxed text-bad">
          This permanently deletes the encrypted wallet from this Mac. You can restore it later
          only with your 12-word recovery phrase.
        </p>
        <Field label="Password">
          <input
            type="password"
            className={inputCls}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoFocus
            autoComplete="off"
          />
        </Field>
        <Field label="Type ERASE to confirm">
          <input className={inputCls} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="ERASE" />
        </Field>
        {error && <ErrorNote text={error} />}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={go} busy={busy} disabled={!pw || confirmText !== "ERASE"}>
            Erase wallet
          </Button>
        </div>
      </div>
    </Modal>
  );
}
