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
// The Radiant/Photonic reference icon draws its artwork at ~78% of the
// canvas (56 px margin on a 512 px tile). Match that: a full-bleed tile
// renders noticeably oversized in the Dock and app switcher.
const ART = 800; // 78.125% of the canvas, same ratio as the reference
const OFF = (SIZE - ART) / 2; // 112 px margin
const RX = 180; // ~22.4% of the artwork, same corner ratio as before

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

// 2) Scale the glyph to 52% of the artwork height and center it.
const glyphH = Math.round(ART * 0.52);
const glyphW = Math.round((glyphH * cropW) / cropH);

async function tintedAt(w, h) {
  const resized = await sharp(mask, { raw: { width: cropW, height: cropH, channels: 4 } })
    .resize(w, h, { kernel: "lanczos3" })
    .png()
    .toBuffer();
  const sky = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7dd3fc"/>
      <stop offset="0.5" stop-color="#38bdf8"/>
      <stop offset="1" stop-color="#0ea5e9"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#sky)"/>
</svg>`;
  return sharp(Buffer.from(sky)).composite([{ input: resized, blend: "dest-in" }]).png().toBuffer();
}

const tinted = await tintedAt(glyphW, glyphH);
const glyph = tinted;

// 4) Background: site dark navy gradient, rounded corners, subtle glow +
// border — drawn as a centered tile with the reference icon's margins.
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
  <rect x="${OFF}" y="${OFF}" width="${ART}" height="${ART}" rx="${RX}" fill="url(#bg)"/>
  <rect x="${OFF}" y="${OFF}" width="${ART}" height="${ART}" rx="${RX}" fill="url(#glow)"/>
  <rect x="${OFF + 5}" y="${OFF + 5}" width="${ART - 10}" height="${ART - 10}" rx="${RX - 5}" fill="none" stroke="#2a3a4d" stroke-width="6" opacity="0.7"/>
</svg>`;

const canvas = await sharp(Buffer.from(bg)).composite([
  { input: glyph, gravity: "center" },
]);
await canvas.png().toFile("src-tauri/icons/source.png");
console.log("source.png written (1024x1024)");

// Also export the sky-tinted R on a transparent background for the in-app UI.
await mkdir("src/assets", { recursive: true });
const ASSET = 512;
const fit = Math.round(ASSET * 0.8);
const fitW = Math.round((fit * cropW) / cropH);
const uiMark = await tintedAt(fitW, fit);
await sharp({
  create: { width: ASSET, height: ASSET, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([{ input: uiMark, gravity: "center" }])
  .png()
  .toFile("src/assets/radiant-mark.png");
console.log("src/assets/radiant-mark.png written (512x512, transparent)");

execSync("npx tauri icon src-tauri/icons/source.png", { stdio: "inherit" });
console.log("icon set generated");

// 5) Apple-recommended .icns: rebuild it from the full macOS icon set
// (16 .. 512@2x = 1024 px). The icns the Tauri CLI writes lacks the
// intermediate representations, so macOS cannot render the icon crisply
// at every Dock/Finder size. iconutil is macOS-only; elsewhere the
// Tauri-generated icns is kept (it is unused by those bundles).
if (process.platform === "darwin") {
  const iconset = "src-tauri/icons/AppIcon.iconset";
  execSync(`rm -rf "${iconset}" && mkdir -p "${iconset}"`);
  const representations = [
    ["16x16", 16],
    ["16x16@2x", 32],
    ["32x32", 32],
    ["32x32@2x", 64],
    ["128x128", 128],
    ["128x128@2x", 256],
    ["256x256", 256],
    ["256x256@2x", 512],
    ["512x512", 512],
    ["512x512@2x", 1024],
  ];
  for (const [name, px] of representations) {
    await sharp("src-tauri/icons/source.png")
      .resize(px, px, { kernel: "lanczos3" })
      .png()
      .toFile(`${iconset}/icon_${name}.png`);
  }
  execSync(`iconutil -c icns "${iconset}" -o src-tauri/icons/icon.icns`);
  execSync(`rm -rf "${iconset}"`);
  console.log("icon.icns rebuilt with the full Apple icon set (16..1024)");
}
