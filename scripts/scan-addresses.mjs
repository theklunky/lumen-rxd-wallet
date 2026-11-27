#!/usr/bin/env node
/**
 * Local address scanner — locate where a 12-word seed's funds actually live.
 *
 * Derives a broad set of BIP-44 paths and prints every address that currently
 * holds a balance, so you can see addresses the app may not be deriving:
 *   - Radiant coin type 512  +  legacy coin type 0
 *   - accounts 0 and 1
 *   - external (receive, change 0) + internal (change, change 1)
 *
 * Usage:
 *   node scripts/scan-addresses.mjs              # paste 12 words, then ⌘D (Ctrl-D)
 *   node scripts/scan-addresses.mjs --depth 200  # scan more indices per chain
 *   node scripts/scan-addresses.mjs --phrase "w1 w2 …"  # avoid: lands in shell history
 *
 * Your recovery phrase is used locally only and is never transmitted. This
 * performs read-only balance queries against the public ElectrumX server.
 */
import { HDWallet, ElectrumClient, PHOTONS_PER_RXD } from "@radiant-core/sdk";

const args = process.argv.slice(2);
const flag = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const network = flag("--network") || "mainnet";
const depth = Math.max(1, parseInt(flag("--depth") || "100", 10) || 100);
const CONC = 8;

function readPhrase() {
  const fromArg = flag("--phrase");
  if (fromArg) return Promise.resolve(fromArg.trim());
  console.error("Paste your 12-word recovery phrase, press Enter, then ⌘D (Ctrl-D):");
  return new Promise((res) => {
    let d = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (d += c));
    process.stdin.on("end", () => res(d.trim()));
  });
}

const toRxd = (photons) =>
  (Number(photons) / Number(PHOTONS_PER_RXD)).toLocaleString(undefined, {
    maximumFractionDigits: 8,
  });

// Every plausible derivation path, most-likely first.
const CHAINS = [
  { coinType: 512, account: 0, change: 0, label: "Radiant · external(receive)" },
  { coinType: 512, account: 0, change: 1, label: "Radiant · internal(change)" },
  { coinType: 512, account: 1, change: 0, label: "Radiant · external acct1" },
  { coinType: 512, account: 1, change: 1, label: "Radiant · internal acct1" },
  { coinType: 0, account: 0, change: 0, label: "Legacy  · external(receive)" },
  { coinType: 0, account: 0, change: 1, label: "Legacy  · internal(change)" },
];
// Secondary paths use a smaller range to keep the scan bounded.
const depthFor = (c) => (c.account > 0 || c.coinType === 0 ? Math.min(depth, 50) : depth);

async function main() {
  const text = await readPhrase();
  if (!text) throw new Error("No recovery phrase provided.");

  const client = new ElectrumClient({ network });
  await client.connect();
  console.error(
    `Connected to ${network}. Scanning ${CHAINS.length} chains (up to ${depth} indices each)...\n`,
  );

  let funded = 0;
  let errors = 0;
  let total = 0n;

  for (const c of CHAINS) {
    const d = depthFor(c);
    const hd = HDWallet.fromMnemonic(text, { network, coinType: c.coinType, account: c.account });
    const keys = hd.deriveRange(0, d, c.change);
    const hits = new Array(keys.length);
    let cursor = 0;
    const worker = async () => {
      while (cursor < keys.length) {
        const i = cursor++;
        try {
          const bal = await client.getBalance(keys[i].address);
          if (bal.confirmed + bal.unconfirmed > 0n) hits[i] = { k: keys[i], bal };
        } catch {
          errors++;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONC, keys.length) }, () => worker()));
    const found = hits.filter(Boolean);
    if (found.length) {
      console.log(
        `\n== ${c.label}   m/44'/${c.coinType}'/${c.account}'/${c.change}/i  — ${found.length} funded ==`,
      );
      for (const { k, bal } of found) {
        funded++;
        total += bal.confirmed + bal.unconfirmed;
        const u = bal.unconfirmed ? ` (+${toRxd(bal.unconfirmed)} unconf)` : "";
        console.log(`  #${String(k.index).padStart(3)}  ${toRxd(bal.confirmed)} RXD${u}   ${k.address}`);
      }
    } else {
      console.log(`-- ${c.label}: no funded addresses in #0..#${d - 1} --`);
    }
  }

  console.log(
    `\n=== TOTAL: ${funded} funded address(es), ${toRxd(total)} RXD, ${errors} failed request(s) ===`,
  );
  if (errors > 20) {
    console.log(
      `WARNING: ${errors} balance requests failed — results may be incomplete (rate limit/network). Re-run, or try --depth 50.`,
    );
  }
  await client.close();
}

main().catch((e) => {
  console.error("\nError:", (e && e.message) || e);
  process.exit(1);
});