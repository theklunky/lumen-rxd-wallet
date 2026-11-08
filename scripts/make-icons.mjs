/**
 * Generate the Tauri icon set.
 *
 * The Lumen Wallet icon is the official Radiant "R" mark (radiant-mark.png,
 * from radiantcore.org) tinted with the site's sky-blue accent, centered on
 * the site's dark navy background.
 *
 * Usage: npm run icons
 */
import { execSync } from "node:child_process";
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

await mkdir("src-tauri/icons", { recursive: true });
const SIZE = 1024;

// 1) Extract the R glyph as a clean alpha mask.
// radiant-mark.png is the favicon mark: black R on an opaque white circle,
// transparent outside the circle. Luminance of the opaque circle area maps
// 0 (R stroke) -> 255 (white background), which is exactly the mask we want.
const { data, info } = await sharp("src-tauri/icons/radiant-mark.png")
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width, height } = info;
const lum = new Float32Array(width * height);
let minX = width, minY = height, maxX = -1, maxY = -1;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lum[y * width + x] = a === 0 ? 0 : l;
    if (a > 0 && l < 245) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
if (maxX < 0) throw new Error("no glyph pixels found in radiant-mark.png");

const cropW = maxX - minX + 1;
const cropH = maxY - minY + 1;
const mask = new Uint8Array(cropW * cropH * 4);
for (let y = 0; y < cropH; y++) {
  for (let x = 0; x < cropW; x++) {
    const l = lum[(y + minY) * width + (x + minX)];
    const o = (y * cropW + x) * 4;
    mask[o] = 255;
    mask[o + 1] = 255;
    mask[o + 2] = 255;
    mask[o + 3] = a_255_minus_l(l);
  }
}
function a_255_minus_l(l) {
  return Math.max(0, Math.min(255, Math.round(255 - l)));
}

// 2) Scale the glyph to 52% of the canvas height and center it.
const glyphH = Math.round(SIZE * 0.52);
const glyphW = Math.round((glyphH * cropW) / cropH);
const tinted = await sharp(mask, { raw: { width: cropW, height: cropH, channels: 4 } })
  .resize(glyphW, glyphH, { kernel: "lanczos3" })
  .png()
  .toBuffer();

// 3) Tint the mask with the site's sky gradient (#7dd3fc -> #38bdf8 -> #0ea5e9).
const sky = `<svg xmlns="http://www.w3.org/2000/svg" width="${glyphW}" height="${glyphH}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7dd3fc"/>
      <stop offset="0.5" stop-color="#38bdf8"/>
      <stop offset="1" stop-color="#0ea5e9"/>
    </linearGradient>
  </defs>
  <rect width="${glyphW}" height="${glyphH}" fill="url(#sky)"/>
</svg>`;
const glyph = await sharp(Buffer.from(sky))
  .composite([{ input: tinted, blend: "dest-in" }])
  .png()
  .toBuffer();

// 4) Background: site dark navy gradient, rounded corners, subtle glow + border.
const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#131c2e"/>
      <stop offset="1" stop-color="#0a0e17"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.46" r="0.55">
      <stop offset="0" stop-color="#38bdf8" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#38bdf8" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" rx="230" fill="url(#bg)"/>
  <rect width="${SIZE}" height="${SIZE}" rx="230" fill="url(#glow)"/>
  <rect x="5" y="5" width="${SIZE - 10}" height="${SIZE - 10}" rx="225" fill="none" stroke="#2a3a4d" stroke-width="6" opacity="0.7"/>
</svg>`;

const canvas = await sharp(Buffer.from(bg)).composite([
  { input: glyph, gravity: "center" },
]);
await canvas.png().toFile("src-tauri/icons/source.png");
console.log("source.png written (1024x1024)");

execSync("npx tauri icon src-tauri/icons/source.png", { stdio: "inherit" });
console.log("icon set generated");
