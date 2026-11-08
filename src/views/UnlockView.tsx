/** Password gate for an existing wallet. */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useApp, friendly } from "../state/AppContext";
import { Button, ErrorNote, Field, inputCls, RadiantMark, ShieldIcon } from "../components/ui";

export function UnlockView() {
  const { unlock, erase } = useApp();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmErase, setConfirmErase] = useState(false);

  // NIST SP 800-63B §5.1.1.2 — limit failed authentication attempts.
  const [failures, setFailures] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [, forceTick] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!lockedUntil) return;
    timerRef.current = setInterval(() => forceTick((t) => t + 1), 500);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [lockedUntil]);

  const waitMs = Math.max(0, lockedUntil - Date.now());
  const locked = waitMs > 0;
  const waitSeconds = Math.ceil(waitMs / 1000);

  const registerFailure = () => {
    const next = failures + 1;
    setFailures(next);
    // First two attempts are free; afterwards back off 5s, 10s, 20s … (max 5 min).
    if (next >= 3) {
      const delaySeconds = Math.min(300, 5 * 2 ** (next - 3));
      setLockedUntil(Date.now() + delaySeconds * 1000);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (locked) return;
    setBusy(true);
    setError(null);
    try {
      await unlock(password);
      setFailures(0);
    } catch (err) {
      const message = friendly(err);
      if (message.toLowerCase().includes("incorrect password")) {
        registerFailure();
      }
      setError(message);
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
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-line bg-card2 shadow-[0_4px_24px_-4px_rgba(56,189,248,0.45)]">
            <RadiantMark size={46} />
          </div>
          <h1 className="text-lg font-semibold">Lumen RXD Wallet</h1>
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
          {locked && (
            <p className="text-center text-[12px] text-warn">
              Too many failed attempts — try again in {waitSeconds}s.
            </p>
          )}
          <Button type="submit" busy={busy} disabled={!password || locked} className="w-full">
            <ShieldIcon />
            {locked ? `Locked — ${waitSeconds}s` : "Unlock wallet"}
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
      </div>
    </div>
  );
}
