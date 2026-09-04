#!/usr/bin/env node
// smoke.mjs - build a throwaway folder of documents and assert the page came
// out whole. No test framework: this runs anywhere Node does.
//
//   node test/smoke.mjs

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.mjs';
import { build } from '../src/build.mjs';

let failed = 0;
const ok = (cond, what) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + what);
  if (!cond) failed++;
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docucane-'));
const docs = path.join(tmp, 'docs');
fs.mkdirSync(path.join(docs, 'audits'), { recursive: true });

fs.writeFileSync(path.join(docs, '1. FIRST.md'), `# FIRST

> The lede of the first document.

---

## 1. A section

Prose with **bold**, *italic*, \`code\`, a [link](./10.%20TENTH.md#a-heading) and a url
<https://example.com>.

| Column | Other |
|---|:--:|
| a \`|\` pipe | b |

- a list
  - nested
- and more

\`\`\`mermaid
flowchart TD
    A["Start"] --> B{"Choose"}
    B -->|"yes"| C["Ship it"]
    B -->|"no"| D["Fix it"]
    D --> B
    subgraph G ["A group"]
      C --> E[("Store")]
    end
    E -.-> F(["Done"])
    classDef warn fill:#fee
    class D warn
\`\`\`

<!-- this comment must not render -->
`);

fs.writeFileSync(path.join(docs, '10. TENTH.md'), '# TENTH\n\n## A heading\n\nText.\n');
fs.writeFileSync(path.join(docs, 'ZZ NO NUMBER.md'), '# UNNUMBERED\n\nText.\n');
fs.writeFileSync(path.join(docs, 'audits', 'one.md'), '# AN AUDIT\n\nText.\n');
fs.writeFileSync(path.join(docs, 'schema.dbml'), 'Table users {\n  id uuid\n}\n');

console.log('docucane smoke test\n  ' + tmp + '\n');

const cfg = loadConfig({ root: tmp, docs: 'docs', title: 'Smoke Docs' });
const r = await build(cfg, { open: false, quiet: true });
const html = fs.readFileSync(r.outFile, 'utf8');
const ids = r.docs.map((d) => d.id);

ok(r.docs.length === 5, 'all five files were picked up');
ok(ids.join(',') === '1-first,10-tenth,zz-no-number,one,schema',
  'ordered by leading number, then unnumbered, then sub-folders, then verbatim files — got ' + ids.join(','));
ok(r.docs[0].title === 'FIRST', 'the H1 became the title');
ok(r.docs[0].subtitle.includes('lede'), 'the blockquote became the standfirst');
ok(!r.docs[0].html.includes('<h1'), 'the H1 is not repeated in the body');
ok(r.docs.find((d) => d.id === 'one').group === 'Audits', 'a sub-folder became its own group');
ok(r.docs.find((d) => d.id === 'schema').group === 'Schema', 'a .dbml file landed in Schema');
ok(r.docs[0].diagrams === 1, 'the mermaid fence was counted as a diagram');
ok(r.docs[0].html.includes('data-diagram'), 'the diagram survived into the page');
ok(r.docs[0].html.includes('href="#/10-tenth/a-heading"'), 'a cross-document link became a route');
ok(r.docs[0].html.includes('<table>'), 'the table rendered');
ok(!r.docs[0].html.includes('must not render'), 'the HTML comment was stripped');
ok(r.docs[0].html.includes('<section class="sec"'), 'headings own their sections');

ok(html.includes('vendor/mermaid.min.js') || html.includes('cdn.jsdelivr'), 'mermaid is referenced');
ok(html.includes('__DOCUCANE__'), 'the runtime config is in the page');
ok(html.includes('Smoke Docs'), 'the title reached the page');
ok(!/<script>\s*<\/script>/.test(html), 'no empty inline script blocks were emitted');
ok(html.split('<script').length - 1 >= 4, 'every script block is present');
ok(r.bytes > 50_000, 'the page has real content in it (' + (r.bytes / 1024).toFixed(0) + ' KB)');

// a second build must not need the network, and must be identical bar the timestamp
const again = await build(cfg, { open: false, quiet: true });
const strip = (s) => s.replace(/\d{2} \w{3} \d{4}, \d{2}:\d{2}/g, 'STAMP');
ok(strip(fs.readFileSync(again.outFile, 'utf8')) === strip(html), 'rebuilds are deterministic');
ok(/cached/.test(again.notes.mermaid), 'the second build used the cached mermaid');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n' + (failed ? failed + ' failed' : 'all good'));
process.exit(failed ? 1 : 0);
