# Lumen RXD Wallet

A non-custodial desktop wallet for the [Radiant](https://radiantcore.org) (RXD)
blockchain, built with **Tauri 2 + React/TypeScript** on top of the official
[`@radiant-core/sdk`](https://www.npmjs.com/package/@radiant-core/sdk).

Keys are generated and used entirely on your machine. The app talks to
ElectrumX servers only; it never uploads your seed, and the webview is locked
down with a strict CSP.

> **Status: early development, unaudited.** Test with small amounts first.

---

## Features

**Wallets**
- Create a new wallet (fresh 12-word BIP-39 phrase) or restore from an existing one
- Derivation `m/44'/512'/0'/0/x` (SLIP-0044 coin type 512); restoring legacy
  wallets via coin type `0` is supported
- Multiple receive addresses, with a dedicated **Addresses** tab listing every
  derived address, its balance, transaction count and derivation path
- Password-protected vault: PBKDF2-SHA256 (600,000 iterations) → AES-256-GCM,
  stored locally; auto-lock after a configurable idle period
- Password policy follows **NIST SP 800-63B**: ≥12 characters (above the
  8-character NIST floor), no forced character classes, blocked
  common/breached/pattern passwords, and rate-limited unlock attempts — with
  a reveal toggle and guidance in the UI
- Reveal recovery phrase (password-gated), change password, erase wallet

**Sending & receiving**
- QR code + copy for any receive address
- Send RXD to an address **or a WAVE name** (resolved via the Radiant API)
- Ref-safe UTXO selection — token-bearing UTXOs are never spent as funding,
  so Glyph assets cannot be burned by accident
- Multi-address signing (per-input keys); change returns to your latest
  receive address
- Fee set from the *measured* signed transaction size at the network floor
  (10,000 photons/byte on mainnet), with a built-in sanity ceiling

**Insight**
- Live balances and history per address via ElectrumX subscriptions
- History survives mempool/unconfirmed transactions and server quirks
  (see [Implementation notes](#implementation-notes))
- Glyph **FT/NFT discovery** and token transfers (commit/reveal)
- Deep links to [rxdexplorer.com](https://rxdexplorer.com) for every
  transaction and address

**Platform**
- macOS (`.app` / `.dmg`, full multi-size `.icns`) and Windows
  (NSIS/MSI installers + portable `.exe`)
- Mainnet/testnet switch, plus a custom ElectrumX endpoint

---

## Requirements

| | |
|---|---|
| Node.js | 20.19+ or 22+ (the SDK needs `require(ESM)` support) |
| Rust | stable toolchain (`cargo`) |
| macOS | **13.3 Ventura or newer** (see note below) |
| Windows | 10/11 with the MSVC build tools + WebView2 runtime |

> **Why macOS 13.3?** The UI is styled with Tailwind CSS v4, whose output uses
> modern CSS (`@property`, `color-mix()`, `oklch()`) that requires WebKit 16.4
> — first shipped with macOS 13.3. BigInt (ES2020, needed for photon amounts)
> additionally rules out anything below macOS 11. The app's `Info.plist`
> declares `LSMinimumSystemVersion 13.3` so older systems refuse to launch it
> rather than render a broken interface.

Platform prerequisites are documented at
<https://tauri.app/start/prerequisites/>.

## Getting started

```sh
npm install

npm run tauri dev     # run the app with live reload
npm run typecheck     # tsc --noEmit
npm run build         # production webview bundle (dist/)
npm run icons         # regenerate the app icon set
```

### Build a macOS app

```sh
npm run tauri build   # → src-tauri/target/release/bundle/{macos,dmg}
```

The `.dmg` step drives Finder via AppleScript; if your terminal has not been
granted *System Settings → Privacy & Security → Automation → Finder*, the
`.app` is still produced and you can ship that, or grant the permission.

### Build for Windows

Tauri cannot cross-compile to Windows from macOS. Use either
- the bundled GitHub Actions workflow (`.github/workflows/build.yml`), which
  builds Windows + macOS on every push to `main` / `v*` tag, or
- a Windows machine: see **[BUILDING-WINDOWS.md](./BUILDING-WINDOWS.md)**.

### Icons

The app icon is the official Radiant "R" mark (`src-tauri/icons/radiant-mark.png`,
from radiantcore.org), tinted with the ecosystem's sky-blue gradient. `npm run icons`
redraws the artwork at the reference 78% canvas ratio and regenerates every
format — including a full 16→1024 px `.icns` via Apple's `iconutil` (macOS only)
and the in-app `src/assets/radiant-mark.png`.

---

## Architecture

```
 React UI (webview)                     Rust host (Tauri)
 ─────────────────────                  ────────────────────────────
 views/ + state/AppContext ───invoke─►  tauri-plugin-store
         │                                └─ wallet.json (encrypted vault)
         ▼                              tauri-plugin-opener
 lib/walletService.ts                     └─ opens explorer links
   ├─ HD derivation (m/44'/512'/…)
   ├─ ref-safe funding selection
   ├─ tx build + signing (SIGHASH_ALL|FORKID)
   └─ ElectrumX client ───────wss──────►  wss://electrumx.radiantcore.org:443
                                          https://radiantcore.org/api (WAVE)
```

- **All key material and signing happen in the webview** using the Radiant SDK
  (`@radiant-core/radiantjs` under the hood). Rust never sees the seed; it only
  persists the encrypted vault and opens URLs.
- The Rust side is deliberately thin (`src-tauri/src/lib.rs` registers the store
  and opener plugins), so the security-critical surface is the same code on
  macOS and Windows.
- `src/shims.ts` must stay the first import — it installs the `Buffer`,
  `process` and `global` shims that radiantjs expects in a browser context.

### Unlock / sync flow

1. Password → PBKDF2 → AES-GCM decrypt → mnemonic (memory only).
2. `HDWallet.fromMnemonic` derives addresses `0..receiveIndex`.
3. First scan fetches balance, UTXOs and history per address (8-way
   concurrency), then a one-shot probe of the next 10 indices re-discovers
   funds received on older addresses (e.g. after a restore).
4. ElectrumX subscriptions trigger debounced rescans, so incoming payments
   appear without manual refresh.

## Project layout

```
src/
  shims.ts                 # Buffer/process/global shims — imported first
  main.tsx  App.tsx        # entry + phase router (setup / unlock / ready)
  components/ui.tsx        # buttons, modal, icons, RadiantMark
  lib/
    crypto.ts              # WebCrypto vault (PBKDF2 + AES-256-GCM)
    store.ts               # tauri-plugin-store wrapper + Settings type
    walletService.ts       # HD wallet, scans, funding, signing, tokens
    explorer.ts            # explorer deep links (rxdexplorer.com)
    format.ts              # RXD/photon formatting, dates, truncation
  state/AppContext.tsx     # app phase, settings, live scan state, actions
  views/
    LoadingSplash  SetupView  UnlockView      # onboarding & lock screen
    MainLayout                                # sidebar + tab router
    OverviewView  SendPanel  QrModal          # balance, send, receive QR
    HistoryView  TokensView  AddressesView    # activity, Glyph, all addresses
    SettingsView                              # network, security, about
src-tauri/
  src/lib.rs               # Tauri entry (store + opener plugins)
  tauri.conf.json          # window, CSP, bundle metadata
  icons/                   # radiant mark + generated icon sets
scripts/make-icons.mjs     # icon pipeline (sharp + iconutil)
.github/workflows/build.yml# CI: Windows + macOS installers
BUILDING-WINDOWS.md        # local Windows build guide
```

## Data on disk & security model

Everything lives in one store file, `wallet.json`, in the app data directory:

| OS | Path |
|---|---|
| macOS | `~/Library/Application Support/org.lumenwallet.lumen-wallet/wallet.json` |
| Windows | `%APPDATA%\org.lumenwallet.lumen-wallet\wallet.json` |

Keys inside it:

- `vault` — `{ v, salt, iterations, iv, ciphertext }`: the BIP-39 mnemonic and
  coin type, encrypted with a key derived from your password
  (PBKDF2-SHA256, 600,000 iterations, AES-256-GCM with a random IV)
- `settings` — network, custom endpoint, current receive index, auto-lock

Properties:

- The mnemonic exists in plaintext **only in memory while unlocked**; a wrong
  password fails GCM authentication.
- Signing uses derived WIF keys in-process; nothing is sent to any server
  except the signed transaction when you broadcast.
- Webview CSP: `default-src 'self'`, `script-src 'self'`, no remote code;
  network access limited to the ElectrumX/WAVE endpoints you configure.

### Password policy (NIST SP 800-63B §5.1.1)

Implemented in `src/lib/password.ts` and enforced in the context layer, so no
UI path can bypass it:

| NIST requirement | Implementation |
|---|---|
| ≥12 characters required (NIST floor is 8) | `MIN_PASSWORD_LENGTH = 12`; 16+ recommended in the UI |
| Accept ≥64 characters, never truncate | up to 1024 characters, counted in code points (Unicode/emoji safe) |
| No composition rules | none enforced — guidance only |
| Blocklist of common/breached/expected secrets | ~90 entry local list + app/coin vocabulary, repeated characters, simple sequences & keyboard walks |
| Offer guidance, allow paste | live checklist and suggestions; paste and password managers work normally |
| Limit failed attempts (§5.1.1.2) | unlock backs off after 3 failures (5s, 10s, 20s … capped at 5 min) |
| Adequate KDF work factor | PBKDF2-SHA256 @ 600,000 iterations, unique salt, AES-256-GCM |

Vaults created by older builds keep working: each vault stores the iteration
count it was encrypted with.

---

## Configuration defaults

| Setting | Default |
|---|---|
| Network | mainnet (testnet available; expects your own ElectrumX) |
| ElectrumX endpoint | `wss://electrumx.radiantcore.org:443` |
| WAVE resolution API | `https://radiantcore.org/api` |
| Block explorer | `https://rxdexplorer.com` (`/tx/<id>`, `/address/<addr>`) |
| HD coin type | `512` (SLIP-0044); `0` for legacy restores |
| Base unit | photon — 1 RXD = 100,000,000 photons |
| Min relay fee | 10,000 photons/byte (network floor, used as the fee rate) |

All amounts are handled as `BigInt` photons internally and converted to a
fixed-point RXD string only at the UI boundary — never with floats.

## Implementation notes

Radiant's ecosystem has a few sharp edges that this wallet handles explicitly:

- **Verbose transaction values are decimal RXD**, not integer satoshis, on the
  public ElectrumX server (`blockchain.transaction.get …, true`). Values are
  converted with a rounding-safe helper; feeding them straight into `BigInt()`
  would throw on fractional amounts and skew every figure by 10⁸.
- **Address history carries no amounts** (`{tx_hash, height}` only). When a
  transaction cannot be fetched (mempool, transient error), the row is
  synthesized from history metadata — labelled *unconfirmed* — and replaced by
  the full details on a later scan once the transaction is mineable/indexed.
- **Unconfirmed transactions return `null`** from `transaction.get`, so the
  history view never silently loses a pending payment.
- **Token UTXOs are keyed by `scriptHash(zeroRefs(script))`**, so Glyph
  balances are discovered from history outputs and verified live with a
  per-token `listUnspent` check; they are excluded from RXD funding.
- **Restores probe extra addresses**: on unlock the wallet checks the next 10
  receive indices and extends the scan chain if it finds activity — a restore
  can never hide funds sitting on a previously used address.
- **The fee is measured, not estimated**: the transaction is serialized with
  its real signatures, then the fee is set to `(size + 20) × feeRate`, with a
  sanity ceiling that refuses obviously wrong fees.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Blank window in `tauri dev` | `src/shims.ts` must be the first import in `main.tsx`; it installs `global`/`Buffer`/`process` for radiantjs |
| `Port 1420 is already in use` | A previous dev server is still running — kill it, then rerun |
| Icon changes not visible in dev | The icon is embedded in the binary at compile time: `touch src-tauri/build.rs && cargo build` |
| Icon looks stale in the Dock | macOS caches it — `killall Dock` |
| `tauri build` fails at the DMG step | Terminal lacks Finder automation permission (Big Sur+); grant it in *Privacy & Security → Automation*, or use the produced `.app` |
| Restored wallet shows a wrong/zero balance | Confirm the same network (mainnet/testnet) and that the seed matches; the unlock probe searches the next 10 addresses automatically |

## Limitations

- Not audited; no hardware-wallet support yet
- Single account (`m/44'/512'/0'`); change output reuses your latest receive address
- Glyph support covers discovery and transfers — no minting UI yet
- No RBF/CPFP controls; the fee follows the network floor
- Builds are unsigned (macOS: ad-hoc; Windows: SmartScreen warning) —
  add signing identities before distributing
- No automated test suite yet; the crypto/network stack is validated with
  manual scripts against mainnet (`buildRxdTransfer` signature verification,
  ElectrumX round-trips, WAVE resolution)

## Credits

- [Radiant Core](https://radiantcore.org) — protocol, `@radiant-core/sdk`,
  `@radiant-core/radiantjs`, WAVE/Glyph specs, design tokens
- The official Radiant "R" mark (radiantcore.org) is used for the app icon
- [Photonic Wallet](https://github.com/Radiant-Core/Photonic-Wallet) and
  Electron-Radiant for reference wallet behaviour
- [rxdexplorer.com](https://rxdexplorer.com) for block-explorer deep links

## License

MIT — see [LICENSE](./LICENSE).

Copyright (c) 2026 Lumen RXD Wallet contributors.


