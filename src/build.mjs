// build.mjs - read the documents, write the page.

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { listDocs, assignIds, buildDoc } from './collect.mjs';
import { vendorMermaid, vendorElk, vendorFont } from './vendor.mjs';
import { renderPage } from './page.mjs';

export async function build(cfg, { open = true, refresh = false, quiet = false } = {}) {
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
  const docs = entries.map((e) => buildDoc(e, byFile, cfg));

  fs.mkdirSync(cfg.outDir, { recursive: true });
  // ELK travels even when the default engine is mermaid: the reader can switch
  // any single diagram over from the page, and that has to work offline too.
  const mermaid = await vendorMermaid(cfg.outDir, refresh);
  const elk = await vendorElk(cfg.outDir, refresh);
  const font = await vendorFont(cfg.outDir, refresh);

  const stamp = new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const html = renderPage({
    cfg, docs,
    fontCss: font.css,
    mermaidTag: mermaid.tag,
    elkTag: elk.tag,
    stamp,
  });

  const outFile = path.join(cfg.outDir, 'index.html');
  fs.writeFileSync(outFile, html);

  const report = {
    outFile,
    docs,
    bytes: fs.statSync(outFile).size,
    notes: { mermaid: mermaid.note, elk: elk.note, font: font.note },
  };

  if (!quiet) print(cfg, report);
  if (open) openInBrowser(outFile);
  return report;
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

function openInBrowser(file) {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start' : 'xdg-open';
  execFile(cmd, [file], (err) => { if (err) console.error('  (open failed: ' + err.message + ')'); });
}
