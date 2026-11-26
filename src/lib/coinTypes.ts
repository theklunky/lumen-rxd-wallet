/**
 * Coin-type helpers for restoring seeds that may have been created by wallets
 * using different BIP-44 coin types (Radiant 512, BTC-style 0, and the legacy 1
 * used by the original electron wallet).
 */
import {
  ElectrumClient,
  HDWallet,
  RADIANT_COIN_TYPE,
  type NetworkName,
} from "@radiant-core/sdk";

/** Coin types we can restore, most-likely first (used for tie-breaking). */
export const CANDIDATE_COIN_TYPES = [RADIANT_COIN_TYPE, 1, 0] as const;

export interface CoinTypeDetection {
  /** Best coin type; falls back to 512 when nothing is found. */
  coinType: number;
  /** True when on-chain activity was found for at least one coin type. */
  found: boolean;
  /** Number of used addresses found per coin type. */
  scores: Record<number, number>;
}

const SCAN_DEPTH = 20; // addresses per chain, per coin type

/** Count how many addresses (across both chains) have any history. */
async function scoreChain(client: ElectrumClient, hd: HDWallet): Promise<number> {
  let used = 0;
  for (const change of [0, 1]) {
    const keys = hd.deriveRange(0, SCAN_DEPTH, change);
    const histories = await Promise.allSettled(
      keys.map((k) => client.getHistory(k.address)),
    );
    for (const r of histories) {
      if (r.status === "fulfilled" && (r.value as unknown[]).length > 0) used++;
    }
  }
  return used;
}

/**
 * Try each candidate coin type and pick the one with the most on-chain
 * activity, so a seed's real derivation is found regardless of which wallet
 * created it. Falls back to Radiant 512 when nothing is found.
 */
export async function detectCoinType(
  mnemonic: string,
  network: NetworkName = "mainnet",
  endpoint?: string,
): Promise<CoinTypeDetection> {
  const client = new ElectrumClient(endpoint ? { endpoint } : { network });
  await client.connect();
  try {
    const scores: Record<number, number> = {};
    let best: number = RADIANT_COIN_TYPE;
    let bestScore = -1;
    for (const ct of CANDIDATE_COIN_TYPES) {
      const hd = HDWallet.fromMnemonic(mnemonic, { network, coinType: ct });
      const score = await scoreChain(client, hd);
      scores[ct] = score;
      if (score > bestScore) {
        bestScore = score;
        best = ct;
      }
    }
    return { coinType: best, found: bestScore > 0, scores };
  } finally {
    await client.close();
  }
}