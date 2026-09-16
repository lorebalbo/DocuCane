// collect.mjs
// ------------------------------------------------------------------
// Turn a folder of files into the ordered, grouped list the sidebar shows,
// then render each one.
//
// Ordering: a leading number wins ("2. CATALOG.md" before "10. TESTS.md",
// which a plain sort gets backwards); everything else follows alphabetically.
// Grouping: files sitting in the folder itself are one group, each sub-folder
// is another named after itself, and anything that is not Markdown is grouped
// by what it is (a schema dump, a data file) rather than shown as prose.
// ------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { esc, plain, slugify, inline, parkFences, renderBlocks } from './markdown.mjs';
import { nestSections, SECNUM_RE } from './sections.mjs';
import { titleCase } from './config.mjs';

function orderKey(name) {
  const m = name.match(/^(\d+)/);
  return m ? String(+m[1]).padStart(4, '0') : 'zzz' + name.toLowerCase();
}

const extOf = (f) => (f.match(/\.[^.]+$/) || [''])[0].toLowerCase();

function readDir(dir) {
  if (!fs.existsSync(dir)) return { files: [], dirs: [] };
  const entries = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => !e.name.startsWith('.'));
  return {
    files: entries.filter((e) => e.isFile()).map((e) => e.name),
    dirs: entries.filter((e) => e.isDirectory()).map((e) => e.name),
  };
}

export function listDocs(cfg) {
  const known = new Set([...cfg.extensions, ...Object.keys(cfg.verbatim)].map((e) => e.toLowerCase()));
  const isDoc = (f) => cfg.extensions.includes(extOf(f));
  const pick = (dir, rel) => readDir(dir).files
    .filter((f) => known.has(extOf(f)))
    .map((f) => ({ file: f, abs: path.join(dir, f), rel: rel ? rel + '/' + f : f }))
    .sort((a, b) => orderKey(a.file).localeCompare(orderKey(b.file)));

  const { dirs } = readDir(cfg.docsDir);
  const root = pick(cfg.docsDir, '');

  const out = [];
  // 1. the documents themselves
  for (const d of root.filter((d) => isDoc(d.file))) out.push({ ...d, group: cfg.rootGroup });

  // 2. one group per sub-folder, in the configured order then alphabetically
  const rank = (name) => {
    const i = cfg.groupOrder.findIndex((g) => g.toLowerCase() === name.toLowerCase());
    return i < 0 ? cfg.groupOrder.length : i;
  };
  const subs = dirs.slice().sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  for (const sub of subs) {
    const label = titleCase(sub);
    for (const d of pick(path.join(cfg.docsDir, sub), sub)) out.push({ ...d, group: label });
  }

  // 3. whatever is not a document, grouped by what it is
  for (const d of root.filter((d) => !isDoc(d.file))) {
    out.push({ ...d, group: cfg.verbatim[extOf(d.file)] || 'Files' });
  }
  return out;
}

// Documents are addressed two ways: by the path a link actually writes
// ("./audits/one.md") and, for convenience, by bare filename ("one.md") - the
// second only where it is unambiguous, so two files called the same thing in
// different folders never silently resolve to each other.
export function assignIds(entries) {
  const taken = new Set();
  const map = new Map();
  const seenName = new Map();
  for (const e of entries) seenName.set(e.file, (seenName.get(e.file) || 0) + 1);

  for (const e of entries) {
    const stem = (seenName.get(e.file) > 1 ? e.rel : e.file).replace(/\.[^.]+$/, '');
    let id = slugify(stem.replace(/\//g, '-')) || 'doc';
    let n = 2;
    const base = id;
    while (taken.has(id)) id = base + '-' + n++;
    taken.add(id);
    map.set(e.rel, id);
    if (seenName.get(e.file) === 1) map.set(e.file, id);
  }
  return map;
}

export function buildDoc(entry, byFile, cfg, raw = fs.readFileSync(entry.abs, 'utf8')) {
  const name = entry.file.replace(/\.[^.]+$/, '');
  const id = byFile.get(entry.file);
  const seen = new Map();
  const ctx = {
    blocks: [], headings: [], byFile, numbers: new Map(),
    uniqueSlug(base) {
      const key = base || 'section';
      const n = seen.get(key) || 0;
      seen.set(key, n + 1);
      return n ? key + '-' + n : key;
    },
  };

  let title = name, subtitle = '', html;

  if (cfg.extensions.includes(extOf(entry.file))) {
    const lines = parkFences(raw, ctx);

    // H1 becomes the page title
    const h1 = lines.findIndex((l) => /^# +\S/.test(l));
    if (h1 >= 0) {
      title = plain(lines[h1].replace(/^# +/, ''));
      lines.splice(h1, 1);
    }

    // the lede paragraph of the blockquote under it becomes the subtitle
    let j = 0;
    while (j < lines.length && !lines[j].trim()) j++;
    if (j < lines.length && /^ {0,3}>/.test(lines[j])) {
      const lede = [];
      while (j < lines.length && /^ {0,3}>/.test(lines[j]) && lines[j].replace(/^ {0,3}> ?/, '').trim()) {
        lede.push(lines[j].replace(/^ {0,3}> ?/, '').trim());
        j++;
      }
      subtitle = inline(lede.join(' '), ctx);
      lines.splice(0, j);
    }

    html = nestSections(renderBlocks(lines, ctx, true), ctx);
  } else {
    const kind = extOf(entry.file).slice(1);
    subtitle = 'Kept verbatim as <code>' + esc(kind) + '</code>.';
    html = '<div class="code-wrap"><span class="code-lang">' + esc(kind) +
      '</span><pre class="code"><code>' + esc(raw) + '</code></pre></div>';
  }

  const badge = (name.match(/^(\d+)/) || [])[1] || (name.trim()[0] || '?').toUpperCase();

  return {
    id, title, subtitle, html, badge,
    group: entry.group,
    file: entry.rel || entry.file,
    words: raw.split(/\s+/).filter(Boolean).length,
    // counted from the rendered page, not from the fences found: a diagram
    // inside an HTML comment is parked like any other but never emitted
    diagrams: (html.match(/data-diagram/g) || []).length,
    sections: ctx.headings.filter((h) => h.level <= 2).map((h) => {
      const num = ctx.numbers.get(h.id) || '';
      const own = h.text.match(SECNUM_RE);
      return { id: h.id, num, text: own && own[1] === num ? h.text.slice(own[0].length) : h.text };
    }),
  };
}
