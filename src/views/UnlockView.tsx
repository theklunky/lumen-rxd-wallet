/** Password gate for an existing wallet. */
import { useState, type FormEvent } from "react";
import { useApp, friendly } from "../state/AppContext";
import { Button, ErrorNote, Field, inputCls, ShieldIcon, SunIcon } from "../components/ui";
import { MIN_PASSWORD_LENGTH } from "../lib/crypto";

export function UnlockView() {
  const { unlock, erase } = useApp();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmErase, setConfirmErase] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await unlock(password);
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy(false);
    }
  };

  const doErase = async () => {
    setBusy(true);
    setError(null);
    try {
      await erase(password);
    } catch (err) {
      setError(friendly(err));
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent2 text-[#1a1205] shadow-[0_4px_24px_-4px_rgba(249,115,22,0.5)]">
            <SunIcon size={30} />
          </div>
          <h1 className="text-lg font-semibold">Lumen Wallet</h1>
          <p className="text-[13px] text-muted">Enter your password to unlock</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Password">
            <input
              type="password"
              className={inputCls}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              autoFocus
              autoComplete="off"
            />
          </Field>
          {error && <ErrorNote text={error} />}
          <Button type="submit" busy={busy} disabled={!password} className="w-full">
            <ShieldIcon />
            Unlock wallet
          </Button>
        </form>

        <div className="mt-8 border-t border-line pt-4 text-center">
          {!confirmErase ? (
            <button
              className="text-[12.5px] text-faint hover:text-bad"
              onClick={() => setConfirmErase(true)}
            >
              Erase this wallet &amp; start over…
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-[12.5px] text-bad">
                This deletes the encrypted wallet from this Mac. Without your
                12-word recovery phrase the funds are unrecoverable.
              </p>
              <div className="flex justify-center gap-2">
                <Button variant="danger" onClick={doErase} busy={busy} className="px-3 py-1.5 text-[12.5px]">
                  Yes, erase (verifies password above)
                </Button>
                <Button variant="ghost" onClick={() => setConfirmErase(false)} className="px-3 py-1.5 text-[12.5px]">
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
        <p className="mt-4 text-center text-[11px] text-faint">
          Minimum password length: {MIN_PASSWORD_LENGTH} characters
        </p>
      </div>
    </div>
  );
}
