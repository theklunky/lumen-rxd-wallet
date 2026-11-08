/**
 * Global app state: phases (loading / setup / unlock / ready), settings,
 * the unlocked wallet runtime, and all user actions.
 *
 * The mnemonic lives only in an in-memory ref while the app is unlocked and
 * is never stored in React state.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { HDWallet, type NetworkName } from "@radiant-core/sdk";
import {
  decryptPayload,
  encryptPayload,
  MIN_PASSWORD_LENGTH,
  type VaultBlob,
} from "../lib/crypto";
import {
  loadVault,
  loadSettings,
  saveKey,
  removeKey,
  VAULT_KEY,
  SETTINGS_KEY,
  type Settings,
} from "../lib/store";
import {
  WalletService,
  type ScanResult,
  type TokenHolding,
} from "../lib/walletService";

export type Phase = "loading" | "setup" | "unlock" | "ready";
export type Tab = "overview" | "history" | "tokens" | "settings";

interface AppApi {
  phase: Phase;
  settings: Settings;
  scan: ScanResult | null;
  scanning: boolean;
  online: boolean;
  error: string | null;
  clearError: () => void;
  /** The receive address currently on display (null while locked). */
  currentAddress: { address: string; path: string; index: number } | null;

  createWallet: (mnemonic: string, password: string, coinType: number) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  lock: () => void;
  erase: (password: string) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;

  refresh: () => Promise<void>;
  newAddress: () => Promise<void>;
  send: (to: string, amount: bigint) => Promise<{ txid: string; fee: bigint }>;
  transfer: (token: TokenHolding, to: string) => Promise<{ txid: string }>;
  /** Verify the vault password and return the recovery phrase (Settings → backup). */
  revealMnemonic: (password: string) => Promise<string>;
}

const Ctx = createContext<AppApi | null>(null);

export function useApp(): AppApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside provider");
  return v;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [settings, setSettings] = useState<Settings>({
    network: "mainnet",
    customEndpoint: "",
    receiveIndex: 0,
    autoLockMinutes: 15,
  });
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const serviceRef = useRef<WalletService | null>(null);
  const mnemonicRef = useRef<string | null>(null);
  const coinTypeRef = useRef<number>(512);
  const probeDoneRef = useRef<boolean>(false);
  const settingsRef = useRef<Settings>(settings);
  settingsRef.current = settings;
  const lastActivityRef = useRef<number>(Date.now());

  const clearError = useCallback(() => setError(null), []);

  // ---- boot: figure out whether a wallet exists -------------------------
  useEffect(() => {
    (async () => {
      try {
        const s = await loadSettings();
        setSettings(s);
        const vault = await loadVault();
        setPhase(vault ? "unlock" : "setup");
      } catch (e) {
        setError(friendly(e));
        setPhase("setup");
      }
    })();
  }, []);

  // ---- service lifecycle --------------------------------------------------
  const buildService = useCallback(
    (mnemonic: string, coinType: number, s: Settings): WalletService => {
      const hd = HDWallet.fromMnemonic(mnemonic, {
        network: s.network,
        coinType,
      });
      return new WalletService(hd, s.receiveIndex, s.network, s.customEndpoint || undefined);
    },
    [],
  );

  const doRescan = useCallback(async () => {
    const svc = serviceRef.current;
    if (!svc) return;
    setScanning(true);
    try {
      setScan(await svc.scan());
    } catch (e) {
      setError(friendly(e));
    } finally {
      setScanning(false);
    }
  }, []);

  const teardown = useCallback(() => {
    serviceRef.current?.dispose();
    serviceRef.current = null;
    mnemonicRef.current = null;
    probeDoneRef.current = false;
    setScan(null);
    setOnline(false);
    setScanning(false);
  }, []);

  const startRuntime = useCallback(
    async (mnemonic: string, coinType: number, s: Settings) => {
      teardown();
      mnemonicRef.current = mnemonic;
      coinTypeRef.current = coinType;
      const svc = buildService(mnemonic, coinType, s);
      serviceRef.current = svc;
      svc.onConnection(setOnline);
      setPhase("ready");
      try {
        await svc.connect();
      } catch (e) {
        // Connection issues are retried by the client; surface once.
        setError(friendly(e));
      }
      await doRescan();

      // One-shot per unlock: re-discover funds sitting on receive addresses
      // beyond the persisted receiveIndex (restored / reinstalled wallet).
      if (!probeDoneRef.current) {
        probeDoneRef.current = true;
        try {
          const active = await svc.probeForUsedAddresses(10);
          if (active !== null && active > s.receiveIndex) {
            const next = { ...s, receiveIndex: active };
            setSettings(next);
            await saveKey(SETTINGS_KEY, next);
            svc.expandTo(active);
            await doRescan();
          }
        } catch {
          // Best-effort — the wallet keeps working with the known chain.
        }
      }

      svc.subscribe(() => {
        void doRescan();
      });
    },
    [buildService, doRescan, teardown],
  );
  // ---- actions ------------------------------------------------------------
  const createWallet = useCallback(
    async (mnemonic: string, password: string, coinType: number) => {
      if (password.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      }
      // Fail fast on an invalid phrase before touching storage.
      HDWallet.fromMnemonic(mnemonic, { coinType });
      const blob: VaultBlob = await encryptPayload({ mnemonic, coinType }, password);
      const s = await loadSettings();
      await saveKey(VAULT_KEY, blob);
      await saveKey(SETTINGS_KEY, s);
      await startRuntime(mnemonic, coinType, s);
    },
    [startRuntime],
  );

  const unlock = useCallback(
    async (password: string) => {
      const blob = await loadVault();
      if (!blob) throw new Error("No wallet found");
      const payload = await decryptPayload(blob, password);
      const s = await loadSettings();
      await startRuntime(payload.mnemonic, payload.coinType, s);
    },
    [startRuntime],
  );

  const lock = useCallback(() => {
    teardown();
    setPhase("unlock");
  }, [teardown]);

  const erase = useCallback(
    async (password: string) => {
      const blob = await loadVault();
      if (!blob) throw new Error("No wallet found");
      // Verify the password before erasing anything.
      await decryptPayload(blob, password);
      teardown();
      await removeKey(VAULT_KEY);
      const s: Settings = {
        network: "mainnet",
        customEndpoint: "",
        receiveIndex: 0,
        autoLockMinutes: settingsRef.current.autoLockMinutes,
      };
      await saveKey(SETTINGS_KEY, s);
      setSettings(s);
      setPhase("setup");
    },
    [teardown],
  );

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const next = { ...settingsRef.current, ...patch };
      setSettings(next);
      await saveKey(SETTINGS_KEY, next);
      // Network / endpoint / receiveIndex changes require a re-sync.
      if (
        mnemonicRef.current &&
        (patch.network !== undefined ||
          patch.customEndpoint !== undefined ||
          patch.receiveIndex !== undefined)
      ) {
        await startRuntime(mnemonicRef.current, coinTypeRef.current, next);
      }
    },
    [startRuntime],
  );

  const changePassword = useCallback(
    async (oldPassword: string, newPassword: string) => {
      if (newPassword.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`New password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      }
      const blob = await loadVault();
      if (!blob) throw new Error("No wallet found");
      const payload = await decryptPayload(blob, oldPassword);
      const fresh = await encryptPayload(payload, newPassword);
      await saveKey(VAULT_KEY, fresh);
    },
    [],
  );

  const refresh = useCallback(async () => {
    await doRescan();
  }, [doRescan]);

  const newAddress = useCallback(async () => {
    const svc = serviceRef.current;
    if (!svc) return;
    const next = svc.advanceAddress();
    await saveKey(SETTINGS_KEY, { ...settingsRef.current, receiveIndex: next.index });
    setSettings((s) => ({ ...s, receiveIndex: next.index }));
    await doRescan();
  }, [doRescan]);

  const send = useCallback(
    async (to: string, amount: bigint) => {
      const svc = serviceRef.current;
      if (!svc || !scan) throw new Error("Wallet is locked");
      const res = await svc.sendRxd(scan.utxos, to, amount);
      await doRescan();
      return { txid: res.txid, fee: res.fee };
    },
    [scan, doRescan],
  );

  const transfer = useCallback(
    async (token: TokenHolding, to: string) => {
      const svc = serviceRef.current;
      if (!svc || !scan) throw new Error("Wallet is locked");
      const res = await svc.transferToken(scan.utxos, token, to);
      await doRescan();
      return res;
    },
    [scan, doRescan],
  );

  const revealMnemonic = useCallback(async (password: string) => {
    const blob = await loadVault();
    if (!blob) throw new Error("No wallet found");
    const payload = await decryptPayload(blob, password);
    return payload.mnemonic;
  }, []);
  // ---- auto-lock ------------------------------------------------------------
  useEffect(() => {
    if (phase !== "ready" || settings.autoLockMinutes <= 0) return;
    const mark = () => {
      lastActivityRef.current = Date.now();
    };
    const events: (keyof WindowEventMap)[] = ["mousemove", "mousedown", "keydown", "touchstart"];
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    const iv = setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs > settings.autoLockMinutes * 60_000) lock();
    }, 30_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, mark));
      clearInterval(iv);
    };
  }, [phase, settings.autoLockMinutes, lock]);

  const api = useMemo<AppApi>(
    () => ({
      phase,
      settings,
      scan,
      scanning,
      online,
      error,
      clearError,
      currentAddress: serviceRef.current?.currentAddress ?? null,
      createWallet,
      unlock,
      lock,
      erase,
      updateSettings,
      changePassword,
      refresh,
      newAddress,
      send,
      transfer,
      revealMnemonic,
    }),
    [
      phase,
      settings,
      scan,
      scanning,
      online,
      error,
      clearError,
      createWallet,
      unlock,
      lock,
      erase,
      updateSettings,
      changePassword,
      refresh,
      newAddress,
      send,
      transfer,
      revealMnemonic,
    ],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/** Map SDK / transport errors to short, human-readable messages. */
export function friendly(e: unknown): string {
  if (e instanceof Error) {
    const m = e.message;
    if (m.includes("min relay fee")) return "Transaction rejected: fee below the network minimum.";
    if (m.includes("Not enough money") || m.toLowerCase().includes("insufficient"))
      return "Not enough confirmed RXD to cover amount + fee.";
    if (m.includes("Incorrect password")) return "Incorrect password";
    if (m.includes("WebSocket") || m.includes("fetch failed") || m.includes("connect"))
      return `Network error: ${m}`;
    if (m.length <= 160) return m;
    return m.slice(0, 160) + "…";
  }
  return String(e);
}

/** Mirror of the SDK defaults, for placeholder display. */
export function defaultEndpointFor(network: NetworkName): string {
  if (network === "regtest") return "ws://localhost:50011";
  return "wss://electrumx.radiantcore.org:443";
}
