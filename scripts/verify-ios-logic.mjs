#!/usr/bin/env node
/**
 * Prototype of the iOS app's classification (history.ts): parse the RAW tx hex
 * and resolve each input's prevout by fetching the previous transaction, so the
 * signed net (received − spent, fee included) is correct without depending on
 * the server's verbose JSON or signed history values.
 *
 *   node scripts/verify-ios-logic.mjs --txid <id> [--txid <id>] --wallet <addr> ...
 */
import { ElectrumClient, radiantjs, p2pkhScript } from "@radiant-core/sdk";

const args = process.argv.slice(2);
const many = (n) => {
  const o = [];
  for (let i = 0; i < args.length; i++) if (args[i] === n && args[i + 1]) o.push(args[i + 1]);
  return o;
};
const txids = many("--txid");
const addrs = many("--wallet");
const rxd = (p) => (Number(p) / 1e8).toLocaleString(undefined, { maximumFractionDigits: 8 });

const ourScripts = new Set();
for (const a of addrs) {
  try {
    ourScripts.add(p2pkhScript(a));
  } catch {
    /* skip */
  }
}
console.log(`wallet scripts: ${ourScripts.size}`);

const cache = new Map();
async function getTx(client, id) {
  if (cache.has(id)) return cache.get(id);
  try {
    const hex = await client.getTransaction(id);
    if (typeof hex !== "string") {
      cache.set(id, null);
      return null;
    }
    const tx = new radiantjs.Transaction(hex);
    cache.set(id, tx);
    return tx;
  } catch {
    cache.set(id, null);
    return null;
  }
}

async function compute(client, txid) {
  const tx = await getTx(client, txid);
  if (!tx) {
    console.log(`\n${txid}: unavailable`);
    return;
  }
  let received = 0n;
  for (const o of tx.outputs) if (ourScripts.has(o.script.toHex())) received += BigInt(o.satoshis ?? 0);

  let spent = 0n;
  let totalIn = 0n;
  let allOurs = true;
  let anyInput = false;
  for (const input of tx.inputs) {
    if (input.isNull?.()) {
      allOurs = false;
      continue;
    }
    anyInput = true;
    const prevTxid =
      typeof input.prevTxId === "string"
        ? input.prevTxId
        : Array.from(input.prevTxId).map((b) => b.toString(16).padStart(2, "0")).join("");
    const prev = await getTx(client, prevTxid);
    const po = prev?.outputs?.[input.outputIndex];
    let addr = "unresolved";
    let isOurs = false;
    if (po && po.script) {
      const hex = po.script.toHex();
      isOurs = ourScripts.has(hex);
      try {
        addr = radiantjs.Address.fromScript(new radiantjs.Script(hex), "mainnet").toString();
      } catch {
        addr = hex;
      }
    }
    console.log(
      `   in -> prev ${String(prevTxid).slice(0, 10)}… vout ${input.outputIndex}: ${po ? rxd(BigInt(po.satoshis ?? 0)) + " RXD" : "NO PREV"} ${addr}${isOurs ? " [OURS]" : ""}`,
    );
    if (!po) {
      allOurs = false;
      continue;
    }
    const v = BigInt(po.satoshis ?? 0);
    totalIn += v;
    if (isOurs) spent += v;
    else allOurs = false;
  }

  const net = received - spent;
  const dir = net > 0n ? "RECEIVED" : net < 0n ? "SENT" : "SELF";
  let fee = 0n;
  if (anyInput && allOurs && dir === "SENT") {
    const totalOut = tx.outputs.reduce((s, o) => s + BigInt(o.satoshis ?? 0), 0n);
    const c = totalIn - totalOut;
    if (c > 0n) fee = c;
  }
  const amount = net < 0n ? -net : net;
  console.log(
    `\n${txid}\n  received ${rxd(received)}  spent ${rxd(spent)}  net ${rxd(net)}  allInputsOurs ${allOurs}\n  => ${dir}  amount ${rxd(amount)}  fee ${rxd(fee)}`,
  );
}

const client = new ElectrumClient({ network: "mainnet" });
await client.connect();
for (const t of txids) await compute(client, t);
await client.close();