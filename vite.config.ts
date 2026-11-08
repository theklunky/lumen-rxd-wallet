import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Tauri expects a fixed dev port and no auto-open.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  resolve: {
    alias: {
      // Node builtins required at runtime by @radiant-core/radiantjs and its
      // crypto-browserify dependency (PBKDF2/HMAC for seed derivation, internal
      // asserts, stream base classes). Bundled for the webview; the global
      // WebCrypto `crypto` object is unaffected.
      crypto: "crypto-browserify",
      assert: "assert",
      stream: "readable-stream",
      events: "events",
      util: new URL("./node_modules/util/util.js", import.meta.url).pathname,
      // `buffer`'s npm package shares the builtin's name, so esbuild's dev
      // pre-bundle still treats it as a Node builtin and externalizes it. Point
      // the alias at the real file so dev (esbuild) and prod (rollup) agree.
      buffer: new URL("./node_modules/buffer/index.js", import.meta.url).pathname,
    },
  },
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: "es2022",
    outDir: "dist",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
