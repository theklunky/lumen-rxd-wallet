/** Open a block-explorer URL in the default browser. */
import { openUrl } from "@tauri-apps/plugin-opener";
import type { NetworkName } from "@radiant-core/sdk";

const EXPLORERS: Partial<Record<NetworkName, string>> = {
  mainnet: "https://rxdexplorer.com",
  testnet: "https://testnet.radiantexplorer.com",
};

function base(network: NetworkName): string {
  return EXPLORERS[network] ?? EXPLORERS.mainnet!;
}

export function explorerTxUrl(network: NetworkName, txid: string): string {
  return `${base(network)}/tx/${txid}`;
}

export function explorerAddressUrl(network: NetworkName, address: string): string {
  return `${base(network)}/address/${address}`;
}

export async function openExternal(url: string): Promise<void> {
  try {
    await openUrl(url);
  } catch {
    window.open(url, "_blank");
  }
}
