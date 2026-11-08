/**
 * Local persistence via tauri-plugin-store.
 *
 * Files: <app-data>/wallet.json
 * Keys:
 *   vault    -> VaultBlob (encrypted mnemonic; the only sensitive data)
 *   settings -> Settings (network, endpoint, address index, auto-lock)
 */
import { Store } from "@tauri-apps/plugin-store";
import type { NetworkName } from "@radiant-core/sdk";
import type { VaultBlob } from "./crypto";

let storePromise: Promise<Store> | null = null;

export function store(): Promise<Store> {
  if (!storePromise) {
    storePromise = Store.load("wallet.json", { autoSave: true });
  }
  return storePromise;
}

export async function loadKey<T>(key: string): Promise<T | undefined> {
  const s = await store();
  return s.get<T>(key);
}

export async function saveKey(key: string, value: unknown): Promise<void> {
  const s = await store();
  await s.set(key, value);
  await s.save();
}

export async function removeKey(key: string): Promise<void> {
  const s = await store();
  await s.delete(key);
  await s.save();
}

export interface Settings {
  network: Extract<NetworkName, "mainnet" | "testnet">;
  /** Custom ElectrumX wss/ws endpoint; empty = network default. */
  customEndpoint: string;
  /** Highest derived receive index in use (address #0..receiveIndex are the wallet's). */
  receiveIndex: number;
  /** Auto-lock after N minutes of inactivity; 0 = disabled. */
  autoLockMinutes: number;
}

export const DEFAULT_SETTINGS: Settings = {
  network: "mainnet",
  customEndpoint: "",
  receiveIndex: 0,
  autoLockMinutes: 15,
};

export const VAULT_KEY = "vault";
export const SETTINGS_KEY = "settings";

export async function loadVault(): Promise<VaultBlob | null> {
  return (await loadKey<VaultBlob>(VAULT_KEY)) ?? null;
}

export async function loadSettings(): Promise<Settings> {
  const s = await loadKey<Partial<Settings>>(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}
