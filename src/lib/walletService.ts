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
  /** Unix seconds (block time or mempool time). */
  time: number;
  /** Photons received by the wallet in this tx (change included). */
  received: bigint;
  /** Photons spent from the wallet in this tx (inputs). */
  sent: bigint;
  /** Network fee, photons. */
  fee: bigint;
  /** First non-wallet address involved, if any. */
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

/** Verbose ElectrumX transaction shape (standard block-explorer format). */
interface RawTx {
  txid?: string;
  hash?: string;
  time?: number;
  fee?: number;
  block?: { height: number; timestamp?: number };
  vin?: {
    prevout?: {
      value?: number;
      scriptPubKey?: { hex?: string; addresses?: string[] };
    };
  }[];
  vout?: {
    value?: number;
    scriptPubKey?: { hex?: string; addresses?: string[] };
  }[];
}

export class WalletService {
  readonly client: ElectrumClient;
  readonly hd: HDWallet;
  readonly network: NetworkName;
  private _addresses: DerivedKey[];
  private connectionListener: ((connected: boolean) => void) | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private rescanTimer: ReturnType<typeof setTimeout> | null = null;
  private txCache = new Map<string, RawTx>();

  constructor(
    hd: HDWallet,
    receiveIndex: number,
    network: NetworkName,
    endpoint?: string,
  ) {
    this.hd = hd;
    this.network = network;
    this.client = new ElectrumClient(endpoint ? { endpoint } : { network });
    this._addresses = hd.deriveRange(0, receiveIndex + 1);
  }

  /** Derived receive chain, index 0..receiveIndex. */
  get addresses(): DerivedKey[] {
    return this._addresses;
  }

  /** The address currently shown for receiving (highest derived index). */
  get currentAddress(): DerivedKey {
    return this._addresses[this._addresses.length - 1];
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
    const txIds = new Map<string, number>(); // txid -> min height seen

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
        txIds.set(h.tx_hash, Math.min(txIds.get(h.tx_hash) ?? h.height, h.height));
      }
    }

    const historyItems: HistoryItem[] = [];
    const tokenCandidates = new Map<string, TokenHolding>();
    await this.fetchTxDetails([...txIds.entries()], historyItems, tokenCandidates);
    const tokens = await this.filterLiveTokens(tokenCandidates);

    historyItems.sort((x, y) => y.time - x.time || y.height - x.height);

    return { confirmed, unconfirmed, utxos, history: historyItems, tokens, perAddress };
  }

  private async fetchTxDetails(
    entries: [string, number][],
    items: HistoryItem[],
    tokenCandidates: Map<string, TokenHolding>,
  ): Promise<void> {
    const walletSet = new Set(this._addresses.map((a) => a.address));
    const walletP2pkh = this._addresses.map((a) => p2pkhScript(a.address));
    const queue = [...entries];
    const workers = Array.from(
      { length: Math.min(FETCH_CONCURRENCY, queue.length) },
      async () => {
        while (queue.length > 0) {
          const [txid, height] = queue.shift()!;
          try {
            let tx = this.txCache.get(txid);
            if (!tx) {
              tx = (await this.client.getTransaction(txid, true)) as RawTx;
              if (tx) this.txCache.set(txid, tx);
            }
            const item = this.analyzeTx(tx, txid, height, walletSet);
            if (item) items.push(item);
            this.extractTokens(tx, tokenCandidates, walletP2pkh);
          } catch {
            // A single unreadable tx must not fail the whole scan.
          }
        }
      },
    );
    await Promise.all(workers);
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
    this._addresses = this.hd.deriveRange(0, this._addresses.length + 1);
    return this.currentAddress;
  }

  /** Raw approximate fee for a 1-input/2-output P2PKH tx at the network floor. */
  estimateStandardFee(inputs = 1): bigint {
    return estimateFee(inputs, 2, this.feeRate);
  }
  /** Compute the wallet delta for one verbose transaction. */
  private analyzeTx(
    tx: RawTx,
    txid: string,
    height: number,
    wallet: Set<string>,
  ): HistoryItem | null {
    let received = 0n;
    let sent = 0n;
    let totalIn = 0n;
    let totalOut = 0n;
    let counterparty: string | null = null;

    for (const i of tx.vin ?? []) {
      const v = BigInt(i.prevout?.value ?? 0);
      totalIn += v;
      const addrs = i.prevout?.scriptPubKey?.addresses ?? [];
      if (addrs.some((a) => wallet.has(a))) {
        sent += v;
        if (!counterparty) counterparty = addrs.find((a) => !wallet.has(a)) ?? null;
      }
    }
    for (const o of tx.vout ?? []) {
      const v = BigInt(o.value ?? 0);
      totalOut += v;
      const addrs = o.scriptPubKey?.addresses ?? [];
      if (addrs.some((a) => wallet.has(a))) {
        received += v;
        if (!counterparty) counterparty = addrs.find((a) => !wallet.has(a)) ?? null;
      }
    }

    if (received === 0n && sent === 0n) return null;
    const fee =
      typeof tx.fee === "number"
        ? BigInt(Math.round(tx.fee))
        : totalIn > totalOut
          ? totalIn - totalOut
          : 0n;
    const time = tx.block?.timestamp ?? tx.time ?? 0;
    return { txid, height, time, received, sent, fee, counterparty };
  }

  /**
   * Discover token outputs minted/transferred to this wallet by scanning the
   * verbose history outputs for FT/NFT covenant scripts whose owner P2PKH is
   * one of our addresses.
   */
  private extractTokens(
    tx: RawTx,
    candidates: Map<string, TokenHolding>,
    walletP2pkh: string[],
  ): void {
    const txid = tx.txid ?? tx.hash ?? "";
    const height = tx.block?.height ?? 0;
    (tx.vout ?? []).forEach((o, i) => {
      const hex = o.scriptPubKey?.hex ?? "";
      if (!hex || !isTokenBearing(hex)) return;
      const kind = tokenScriptKind(hex);
      if (!kind) return;
      const parsed = kind === "ft" ? parseFtScript(hex) : parseNftScript(hex);
      const ownerHash = parsed?.addressHash;
      if (!ownerHash) return;
      const ownerP2pkh = `76a914${ownerHash}88ac`;
      const idx = walletP2pkh.findIndex((s) => s === ownerP2pkh);
      if (idx < 0) return;
      const ref = parsed.ref ?? "";
      let refDisplay = `${txid}:${i}`;
      if (ref) {
        const { txid: rtx, vout: rvout } = unpackRef(ref);
        refDisplay = `${rtx}:${rvout}`;
      }
      candidates.set(`${txid}:${i}`, {
        txid,
        vout: i,
        value: BigInt(o.value ?? 0),
        script: hex,
        kind,
        refDisplay,
        ownerAddress: this._addresses[idx].address,
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
    this.txCache.clear();
    this.client.close();
  }
}
