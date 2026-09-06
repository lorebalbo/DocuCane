#!/usr/bin/env node
// docucane
// ------------------------------------------------------------------
// Render a folder of Markdown into one static, self-contained
// documentation dashboard and open it in the browser.
//
//   docucane                    build the folder in docs.config.json
//   docucane ./docs             build a folder, no configuration
//   docucane --no-open          build only
//   docucane --out <dir>        write somewhere else
//   docucane --refresh          re-download the vendored assets
//   docucane --engine mermaid   default every diagram to mermaid's layout
//   docucane init [dir]         wire a project up
//
// Output: <out>/index.html plus a vendor/ folder. The page is plain file://
// HTML - no server, no network, no npm dependencies.
// ------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../src/config.mjs';
import { build } from '../src/build.mjs';
import { init } from '../src/init.mjs';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const TAKES_VALUE = new Set(['--out', '--config', '--title', '--engine', '--docs']);
const positional = () => {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('-')) { if (TAKES_VALUE.has(argv[i])) i++; continue; }
    out.push(argv[i]);
  }
  return out;
};

const HELP = `docucane — render a folder of Markdown into one self-contained page

  docucane [folder] [options]
  docucane init [folder] [--docs <dir>] [--title <name>] [--force]

Options
  --out <dir>        where to write the page          (default .docucane)
  --config <file>    use this config file             (default docs.config.json, searched upwards)
  --title <name>     override the dashboard title
  --engine <name>    default diagram layout: clean | mermaid
  --no-open          build without launching a browser
  --refresh          re-download mermaid, ELK and the font
  -h, --help         this
`;

async function main() {
  if (flag('-h') || flag('--help')) { console.log(HELP); return; }

  const args = positional();

  if (args[0] === 'init') {
    const r = init(args[1], { docs: opt('--docs', 'docs'), title: opt('--title', null), force: flag('--force') });
    console.log('docucane init  ' + r.root);
    r.done.forEach((d) => console.log('  + ' + d));
    r.skipped.forEach((s) => console.log('  · ' + s));
    console.log('\nRender it with:  npx docucane');
    return;
  }

  // A bare folder argument is the documents folder, and skips configuration
  // entirely - "point it at a folder" has to be a real way to use this.
  let root = null, docs = null;
  if (args[0]) {
    const p = path.resolve(args[0]);
    if (!fs.existsSync(p)) throw new Error('No such folder: ' + p);
    if (!fs.statSync(p).isDirectory()) throw new Error('Not a folder: ' + p);
    root = path.dirname(p);
    docs = path.basename(p);
  }

  const cfg = loadConfig({
    root, docs,
    out: opt('--out', null),
    title: opt('--title', null),
    configPath: opt('--config', null),
    engine: opt('--engine', null),
  });

  await build(cfg, { open: !flag('--no-open'), refresh: flag('--refresh') });
}

main().catch((err) => {
  console.error(String(err && err.message || err));
  process.exit(1);
});
