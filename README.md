# Lumen Wallet

Non-custodial desktop wallet for the [Radiant](https://radiantcore.org)
(RXD) blockchain. Built with **Tauri 2 + React/TypeScript**, backed by the
official `@radiant-core/sdk`. Styled to match the Radiant ecosystem
(radiantcore.org design tokens, official Radiant mark as the app icon).

## Features

- **HD wallets** — BIP-39 mnemonics, derivation `m/44'/512'/0'/0/x`
  (legacy coin type 0 supported on restore)
- **Encrypted at rest** — mnemonic encrypted with PBKDF2 (310k iterations)
  + AES-256-GCM (WebCrypto); only an unlock passphrase touches disk
- **Live balances & history** — ElectrumX (mainnet/testnet) with ref-safe
  UTXO selection for multi-asset Radiant inputs
- **WAVE names** — resolution when receiving/sending (`.rxd` names)
- **Glyph tokens** — FT/NFT balance discovery, token transfers
- **Cross-platform** — macOS (`.dmg`) and Windows (NSIS/MSI/portable `.exe`)

## Development

Prerequisites: Node.js 20+, Rust (stable), platform Tauri prerequisites
(see <https://tauri.app/start/prerequisites/>).

```sh
npm install
npm run tauri dev      # live-reload dev window
npx tsc --noEmit       # type-check
npm run build          # webview production bundle
npm run icons          # regenerate the app icon set (official Radiant mark)
```

### macOS build

```sh
npm run tauri build    # → src-tauri/target/release/bundle/dmg
```

### Windows build

See **[BUILDING-WINDOWS.md](./BUILDING-WINDOWS.md)** — Windows binaries can
only be produced on Windows (local machine or the bundled GitHub Actions
pipeline, which builds both platforms on push to `main`).

## Project layout

```
src/
  shims.ts              # browser shims (Buffer/global/process) — import first
  main.tsx, App.tsx
  lib/
    crypto.ts           # WebCrypto: PBKDF2 + AES-256-GCM vault
    store.ts            # tauri-plugin-store wrapper (vault.json)
    walletService.ts    # HD wallet, scans, UTXO selection, sends, tokens
    explorer.ts, format.ts
  state/AppContext.tsx  # global app state (setup/unlock/sync)
  views/                # Setup, Unlock, Overview, Send, History, Tokens, Settings
src-tauri/
  src/lib.rs            # Tauri app entry (store + opener plugins)
  tauri.conf.json       # window, CSP, bundle config
  icons/                # macOS + Windows icon sets
.github/workflows/build.yml   # CI: Windows + macOS release builds
```

## Security model

- The mnemonic never touches disk in plaintext; the vault file
  (`wallet.json` → `vault` key) stores only the PBKDF2/AES-GCM blob.
- The mnemonic lives in memory only while the wallet is unlocked.
- Signing happens locally in the webview via the SDK (WIF multi-address
  ECDSA); no keys ever leave the machine.
- Webview CSP is locked down (`script-src 'self'`, no remote code).