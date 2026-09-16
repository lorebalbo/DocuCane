// build.mjs - read the documents, write the page.

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { listDocs, assignIds, buildDoc } from './collect.mjs';
import { vendorMermaid, vendorElk, vendorFont } from './vendor.mjs';
import { renderPage } from './page.mjs';

export async function build(cfg, { open = true, refresh = false, quiet = false } = {}) {
  const { docs } = collectDocs(cfg);

  const assets = await vendorAssets(cfg, refresh);
  const html = pageFor(cfg, docs, assets);

  const outFile = path.join(cfg.outDir, 'index.html');
  fs.writeFileSync(outFile, html);

  const report = {
    outFile,
    docs,
    bytes: fs.statSync(outFile).size,
    notes: { mermaid: assets.mermaid.note, elk: assets.elk.note, font: assets.font.note },
  };

  if (!quiet) print(cfg, report);
  if (open) openInBrowser(outFile);
  return report;
}

// The documents half of a build, kept apart from the page so the watcher can
// redo it after a save without redoing everything. Hand the previous memo back
// in and only files whose bytes changed are rendered again - unless the set of
// files itself changed, which can move where any link points, so then every
// document is rendered again.
export function collectDocs(cfg, memo = null) {
  if (!fs.existsSync(cfg.docsDir)) {
    throw new Error('No documents folder at ' + cfg.docsDir +
      '\nPoint the tool at one: docucane <folder>, or set "docs" in docs.config.json');
  }

  const entries = listDocs(cfg);
  if (!entries.length) {
    throw new Error('Nothing to render in ' + cfg.docsDir +
      '\nExpected files ending in ' + [...cfg.extensions, ...Object.keys(cfg.verbatim)].join(', '));
  }

  // ids first: cross-document links need to resolve to documents not yet built
  const byFile = assignIds(entries);
  const layout = JSON.stringify(entries.map((e) => [e.rel, e.group]));
  const reuse = memo && memo.layout === layout;
  const files = new Map();
  const changed = [];

  const docs = entries.map((e) => {
    const raw = fs.readFileSync(e.abs, 'utf8');
    const was = reuse && memo.files.get(e.rel);
    if (was && was.raw === raw) { files.set(e.rel, was); return was.doc; }
    let doc;
    try {
      doc = buildDoc(e, byFile, cfg, raw);
    } catch (err) {
      throw new Error(e.rel + ': ' + (err && err.message || err));
    }
    files.set(e.rel, { raw, doc });
    changed.push(doc.id);
    return doc;
  });

  return { docs, changed, memo: { layout, files } };
}

// ELK travels even when the default engine is mermaid: the reader can switch
// any single diagram over from the page, and that has to work offline too.
export async function vendorAssets(cfg, refresh = false) {
  fs.mkdirSync(cfg.outDir, { recursive: true });
  return {
    mermaid: await vendorMermaid(cfg.outDir, refresh),
    elk: await vendorElk(cfg.outDir, refresh),
    font: await vendorFont(cfg.outDir, refresh),
  };
}

export const stampNow = () => new Date().toLocaleString('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

export function pageFor(cfg, docs, assets, stamp = stampNow()) {
  return renderPage({
    cfg, docs,
    fontCss: assets.font.css,
    mermaidTag: assets.mermaid.tag,
    elkTag: assets.elk.tag,
    stamp,
  });
}

function print(cfg, r) {
  const pad = (s, n) => String(s).padEnd(n).slice(0, n);
  console.log(cfg.title);
  for (const d of r.docs) {
    console.log('  ' + String(d.badge).padStart(3) + '  ' + pad(d.title, 38) +
      String(d.sections.length).padStart(3) + ' sections' +
      (d.diagrams ? '  ' + d.diagrams + (d.diagrams > 1 ? ' diagrams' : ' diagram') : ''));
  }
  console.log('  mermaid: ' + r.notes.mermaid);
  console.log('  elk:     ' + r.notes.elk);
  console.log('  font:    ' + r.notes.font);
  console.log('  -> ' + r.outFile + '  (' + (r.bytes / 1024).toFixed(0) + ' KB)');
}

// `start` is a cmd built-in rather than a program, so on Windows it has to go
// through cmd; the empty first argument stops a quoted path being taken for
// the window title.
export function openInBrowser(target) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [target]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', target]]
    : ['xdg-open', [target]];
  execFile(cmd, args, (err) => { if (err) console.error('  (open failed: ' + err.message + ')'); });
}
