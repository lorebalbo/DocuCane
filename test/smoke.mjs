#!/usr/bin/env node
// smoke.mjs - build a throwaway folder of documents and assert the page came
// out whole. No test framework: this runs anywhere Node does.
//
//   node test/smoke.mjs

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.mjs';
import { build, collectDocs } from '../src/build.mjs';
import { watch } from '../src/watch.mjs';

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

// incremental: a save renders again only what it changed
const one = collectDocs(cfg);
fs.appendFileSync(path.join(docs, '10. TENTH.md'), '\nMore text.\n');
const two = collectDocs(cfg, one.memo);
ok(two.changed.join(',') === '10-tenth', 'an edit renders only the edited document again — got ' + two.changed.join(','));
ok(two.docs[0] === one.docs[0], 'an untouched document is reused as it was');
ok(collectDocs(cfg, two.memo).changed.length === 0, 'a save that changes nothing renders nothing');
fs.writeFileSync(path.join(docs, '2. SECOND.md'), '# SECOND\n\nText.\n');
ok(collectDocs(cfg, two.memo).changed.length === 6, 'a new file renders every document again, since links may now resolve');

// watch: the served page is live, the file on disk is not, and a save reaches the page
const live = await watch({ root: tmp, docs: 'docs', title: 'Smoke Docs' }, { port: 0, open: false, quiet: true });
const served = await (await fetch(live.url)).text();
ok(served.includes('__DOCUCANE_LIVE__'), 'the served page carries the live client');
ok(!fs.readFileSync(r.outFile, 'utf8').includes('__DOCUCANE_LIVE__'), 'index.html on disk stays a plain page');

const tenth = path.join(docs, '10. TENTH.md');
const seqOf = (st) => +st.version.split(':')[1];
const events = await eventStream(live.url + '__docucane/events');
const s1 = await events.next();
fs.writeFileSync(tenth, '# TENTH\n\n## A heading\n\nEdited.\n');
const s2 = await events.next();
ok(seqOf(s2) === seqOf(s1) + 1 && !s2.error && s2.shell === s1.shell, 'a save pushed one new version');
const data = await (await fetch(live.url + '__docucane/data.json')).json();
ok(data.version === s2.version && data.docs.find((d) => d.id === '10-tenth').html.includes('Edited.'),
  'the pushed data carries the edit');

fs.writeFileSync(tenth, '# TENTH\n\n## A heading\n\nEdited.\n');
await new Promise((done) => setTimeout(done, 500));
fs.writeFileSync(tenth, '# TENTH\n\n## A heading\n\nEdited twice.\n');
const s3 = await events.next();
ok(seqOf(s3) === seqOf(s2) + 1, 'a write that changes nothing pushes nothing');

fs.rmSync(path.join(docs, '2. SECOND.md'));
const s4 = await events.next();
ok(seqOf(s4) === seqOf(s3) + 1, 'removing a file pushed a new version');

fs.renameSync(docs, docs + '-away');
const s5 = await events.next();
ok(!!s5.error && seqOf(s5) === seqOf(s4), 'a missing folder is reported, and the last good version kept');
fs.renameSync(docs + '-away', docs);
const s6 = await events.next();
ok(!s6.error, 'the folder coming back clears the error');
events.close();
await live.close();

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n' + (failed ? failed + ' failed' : 'all good'));
process.exit(failed ? 1 : 0);

// The watcher's server-sent events, one at a time.
async function eventStream(url) {
  const ctrl = new AbortController();
  const res = await fetch(url, { signal: ctrl.signal });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const read = async () => {
    for (;;) {
      const m = buf.match(/event: state\ndata: (.*)\n\n/);
      if (m) { buf = buf.slice(m.index + m[0].length); return JSON.parse(m[1]); }
      const { value, done } = await reader.read();
      if (done) throw new Error('event stream closed');
      buf += dec.decode(value, { stream: true });
    }
  };
  return {
    next: () => Promise.race([read(), new Promise((_, no) => setTimeout(() => no(new Error('no event within 5s')), 5000))]),
    close: () => ctrl.abort(),
  };
}
