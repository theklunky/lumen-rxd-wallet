/**
 * WalletService — HD wallet + ElectrumX integration.
 *
 * Responsibilities:
 *  - Derive the receive chain m/44'/<coinType>'/0'/0/0..N
 *  - Full scan: per-address balance + UTXOs + history, merged into a
 *    ScanResult (funding pool, history items, discovered token holdings)
 *  - Live updates via ElectrumX scripthash subscriptions (debounced rescan)
 *  - Send RXD (ref-safe funding across all wallet addresses, change back to
 *    the current receive address, per-input WIF signing via buildTx)
 *  - Glyph token transfer (FT/NFT) via the SDK commit/reveal flow
 *
 * This service is stateless between scans: the caller passes the current
 * ScanResult's UTXO pool back into send/transfer.
 */
import {
  ElectrumClient,
  HDWallet,
  selectRxdFunding,
  buildTx,
  transferToken,
  p2pkhScript,
  isTokenBearing,
  parseFtScript,
  parseNftScript,
  tokenScriptKind,
  scriptHash,
  zeroRefs,
  unpackRef,
  radiantjs,
  estimateFee,
  MIN_RELAY_FEE_RATE,
  type DerivedKey,
  type NetworkName,
  type Utxo,
} from "@radiant-core/sdk";

/** A UTXO tagged with the wallet address it was found under. */
export interface TaggedUtxo extends Utxo {
  address: string;
}

export interface HistoryItem {
  txid: string;
  /** Block height; 0 = unconfirmed (mempool). */
  height: number;
  /** Unix seconds, or 0 when unknown (mempool). */
  time: number;
  /** Which way the funds moved, from the signed net effect. */
  direction: "received" | "sent" | "self";
  /** Signed net effect on the wallet in photons (negative = sent). Includes fee. */
  net: bigint;
  /** Network fee in photons, when all inputs are ours and known. */
  fee?: bigint;
  /** First external address involved, if any. */
  counterparty: string | null;
}

export interface TokenHolding {
  /** Outpoint of the token output. */
  txid: string;
  vout: number;
  /** Output value in photons (for FTs this is the token amount). */
  value: bigint;
  /** Full token output script, hex. */
  script: string;
  kind: "ft" | "nft";
  /** Commit outpoint in "txid:vout" display form. */
  refDisplay: string;
  /** Wallet address that owns this token output. */
  ownerAddress: string;
  /** The mint output itself is confirmed. */
  mintedConfirmed: boolean;
}

export interface PerAddress {
  confirmed: bigint;
  unconfirmed: bigint;
  txCount: number;
}

export interface ScanResult {
  confirmed: bigint;
  unconfirmed: bigint;
  utxos: TaggedUtxo[];
  history: HistoryItem[];
  tokens: TokenHolding[];
  perAddress: Record<string, PerAddress>;
}

const FETCH_CONCURRENCY = 8;
const RESCAN_DEBOUNCE_MS = 2000;
/** BIP44 gap limit — stop discovering after this many consecutive unused addresses. */
const GAP_LIMIT = 20;
/** Hard cap so a pathological chain can never scan forever. */
const HARD_ADDRESS_CAP = 400;
/** Cap how many transactions we describe in detail (mempool spam can be huge). */
const HISTORY_LIMIT = 200;

/** Read the block timestamp (unix seconds) out of an 80-byte header hex string. */
function headerTime(headerHex: string): number | undefined {
  if (!headerHex || headerHex.length < 144) return undefined;
  const offset = 68 * 2; // the time field starts at byte 68
  const slice = headerHex.slice(offset, offset + 8);
  if (!/^[0-9a-fA-F]{8}$/.test(slice)) return undefined;
  const le = slice.match(/../g)!.reverse().join("");
  const seconds = parseInt(le, 16);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

export class WalletService {
  readonly client: ElectrumClient;
  readonly hd: HDWallet;
  readonly network: NetworkName;
  private _external: DerivedKey[];
  /** Combined external (change 0) + internal/change (change 1) keys, 0..receiveIndex. */
  private _addresses: DerivedKey[];
  private connectionListener: ((connected: boolean) => void) | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private rescanTimer: ReturnType<typeof setTimeout> | null = null;
  private parsedCache = new Map<string, unknown>(); // txid -> radiantjs.Transaction | null
  private headerTimeCache = new Map<number, number | undefined>();
  /** Addresses found by the gap-limit walk (both chains); used to classify txs. */
  private _discovered: DerivedKey[] = [];

  constructor(
    hd: HDWallet,
    receiveIndex: number,
    network: NetworkName,
    endpoint?: string,
  ) {
    this.hd = hd;
    this.network = network;
    this.client = new ElectrumClient(endpoint ? { endpoint } : { network });
    // Derive BOTH the external (receive, change=0) and internal (change, change=1)
    // chains: a standard HD wallet puts change outputs on the internal chain, so
    // those funds must be scanned, subscribed to, and spendable too.
    const count = receiveIndex + 1;
    this._external = hd.deriveRange(0, count, 0);
    this._addresses = [...this._external, ...hd.deriveRange(0, count, 1)];
  }

  /** Derived receive chain, index 0..receiveIndex. */
  get addresses(): DerivedKey[] {
    return this._addresses;
  }

  /** The address currently shown for receiving (highest external index). */
  get currentAddress(): DerivedKey {
    return this._external[this._external.length - 1];
  }

  /** Network fee floor (photons/byte). */
  get feeRate(): bigint {
    return MIN_RELAY_FEE_RATE[this.network];
  }

  /**
   * Full wallet scan across the whole receive chain.
   * Token-bearing outputs are discovered from history and checked for
   * liveness via their zero-ref scripthash.
   */
  async scan(): Promise<ScanResult> {
    await this.client.connect();

    // 1) Gap-limit discovery across BOTH chains, driven by history (so spent
    //    but previously used addresses are recognised). This is what lets us
    //    tell "a send from our own inputs" apart from "a receive" — mirroring
    //    the iOS app's scanChain/loadHistory.
    this._discovered = await this.discoverAddresses();
    const ourScripts = new Set(this._discovered.map((k) => p2pkhScript(k.address)));

    // 2) Balances + UTXOs + per-address activity over the displayed/spendable set.
    const per = await Promise.allSettled(
      this._addresses.map(async (a) => {
        const [bal, utxos, history] = await Promise.all([
          this.client.getBalance(a.address),
          this.client.listUnspent(a.address),
          this.client.getHistory(a.address),
        ]);
        return { a, bal, utxos, history };
      }),
    );

    let confirmed = 0n;
    let unconfirmed = 0n;
    const utxos: TaggedUtxo[] = [];
    const perAddress: Record<string, PerAddress> = {};
    const heights = new Map<string, number>(); // txid -> best (highest) height

    for (const r of per) {
      if (r.status !== "fulfilled") continue;
      const { a, bal, utxos: us, history } = r.value;
      confirmed += bal.confirmed;
      unconfirmed += bal.unconfirmed;
      for (const u of us) utxos.push({ ...u, address: a.address });
      const hs = history as { height: number; tx_hash: string }[];
      perAddress[a.address] = {
        confirmed: bal.confirmed,
        unconfirmed: bal.unconfirmed,
        txCount: hs.length,
      };
      for (const h of hs) {
        const prev = heights.get(h.tx_hash);
        if (prev === undefined || h.height > prev) heights.set(h.tx_hash, h.height);
      }
    }

    // 3) History from raw hex + prevout resolution (correct signed net, fee
    //    included) and token discovery from the same parsed outputs.
    const tokenCandidates = new Map<string, TokenHolding>();
    const historyItems = await this.buildHistory(heights, ourScripts, tokenCandidates);
    const tokens = await this.filterLiveTokens(tokenCandidates);

    historyItems.sort((x, y) => y.time - x.time || y.height - x.height);
    return { confirmed, unconfirmed, utxos, history: historyItems, tokens, perAddress };
  }

  /**
   * Walk one BIP44 chain in batches of GAP_LIMIT, using address *history* (not
   * balance) to decide "used", until GAP_LIMIT consecutive unused addresses are
   * seen. Includes spent-but-used addresses so their inputs are recognised.
   */
  private async discoverAddresses(): Promise<DerivedKey[]> {
    const out: DerivedKey[] = [];
    for (const change of [0, 1]) {
      let start = 0;
      let lastUsed = -1;
      while (start < HARD_ADDRESS_CAP) {
        const batch = this.hd.deriveRange(start, GAP_LIMIT, change);
        const histories = await Promise.allSettled(
          batch.map((k) => this.client.getHistory(k.address)),
        );
        batch.forEach((key, i) => {
          const r = histories[i];
          const used = r.status === "fulfilled" && (r.value as unknown[]).length > 0;
          if (used) {
            out.push(key);
            if (key.index > lastUsed) lastUsed = key.index;
          }
        });
        start += GAP_LIMIT;
        if (lastUsed < 0) break;
        if (start - lastUsed > GAP_LIMIT) break;
      }
    }
    const seen = new Set(out.map((k) => k.address));
    for (const k of this._addresses) {
      if (!seen.has(k.address)) {
        out.push(k);
        seen.add(k.address);
      }
    }
    return out;
  }

  /** Fetch + parse a raw transaction hex, cached. */
  private async parseTx(txid: string): Promise<any | null> {
    if (this.parsedCache.has(txid)) return this.parsedCache.get(txid);
    try {
      const hex = await this.client.getTransaction(txid);
      if (typeof hex !== "string") {
        this.parsedCache.set(txid, null);
        return null;
      }
      const parsed = new radiantjs.Transaction(hex);
      this.parsedCache.set(txid, parsed);
      return parsed;
    } catch {
      this.parsedCache.set(txid, null);
      return null;
    }
  }

  /** Block timestamp for a height (0 = mempool → unknown). */
  private async resolveTime(height: number): Promise<number | undefined> {
    if (height <= 0) return undefined;
    if (this.headerTimeCache.has(height)) return this.headerTimeCache.get(height);
    let t: number | undefined;
    try {
      const headerHex = await this.client.request<string>("blockchain.block.header", height);
      t = headerTime(headerHex);
    } catch {
      t = undefined;
    }
    this.headerTimeCache.set(height, t);
    return t;
  }

  /** Decode a P2PKH output script to an address, or null for non-standard scripts. */
  private scriptToAddress(hex: string): string | null {
    try {
      return radiantjs.Address.fromScript(new radiantjs.Script(hex), this.network).toString();
    } catch {
      return null;
    }
  }

  /**
   * Build history via raw tx hex + prevout resolution (as the iOS app does):
   * received = value of our outputs, spent = value of our inputs (each input's
   * prevout value is read from the previous transaction). net = received − spent,
   * direction is its sign, and the amount includes the fee because net does.
   */
  private async buildHistory(
    heights: Map<string, number>,
    ourScripts: Set<string>,
    tokenCandidates: Map<string, TokenHolding>,
  ): Promise<HistoryItem[]> {
    const items: HistoryItem[] = [];
    const queue = [...heights.entries()]
      .sort((a, b) => (a[1] === 0 ? -1 : b[1] === 0 ? 1 : b[1] - a[1])) // mempool first, then newest
      .slice(0, HISTORY_LIMIT);
    const workers = Array.from(
      { length: Math.min(FETCH_CONCURRENCY, queue.length) },
      async () => {
        while (queue.length > 0) {
          const [txid, height] = queue.shift()!;
          try {
            const tx = await this.parseTx(txid);
            if (!tx) continue;

            let received = 0n;
            let counterparty: string | null = null;
            for (const o of tx.outputs) {
              const hex = o.script?.toHex?.() ?? "";
              if (hex && ourScripts.has(hex)) received += BigInt(o.satoshis ?? 0);
              else if (hex && !counterparty) counterparty = this.scriptToAddress(hex);
            }

            let spent = 0n;
            let totalIn = 0n;
            let allInputsOurs = true;
            const anyInput = tx.inputs.length > 0;
            for (const input of tx.inputs) {
              if (input.isNull?.()) {
                allInputsOurs = false;
                continue;
              }
              const prevTxid =
                typeof input.prevTxId === "string"
                  ? input.prevTxId
                  : Array.from(input.prevTxId as Uint8Array)
                      .map((b) => b.toString(16).padStart(2, "0"))
                      .join("");
              const prev = await this.parseTx(prevTxid);
              const po = prev?.outputs?.[input.outputIndex];
              if (!po) {
                allInputsOurs = false;
                continue;
              }
              const hex = po.script?.toHex?.() ?? "";
              const v = BigInt(po.satoshis ?? 0);
              totalIn += v;
              if (hex && ourScripts.has(hex)) {
                spent += v;
              } else {
                allInputsOurs = false;
                // For a receive the sender is an input's prevout — use it as the
                // counterparty when no external output already set one.
                if (!counterparty && hex) counterparty = this.scriptToAddress(hex);
              }
            }

            if (received === 0n && spent === 0n) continue;
            const net = received - spent;
            const direction: HistoryItem["direction"] =
              net > 0n ? "received" : net < 0n ? "sent" : "self";

            let fee: bigint | undefined;
            if (anyInput && allInputsOurs && direction === "sent") {
              const totalOut = tx.outputs.reduce(
                (s: bigint, o: any) => s + BigInt(o.satoshis ?? 0),
                0n,
              );
              const computed = totalIn - totalOut;
              if (computed > 0n) fee = computed;
            }

            const time = (await this.resolveTime(height)) ?? 0;
            items.push({ txid, height, time, direction, net, fee, counterparty });
            this.extractTokensFromParsed(tx, txid, height, tokenCandidates);
          } catch {
            // Never fail the whole scan for one tx.
          }
        }
      },
    );
    await Promise.all(workers);
    return items;
  }

  get connected(): boolean {
    return this.client.connected;
  }

  onConnection(cb: (connected: boolean) => void): void {
    this.connectionListener = cb;
  }

  async connect(): Promise<void> {
    await this.client.connect();
    if (!this.pollTimer) {
      const tick = () => this.connectionListener?.(this.client.connected);
      tick();
      this.pollTimer = setInterval(tick, 3000);
    }
  }

  /**
   * Derive one more receive address and return the new current address.
   * Callers persist the new receiveIndex and rescan.
   */
  advanceAddress(): DerivedKey {
    const count = this._external.length + 1;
    this._external = this.hd.deriveRange(0, count, 0);
    this._addresses = [...this._external, ...this.hd.deriveRange(0, count, 1)];
    return this.currentAddress;
  }

  /** Re-derive both chains out to `newIndex` (inclusive). */
  expandTo(newIndex: number): void {
    const count = newIndex + 1;
    this._external = this.hd.deriveRange(0, count, 0);
    this._addresses = [...this._external, ...this.hd.deriveRange(0, count, 1)];
  }

  /**
   * Scan the receive chain beyond the current end for existing activity,
   * bridging gaps up to `gapLimit` consecutive unused addresses (the standard
   * BIP-44 gap-limit rule). Returns the highest active index found, or null.
   * Bounded by `maxAddresses` total so the one-shot unlock scan stays snappy.
   *
   * A restored/reinstalled wallet resets its receiveIndex, so funds sent to
   * higher receive addresses in a previous install would otherwise be
   * invisible; this re-discovers them (and, unlike a fixed N-index probe,
   * finds addresses sitting in unused gaps).
   */
  async probeForUsedAddresses(
    gapLimit = 20,
    maxAddresses = 200,
  ): Promise<number | null> {
    await this.client.connect();
    const initialStart = this._external.length; // = receiveIndex + 1
    let start = initialStart;
    let highest: number | null = null;
    while (start - initialStart < maxAddresses) {
      const count = Math.min(gapLimit, maxAddresses - (start - initialStart));
      // Probe BOTH the external and internal/change chains for this window.
      const candidates = [
        ...this.hd.deriveRange(start, count, 0),
        ...this.hd.deriveRange(start, count, 1),
      ];
      const found = await Promise.allSettled(
        candidates.map(async (a) => {
          const [bal, history] = await Promise.all([
            this.client.getBalance(a.address),
            this.client.getHistory(a.address),
          ]);
          const active =
            bal.confirmed > 0n || bal.unconfirmed > 0n || history.length > 0;
          return active ? a.index : null;
        }),
      );
      let activeInWindow: number | null = null;
      for (const r of found) {
        if (r.status === "fulfilled" && r.value !== null) {
          if (activeInWindow === null || r.value > activeInWindow) {
            activeInWindow = r.value;
          }
        }
      }
      if (activeInWindow === null) break; // full empty window = gap limit reached
      if (highest === null || activeInWindow > highest) highest = activeInWindow;
      start = activeInWindow + 1; // continue just past the newest active address
    }
    return highest;
  }

  /** Raw approximate fee for a 1-input/2-output P2PKH tx at the network floor. */
  estimateStandardFee(inputs = 1): bigint {
    return estimateFee(inputs, 2, this.feeRate);
  }

  /**
   * Discover token outputs from a parsed raw transaction: FT/NFT covenant
   * scripts whose owner P2PKH is one of our discovered addresses.
   */
  private extractTokensFromParsed(
    tx: any,
    txid: string,
    height: number,
    candidates: Map<string, TokenHolding>,
  ): void {
    (tx.outputs ?? []).forEach((o: any, i: number) => {
      const hex = o.script?.toHex?.() ?? "";
      if (!hex || !isTokenBearing(hex)) return;
      const kind = tokenScriptKind(hex);
      if (!kind) return;
      const parsed = kind === "ft" ? parseFtScript(hex) : parseNftScript(hex);
      const ownerHash = parsed?.addressHash;
      if (!ownerHash) return;
      const ownerP2pkh = `76a914${ownerHash}88ac`;
      const ownerKey = this._discovered.find((k) => p2pkhScript(k.address) === ownerP2pkh);
      if (!ownerKey) return;
      const ref = parsed.ref ?? "";
      let refDisplay = `${txid}:${i}`;
      if (ref) {
        const { txid: rtx, vout: rvout } = unpackRef(ref);
        refDisplay = `${rtx}:${rvout}`;
      }
      candidates.set(`${txid}:${i}`, {
        txid,
        vout: i,
        value: BigInt(o.satoshis ?? 0),
        script: hex,
        kind,
        refDisplay,
        ownerAddress: ownerKey.address,
        mintedConfirmed: height > 0,
      });
    });
  }


  /**
   * Keep only tokens still unspent. The indexer keys token UTXOs under
   * scriptHash(zeroRefs(script)), so a per-token listUnspent check is exact.
   */
  private async filterLiveTokens(
    candidates: Map<string, TokenHolding>,
  ): Promise<TokenHolding[]> {
    const out: TokenHolding[] = [];
    const seenScripts = new Set<string>();
    for (const t of candidates.values()) {
      if (seenScripts.has(t.script)) continue;
      seenScripts.add(t.script);
      try {
        const sh = scriptHash(zeroRefs(t.script));
        const unspent = await this.client.listUnspent(sh);
        if (unspent.length > 0) out.push(t);
      } catch {
        // Some server versions may not index covenant scripthashes; skip.
      }
    }
    return out;
  }

  /**
   * Subscribe to every receive address; on any change, debounce and invoke
   * the rescan callback.
   */
  subscribe(onChange: () => void): void {
    for (const a of this._addresses) {
      this.client
        .subscribe(a.address, () => {
          if (this.rescanTimer) clearTimeout(this.rescanTimer);
          this.rescanTimer = setTimeout(() => {
            this.rescanTimer = null;
            onChange();
          }, RESCAN_DEBOUNCE_MS);
        })
        .catch(() => {
          /* subscription failures are non-fatal; the client auto-reconnects */
        });
    }
  }

  /**
   * Build + sign + broadcast an RXD payment.
   *
   * Funding is gathered ref-safely across ALL wallet addresses (token-bearing
   * UTXOs are excluded by selectRxdFunding and can never be signed away).
   * Change returns to the current receive address.
   */
  async sendRxd(
    utxos: TaggedUtxo[],
    to: string,
    amount: bigint,
  ): Promise<{ txid: string; fee: bigint; hex: string }> {
    if (amount <= 0n) throw new Error("Amount must be greater than zero");
    const feeRate = this.feeRate;
    const selection = selectRxdFunding(utxos, amount, feeRate, {
      baseOutputCount: 1,
      withChange: true,
    });

    const wifByAddress = new Map(this._addresses.map((a) => [a.address, a.wif]));
    const wifs = selection.inputs.map((u) => {
      const w = wifByAddress.get((u as TaggedUtxo).address);
      if (!w) throw new Error("Missing signing key for a selected input");
      return w;
    });

    const built = buildTx({
      address: this.currentAddress.address, // change destination
      wif: wifs.length === 1 ? wifs[0] : wifs,
      inputs: selection.inputs.map((u) => ({
        txid: u.txid,
        vout: u.vout,
        value: u.value,
        script: u.script || undefined,
      })),
      outputs: [{ script: p2pkhScript(to, this.network), value: amount }],
      addChange: true,
      feeRate,
      network: this.network,
    });

    const fee = selection.total - amount - selection.change;
    const broadcastTxid = await this.client.broadcastTx(built.hex);
    return { txid: broadcastTxid || built.txid, fee, hex: built.hex };
  }

  /**
   * Transfer a held FT/NFT to another address. Funding for the fee comes from
   * token-free UTXOs only; the token value is conserved by the covenant.
   */
  async transferToken(
    utxos: TaggedUtxo[],
    token: TokenHolding,
    to: string,
  ): Promise<{ txid: string }> {
    const funding = utxos.filter((u) => !isTokenBearing(u.script) && !u.refs?.length);
    const result = await transferToken({
      client: this.client,
      address: this.currentAddress.address,
      wif: this.currentAddress.wif,
      tokenUtxo: {
        txid: token.txid,
        vout: token.vout,
        value: token.value,
        script: token.script,
        refs: [{ ref: token.refDisplay, type: token.kind === "ft" ? "normal" : "single" }],
      },
      toAddress: to,
      fundingUtxos: funding,
      network: this.network,
    });
    return { txid: result.txid };
  }

  dispose(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    if (this.rescanTimer) clearTimeout(this.rescanTimer);
    this.rescanTimer = null;
    this.parsedCache.clear();
    this.headerTimeCache.clear();
    this.client.close();
  }
}
