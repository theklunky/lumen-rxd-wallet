#!/usr/bin/env node
/**
 * Transaction inspector — prints every input/output (value + address) for txs,
 * so we can see exactly why the wallet classifies them as receive/send/internal.
 * Read-only; needs no keys (uses public chain data).
 *
 *   node scripts/inspect-tx.mjs --txid <txid> [--wallet <addr> ...]
 *   node scripts/inspect-tx.mjs --addr <addr> [--wallet <addr> ...] [--limit 8]
 *
 * --addr    also adds the address to the wallet set AND inspects its history.
 * --wallet  only adds the address to the wallet set (for [WALLET] tagging).
 */
import { ElectrumClient } from "@radiant-core/sdk";

const args = process.argv.slice(2);
const many = (n) => {
  const o = [];
  for (let i = 0; i < args.length; i++) if (args[i] === n && args[i + 1]) o.push(args[i + 1]);
  return o;
};
const one = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};

const txids = many("--txid");
const addrs = many("--addr");
const limit = parseInt(one("--limit") || "8", 10);
const network = one("--network") || "mainnet";
const wallet = new Set([...many("--wallet"), ...addrs]);

const rxd = (p) => (Number(p) / 1e8).toLocaleString(undefined, { maximumFractionDigits: 8 });
const sats = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 1e8) : 0);
const tag = (list) =>
  !list || !list.length ? "(none)" : list.map((a) => (wallet.has(a) ? `${a} [WALLET]` : a)).join(", ");

async function inspect(client, txid) {
  const tx = await client.getTransaction(txid, true);
  if (!tx) return console.log(`\n=== ${txid}: not available ===`);
  const h = tx.block?.height ?? tx.height;
  console.log(`\n=== ${txid}  height ${h ?? "mempool"} ===`);
  let tin = 0n;
  let tout = 0n;
  console.log("INPUTS:");
  (tx.vin ?? []).forEach((i, n) => {
    const v = sats(i.prevout?.value);
    tin += BigInt(v);
    console.log(`  in #${n}  ${rxd(v)} RXD  ${tag(i.prevout?.scriptPubKey?.addresses)}`);
  });
  console.log("OUTPUTS:");
  (tx.vout ?? []).forEach((o, n) => {
    const v = sats(o.value);
    tout += BigInt(v);
    console.log(`  out#${n}  ${rxd(v)} RXD  ${tag(o.scriptPubKey?.addresses)}`);
  });
  console.log(`  totals: in ${rxd(tin)}  out ${rxd(tout)}  fee ${rxd(tin - tout)}`);
  // Mirror the app's output-only classification to preview what it will show.
  let toW = 0n;
  let toE = 0n;
  let cp = null;
  (tx.vout ?? []).forEach((o) => {
    const v = BigInt(sats(o.value));
    const a = o.scriptPubKey?.addresses ?? [];
    if (a.some((x) => wallet.has(x))) toW += v;
    else {
      toE += v;
      if (!cp) cp = a[0] ?? null;
    }
  });
  console.log(
    `  => app shows: ${toE > 0n ? `SENT ${rxd(toE)}` : `RECEIVED/INTERNAL ${rxd(toW)}`}${cp ? `  (to ${cp})` : ""}`,
  );
}

async function main() {
  const client = new ElectrumClient({ network });
  await client.connect();
  for (const t of txids) await inspect(client, t);
  for (const addr of addrs) {
    const hist = await client.getHistory(addr);
    console.log(`\n##### ${addr}: ${hist.length} tx(s) — inspecting newest ${Math.min(limit, hist.length)} #####`);
    for (const h of hist.slice(-limit)) await inspect(client, h.tx_hash);
  }
  await client.close();
}
main().catch((e) => {
  console.error("Error:", (e && e.message) || e);
  process.exit(1);
});