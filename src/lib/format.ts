/** Display formatting helpers (UI edge only — all math happens in BigInt photons). */
import { photonsToRxd } from "@radiant-core/sdk";

/** "150000000" -> "1.5", grouped: "1234.567" etc. Trims trailing zeros. */
export function fmtRxd(photons: bigint, maxFrac = 8): string {
  const s = photonsToRxd(photons);
  const [intPart, fracPart = ""] = s.split(".");
  const trimmed = (fracPart.slice(0, maxFrac).replace(/0+$/, "") || "").replace(/\.$/, "");
  const frac = trimmed ? `.${trimmed}` : "";
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return grouped + frac;
}

export function fmtSignedRxd(photons: bigint): string {
  return (photons < 0n ? "-" : "+") + fmtRxd(photons < 0n ? -photons : photons);
}

export function shortHash(hash: string, lead = 12, tail = 8): string {
  if (hash.length <= lead + tail + 1) return hash;
  return `${hash.slice(0, lead)}…${hash.slice(-tail)}`;
}

export function fmtTime(unixSeconds: number): string {
  if (!unixSeconds) return "Unknown date";
  const d = new Date(unixSeconds * 1000);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function truncateMiddle(s: string, lead = 8, tail = 8): string {
  if (s.length <= lead + tail + 3) return s;
  return `${s.slice(0, lead)}…${s.slice(-tail)}`;
}
