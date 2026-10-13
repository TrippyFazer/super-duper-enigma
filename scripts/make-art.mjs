// Generates the rank art set: a crest (shield + helm + laurels + letter) and a
// backdrop (sky + castle silhouette) per rank, as small SVG files in /public/art.
// Real UI components are layered over these; they are never screenshots.
import fs from "node:fs";
import path from "node:path";

const RANKS = {
  E: { metal: "#6b7080", metalHi: "#9aa0ae", metalLo: "#3a3f4c", cloth: "#2b3140", gold: "#7a6a45", glow: "rgba(154,160,174,0.25)", sky: ["#0d1017", "#1b2130"], light: "#5e6577", plume: "#3a3f4c", laurel: "#5a5f6b", banners: 0, turrets: 2, spires: false, lightBeam: false, stars: false },
  D: { metal: "#8b93a6", metalHi: "#b9c0cf", metalLo: "#4a5164", cloth: "#1f3a6b", gold: "#9a8650", glow: "rgba(111,159,216,0.28)", sky: ["#0c1322", "#1d2d4f"], light: "#3f6cb0", plume: "#2f5aa8", laurel: "#6f7f9a", banners: 2, turrets: 3, spires: false, lightBeam: false, stars: false },
  C: { metal: "#b8bfcc", metalHi: "#e2e6ee", metalLo: "#5e6678", cloth: "#213a73", gold: "#c8a254", glow: "rgba(121,180,236,0.3)", sky: ["#0b1324", "#2a3d66"], light: "#79b4ec", plume: "#2d4f95", laurel: "#9aa6ba", banners: 3, turrets: 4, spires: true, lightBeam: false, stars: false },
  B: { metal: "#c9d0dc", metalHi: "#f1f4f9", metalLo: "#6a7284", cloth: "#2a3f8a", gold: "#d4af5a", glow: "rgba(124,131,255,0.32)", sky: ["#0a0f22", "#2b2f6a"], light: "#8f95ff", plume: "#1c2f6f", laurel: "#c2a65c", banners: 4, turrets: 5, spires: true, lightBeam: false, stars: true },
  A: { metal: "#e6e8ef", metalHi: "#ffffff", metalLo: "#8c93a4", cloth: "#f1e6c8", gold: "#e0c070", glow: "rgba(201,166,255,0.35)", sky: ["#120d1f", "#3a2d5c"], light: "#d9c6fa", plume: "#f3eedf", laurel: "#dcbd6c", banners: 5, turrets: 6, spires: true, lightBeam: true, stars: true },
  S: { metal: "#f3e7c1", metalHi: "#fffaf0", metalLo: "#b89a5a", cloth: "#fff7e0", gold: "#f0cf7e", glow: "rgba(232,196,106,0.45)", sky: ["#15120a", "#5b4a1e"], light: "#f3d98c", plume: "#fff2cc", laurel: "#f0cf7e", banners: 6, turrets: 7, spires: true, lightBeam: true, stars: true },
};

function crest(rank, c) {
  // Laurel wreath hugging the lower half of the composition.
  const leaves = [];
  for (let side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const ang = 95 + t * 85; // degrees from top, sweeping down the side
      const rad = (ang * Math.PI) / 180;
      const x = 110 + side * Math.sin(rad) * 86;
      const y = 150 - Math.cos(rad) * 86 + 10;
      const rot = side * (ang - 90) * -1 + (side > 0 ? 0 : 0);
      leaves.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="5" ry="12" transform="rotate(${(-side * (180 - ang)).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="${c.laurel}" opacity="${0.7 + t * 0.3}"/>`);
      void rot;
    }
  }
  const rankGlow = rank === "S" || rank === "A" ? `<circle cx="110" cy="118" r="104" fill="url(#halo)"/>` : "";
  const sparkles = c.stars ? `<g fill="${c.gold}"><circle cx="34" cy="48" r="1.6"/><circle cx="188" cy="60" r="1.3"/><circle cx="40" cy="200" r="1.2"/><circle cx="184" cy="190" r="1.6"/><circle cx="110" cy="12" r="1.8"/></g>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 240" width="220" height="240">
<defs>
  <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.metalHi}"/><stop offset=".55" stop-color="${c.metal}"/><stop offset="1" stop-color="${c.metalLo}"/></linearGradient>
  <linearGradient id="metalV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.metalHi}"/><stop offset="1" stop-color="${c.metalLo}"/></linearGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.gold}"/><stop offset="1" stop-color="${c.metalLo}"/></linearGradient>
  <linearGradient id="shield" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.cloth}"/><stop offset="1" stop-color="#0b0d12"/></linearGradient>
  <radialGradient id="halo"><stop offset="0" stop-color="${c.glow}"/><stop offset="1" stop-color="rgba(0,0,0,0)"/></radialGradient>
</defs>
${rankGlow}
<!-- pauldrons + chest -->
<g transform="translate(110 118)">
  <path d="M-78 44 C-78 18 -56 8 -40 10 L-24 26 L-22 60 L-70 64 Z" fill="url(#metal)" stroke="${c.metalLo}" stroke-width="1.2"/>
  <path d="M78 44 C78 18 56 8 40 10 L24 26 L22 60 L70 64 Z" fill="url(#metal)" stroke="${c.metalLo}" stroke-width="1.2"/>
  <path d="M-30 18 L30 18 L36 62 L-36 62 Z" fill="url(#metalV)" stroke="${c.metalLo}" stroke-width="1.2"/>
  <path d="M-30 18 L30 18 L34 30 L-34 30 Z" fill="${c.cloth}" opacity=".9"/>
  <path d="M0 32 L0 58" stroke="${c.gold}" stroke-width="1.5" opacity=".8"/>
  <path d="M-10 40 L10 40 M-8 48 L8 48" stroke="${c.gold}" stroke-width="1" opacity=".5"/>
</g>
<!-- great helm -->
<g transform="translate(110 76)">
  <path d="M-26 6 C-26 -24 26 -24 26 6 L26 40 C26 48 20 52 12 52 L-12 52 C-20 52 -26 48 -26 40 Z" fill="url(#metal)" stroke="${c.metalLo}" stroke-width="1.5"/>
  <path d="M-26 10 L26 10 L26 24 L-26 24 Z" fill="${c.metalLo}"/>
  <path d="M-24 12 L24 12 L24 16 L-24 16 Z" fill="#0b0d12"/>
  <g fill="#0b0d12"><rect x="-14" y="28" width="3" height="10"/><rect x="-6" y="28" width="3" height="10"/><rect x="3" y="28" width="3" height="10"/><rect x="11" y="28" width="3" height="10"/></g>
  <path d="M0 -20 L0 52" stroke="${c.metalHi}" stroke-width="1.5" opacity=".5"/>
  <path d="M-2 -22 C-4 -44 10 -56 30 -52 C18 -46 14 -36 12 -22 C8 -28 4 -28 2 -22 Z" fill="${c.plume}"/>
  <path d="M-10 -20 C-14 -34 -8 -44 0 -46 C-4 -38 -4 -30 -2 -22 Z" fill="${c.plume}" opacity=".85"/>
  <path d="M-30 6 h60" stroke="${c.gold}" stroke-width="2" opacity=".7"/>
</g>
${leaves.join("")}
<!-- shield with rank letter -->
<g transform="translate(110 186)">
  <path d="M-32 -30 L32 -30 L32 6 C32 26 16 36 0 42 C-16 36 -32 26 -32 6 Z" fill="url(#shield)" stroke="url(#gold)" stroke-width="2.5"/>
  <path d="M-25 -23 L25 -23 L25 4 C25 20 12 28 0 33 C-12 28 -25 20 -25 4 Z" fill="none" stroke="${c.gold}" stroke-width=".8" opacity=".6"/>
  <text x="0" y="15" text-anchor="middle" font-family="Cinzel, 'Palatino Linotype', Georgia, serif" font-weight="700" font-size="36" fill="${c.gold}">${rank}</text>
</g>
${sparkles}
</svg>`;
}

function backdrop(rank, c) {
  const w = 800;
  const h = 360;
  const turrets = [];
  const count = c.turrets;
  for (let i = 0; i < count; i++) {
    const x = 520 + i * 36 + (i % 2) * 8;
    const th = 70 + ((i * 37) % 60) + (c.spires ? 30 : 0);
    turrets.push(`<rect x="${x}" y="${h - 110 - th}" width="22" height="${th + 110}" fill="#0b0d12"/>`);
    if (c.spires) turrets.push(`<path d="M${x - 2} ${h - 110 - th} L${x + 11} ${h - 150 - th} L${x + 24} ${h - 110 - th} Z" fill="#0b0d12"/>`);
    if (i % 2 === 0 && c.banners > i / 2) {
      const top = c.spires ? h - 150 - th : h - 110 - th;
      turrets.push(`<path d="M${x + 11} ${top} l0 -34" stroke="#0b0d12" stroke-width="2"/><path d="M${x + 12} ${top - 34} l22 7 l-22 9 z" fill="${c.light}" opacity=".9"/>`);
    }
  }
  const windows = [...Array(Math.min(12, count * 3))].map((_, i) => `<rect x="${528 + (i % count) * 36 + 8}" y="${h - 150 + (i % 3) * 18}" width="4" height="7" fill="${c.light}" opacity="${rank === "E" ? 0.25 : 0.7}"/>`).join("");
  const beam = c.lightBeam ? `<path d="M560 0 L700 0 L660 ${h} L600 ${h} Z" fill="url(#beam)" opacity=".5"/>` : "";
  const stars = c.stars ? [...Array(28)].map((_, i) => `<circle cx="${(i * 97) % w}" cy="${(i * 53) % 150}" r="${(i % 3) * 0.4 + 0.6}" fill="#fff" opacity="${0.3 + ((i * 7) % 5) / 10}"/>`).join("") : "";
  const clouds = rank === "E" ? `<ellipse cx="200" cy="90" rx="200" ry="40" fill="#1b2130" opacity=".8"/><ellipse cx="420" cy="60" rx="180" ry="36" fill="#141924" opacity=".9"/>` : `<ellipse cx="160" cy="110" rx="220" ry="34" fill="${c.sky[1]}" opacity=".5"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMax slice" width="${w}" height="${h}">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.sky[0]}"/><stop offset="1" stop-color="${c.sky[1]}"/></linearGradient>
  <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.light}" stop-opacity=".9"/><stop offset="1" stop-color="${c.light}" stop-opacity="0"/></linearGradient>
  <radialGradient id="sun" cx="0.8" cy="0.55" r="0.5"><stop offset="0" stop-color="${c.light}" stop-opacity=".55"/><stop offset="1" stop-color="${c.light}" stop-opacity="0"/></radialGradient>
  <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0d12" stop-opacity="0"/><stop offset="1" stop-color="#0b0d12" stop-opacity="1"/></linearGradient>
</defs>
<rect width="${w}" height="${h}" fill="url(#sky)"/>
${stars}
<rect width="${w}" height="${h}" fill="url(#sun)"/>
${clouds}
${beam}
<!-- far mountains -->
<path d="M0 ${h - 120} L120 ${h - 200} L220 ${h - 150} L330 ${h - 230} L440 ${h - 160} L520 ${h - 190} L${w} ${h - 140} L${w} ${h} L0 ${h} Z" fill="#0f1320" opacity=".9"/>
<!-- castle -->
${turrets.join("")}
<rect x="500" y="${h - 110}" width="${count * 36 + 40}" height="110" fill="#0b0d12"/>
${windows}
<!-- bridge -->
<path d="M0 ${h - 70} L520 ${h - 80} L520 ${h - 60} L0 ${h - 50} Z" fill="#0b0d12" opacity=".95"/>
<path d="M60 ${h - 50} a30 30 0 0 1 60 0 M180 ${h - 52} a30 30 0 0 1 60 0 M300 ${h - 55} a30 30 0 0 1 60 0" fill="none" stroke="#0b0d12" stroke-width="18"/>
<rect x="0" y="${h - 90}" width="${w}" height="90" fill="url(#fade)"/>
</svg>`;
}

const out = path.join(process.cwd(), "public", "art");
fs.mkdirSync(out, { recursive: true });
for (const [rank, c] of Object.entries(RANKS)) {
  fs.writeFileSync(path.join(out, `crest-${rank}.svg`), crest(rank, c));
  fs.writeFileSync(path.join(out, `backdrop-${rank}.svg`), backdrop(rank, c));
}
console.log("art written to", out);
