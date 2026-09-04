// vendor.mjs
// ------------------------------------------------------------------
// The page is a single file:// document with no server and no npm install,
// so everything it needs travels with it. Each asset is fetched once and
// cached under <out>/vendor; --refresh re-fetches.
//
// If a fetch fails the build still succeeds: mermaid falls back to its CDN
// (the page then needs a network connection), ELK simply is not offered
// (flowcharts render with mermaid), and the font falls back to the system.
// ------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';

// Pinned on purpose: a diagram that renders today should render the same way
// in a year, and a surprise major version should not land in someone's docs.
export const MERMAID_VERSION = '11.17.2';
export const ELK_VERSION = '0.12.0';

const MERMAID_URL = `https://cdn.jsdelivr.net/npm/mermaid@${MERMAID_VERSION}/dist/mermaid.min.js`;
const ELK_URL = `https://cdn.jsdelivr.net/npm/elkjs@${ELK_VERSION}/lib/elk.bundled.js`;
const FONT_URL = 'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap';
// Google Fonts serves woff2 only to a browser-shaped User-Agent
const FONT_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function vendorScript({ url, rel, outDir, refresh, optional }) {
  const dest = path.join(outDir, rel);
  if (fs.existsSync(dest) && !refresh) return { tag: rel, note: 'cached' };
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    return { tag: rel, note: 'downloaded (' + (buf.length / 1024 / 1024).toFixed(1) + ' MB)' };
  } catch (err) {
    if (optional) return { tag: null, note: 'unavailable (' + err.message + ')' };
    return { tag: url, note: 'CDN fallback (' + err.message + ')' };
  }
}

export const vendorMermaid = (outDir, refresh) =>
  vendorScript({ url: MERMAID_URL, rel: 'vendor/mermaid.min.js', outDir, refresh });

export const vendorElk = (outDir, refresh) =>
  vendorScript({ url: ELK_URL, rel: 'vendor/elk.bundled.js', outDir, refresh, optional: true });

// Inter, as a variable font inlined into the page. A file:// origin will not
// fetch a font over CORS even from the folder next to it, so the woff2 has to
// travel as a data: URI; the .css cache next door keeps rebuilds offline.
export async function vendorFont(outDir, refresh) {
  const cache = path.join(outDir, 'vendor', 'inter.css');
  if (fs.existsSync(cache) && !refresh) return { css: fs.readFileSync(cache, 'utf8'), note: 'cached' };
  try {
    const res = await fetch(FONT_URL, { headers: { 'User-Agent': FONT_UA } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const faces = [];
    for (const block of (await res.text()).split('@font-face').slice(1)) {
      // latin only - the other subsets triple the page for glyphs no doc uses
      if (!/unicode-range:[^;]*U\+0000-00FF/.test(block)) continue;
      const url = (block.match(/url\((https:[^)]+)\)/) || [])[1];
      if (!url) continue;
      const file = await fetch(url, { headers: { 'User-Agent': FONT_UA } });
      if (!file.ok) throw new Error('HTTP ' + file.status);
      faces.push('@font-face{font-family:Inter;font-weight:100 900;font-display:swap;font-style:' +
        (/font-style:\s*italic/.test(block) ? 'italic' : 'normal') +
        ';src:url(data:font/woff2;base64,' + Buffer.from(await file.arrayBuffer()).toString('base64') +
        ') format("woff2")}');
    }
    if (!faces.length) throw new Error('no latin subset in the stylesheet');
    const css = faces.join('\n');
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    fs.writeFileSync(cache, css);
    return { css, note: 'downloaded (' + (Buffer.byteLength(css) / 1024).toFixed(0) + ' KB inlined)' };
  } catch (err) {
    return { css: '', note: 'system fallback (' + err.message + ')' };
  }
}
