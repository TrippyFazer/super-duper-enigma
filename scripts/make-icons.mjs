// Generates PWA icons without any native image dependency.
// Draws a dark rounded square with a gold ascending chevron emblem.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

function crc32(buf) {
  let c,
    crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function render(size, { maskable = false } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const bg = [11, 13, 18];
  const card = [22, 26, 36];
  const gold = [212, 175, 90];
  const gold2 = [240, 207, 126];
  const radius = maskable ? 0 : size * 0.22;
  const pad = maskable ? size * 0.1 : 0;

  const inRounded = (x, y) => {
    if (maskable) return true;
    const r = radius;
    const cx = Math.min(Math.max(x, r), size - r);
    const cy = Math.min(Math.max(y, r), size - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };

  // Emblem geometry: two stacked chevrons (ascend), centered.
  const c = size / 2;
  const w = size * 0.42 - pad * 0.5; // half-width
  const t = size * 0.075; // stroke thickness
  const chev = (x, y, apexY) => {
    // distance from point to the "^" polyline with apex at (c, apexY), ends at (c±w, apexY + w*0.78)
    const dx = Math.abs(x - c);
    const lineY = apexY + dx * 0.78;
    if (dx > w) return false;
    return Math.abs(y - lineY) <= t / 2 / Math.cos(Math.atan(0.78));
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (!inRounded(x + 0.5, y + 0.5)) {
        buf[i + 3] = 0;
        continue;
      }
      // background with subtle vertical gradient
      const g = y / size;
      let r = bg[0] + (card[0] - bg[0]) * (1 - g) * 0.8;
      let gg = bg[1] + (card[1] - bg[1]) * (1 - g) * 0.8;
      let b = bg[2] + (card[2] - bg[2]) * (1 - g) * 0.8;
      const upper = chev(x, y, size * 0.3);
      const lower = chev(x, y, size * 0.52);
      if (upper || lower) {
        const k = upper ? 1 : 0.62;
        const mix = (y - size * 0.25) / (size * 0.6);
        r = (gold2[0] * (1 - mix) + gold[0] * mix) * k + bg[0] * (1 - k);
        gg = (gold2[1] * (1 - mix) + gold[1] * mix) * k + bg[1] * (1 - k);
        b = (gold2[2] * (1 - mix) + gold[2] * mix) * k + bg[2] * (1 - k);
      }
      buf[i] = r;
      buf[i + 1] = gg;
      buf[i + 2] = b;
      buf[i + 3] = 255;
    }
  }
  return png(size, size, buf);
}

const out = path.join(process.cwd(), "public", "icons");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "icon-192.png"), render(192));
fs.writeFileSync(path.join(out, "icon-512.png"), render(512));
fs.writeFileSync(path.join(out, "icon-512-maskable.png"), render(512, { maskable: true }));
fs.writeFileSync(path.join(out, "apple-touch-icon.png"), render(180, { maskable: true }));
fs.writeFileSync(
  path.join(out, "icon.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#11141c"/><path d="M14 46 L50 18 L86 46" fill="none" stroke="#e8c46a" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 68 L50 40 L86 68" fill="none" stroke="#a8853d" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
);
console.log("icons written to", out);
