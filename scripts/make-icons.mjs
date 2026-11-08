/**
 * Generate the Tauri icon set from an SVG source.
 * Usage: npm run icons  (then `npx tauri icon` is NOT needed — we run it here)
 */
import { execSync } from "node:child_process";
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

await mkdir("src-tauri/icons", { recursive: true });

// Radiant "sun" mark: amber/orange radial burst on dark rounded square.
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#10141d"/>
      <stop offset="1" stop-color="#0a0c12"/>
    </linearGradient>
    <linearGradient id="sun" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffd54a"/>
      <stop offset="0.55" stop-color="#f6a821"/>
      <stop offset="1" stop-color="#f97316"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="230" fill="url(#bg)"/>
  <g transform="translate(512 512)">
    <g fill="url(#sun)">
      ${Array.from({ length: 8 }, (_, i) =>
        `<rect x="-34" y="-430" width="68" height="190" rx="34" transform="rotate(${i * 45})"/>`
      ).join("\n      ")}
    </g>
    <circle r="190" fill="url(#sun)"/>
    <circle r="120" fill="#fff7e6" opacity="0.28"/>
  </g>
</svg>`;

await sharp(Buffer.from(svg)).resize(1024, 1024).png().toFile("src-tauri/icons/source.png");
console.log("source.png written");

execSync("npx tauri icon src-tauri/icons/source.png", { stdio: "inherit" });
console.log("icon set generated");
