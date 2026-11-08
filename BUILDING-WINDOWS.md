# Building on Windows

Tauri **cannot cross-compile to Windows from macOS**. You need either a
Windows machine (or a CI runner) to produce the `.exe` artifacts. Two
options are documented below.

## Option A — GitHub Actions (no Windows machine needed)

1. Create a repository on GitHub (a **private** repo is fine and recommended
   for wallet software).
2. From this folder:

   ```sh
   git remote add origin git@github.com:YOUR_USER/lumen-wallet.git
   git push -u origin main
   ```

3. Pushing to `main` (or any `v*` tag, or via *Actions → Build → Run
   workflow*) starts the build pipeline:
   - `windows` job (windows-latest): Rust MSVC + Node 22 → `tauri build`
   - `macos` job (macos-latest): builds the `.dmg` too
4. When the run is green, open the run summary page and download the
   **`lumen-wallet-windows`** artifact. It contains:
   - `Lumen Wallet 0.1.0 x64-setup.exe` — NSIS installer
   - `lumen-wallet.exe` — portable single binary (runs from any folder)

## Option B — Local build on a Windows machine

### Prerequisites (one-time, PowerShell as Administrator)

```powershell
# 1. Rust (stable MSVC toolchain)
winget install Rustlang.Rustup

# 2. Visual Studio 2022 C++ Build Tools (required by tauri/WebView2)
winget install --exact Microsoft.VisualStudio.2022.BuildTools --override `
  "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"

# 3. WebView2 Runtime (preinstalled on Windows 11; needed on Windows 10)
winget install Microsoft.EdgeWebView2Runtime

# 4. Node.js LTS
winget install OpenJS.NodeJS.LTS
```

Restart the terminal afterwards (PATH updates). Verify:

```powershell
rustc -V        # rustc 1.xx stable-x86_64-pc-windows-msvc
node -v         # v20+
```

> If `rustc` reports an `gnu` toolchain, switch:
> `rustup default stable-x86_64-pc-windows-msvc`

### Build

```powershell
git clone git@github.com:YOUR_USER/lumen-wallet.git
cd lumen-wallet
npm install
npm run tauri build
```

The first build compiles ~400 crates and can take 10–20 minutes.

### Where the artifacts land

| Artifact | Path |
|---|---|
| NSIS installer | `src-tauri\target\release\bundle\nsis\Lumen Wallet 0.1.0 x64-setup.exe` |
| MSI installer | `src-tauri\target\release\bundle\msi\*.msi` |
| Portable binary | `src-tauri\target\release\lumen-wallet.exe` |

## Notes

- **SmartScreen:** the builds are unsigned, so Windows SmartScreen will show a
  "Unknown publisher" warning on first run (click *More info → Run anyway*).
  To silence it, add a Windows code-signing certificate via Tauri's
  `bundle.windows` config later.
- **WebView2 on Windows 10:** the NSIS installer detects a missing WebView2
  runtime and offers to install it during setup.
- **Source changes to build:** edit the Rust code under `src-tauri/` or the
  webview code under `src/`, then re-run `npm run tauri build` (or
  `npm run tauri dev` for live reload during development).