/**
 * Browser shims for Node-only globals used by @radiant-core/radiantjs.
 *
 * Must be imported first in main.tsx, before any module that touches
 * `Buffer` or `process` (the Radiant SDK's tx builder uses both).
 */
import { Buffer } from "buffer";

const g = globalThis as Record<string, unknown>;

// WKWebView has no `global` (Node-only); crypto-browserify's randombytes reads
// `global.crypto` at module top level, so alias it before any dep loads.
if (!g.global) {
  g.global = globalThis;
}

if (!g.Buffer) {
  g.Buffer = Buffer;
}

if (!g.process) {
  g.process = {
    env: {},
    platform: "browser",
    browser: true,
    nextTick: (fn: (...args: unknown[]) => void, ...args: unknown[]) =>
      setTimeout(() => fn(...args), 0),
  };
} else if (typeof g.process === "object" && !(g.process as { env?: unknown }).env) {
  (g.process as { env: Record<string, string> }).env = {};
}
