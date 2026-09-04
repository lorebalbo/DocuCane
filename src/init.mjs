// init.mjs - wire an existing project up to the dashboard.
//
// Writes a docs.config.json if there isn't one, and installs the Claude Code
// command and skills into the project's .claude/ folder so the agent working
// in that repo knows how to write and render its documents.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG_NAMES, titleCase } from './config.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, '..');

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyTree(a, b);
    else fs.copyFileSync(a, b);
  }
}

export function init(target, { docs = 'docs', title = null, force = false } = {}) {
  const root = path.resolve(target || process.cwd());
  const done = [];
  const skipped = [];

  const existing = CONFIG_NAMES.map((n) => path.join(root, n)).find((f) => fs.existsSync(f));
  const configFile = path.join(root, CONFIG_NAMES[0]);
  if (existing && !force) {
    skipped.push(path.relative(root, existing) + ' (already there)');
  } else {
    fs.writeFileSync(configFile, JSON.stringify({
      title: title || titleCase(path.basename(root)) + ' Docs',
      docs,
      out: '.docucane',
    }, null, 2) + '\n');
    done.push(path.relative(root, configFile));
  }

  const docsDir = path.resolve(root, docs);
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, '0. ABOUT.md'),
      '# ABOUT\n\n> What this project is, in plain language.\n\n---\n\n## Start here\n\nReplace this file with the real thing.\n');
    done.push(path.relative(root, docsDir) + '/');
  }

  // the agent-facing half: one command to render, two skills to write and audit
  const claude = path.join(root, '.claude');
  for (const [src, dest] of [
    [path.join(PKG, 'commands', 'docs.md'), path.join(claude, 'commands', 'docs.md')],
    [path.join(PKG, 'skills', 'write-doc'), path.join(claude, 'skills', 'write-doc')],
    [path.join(PKG, 'skills', 'audit-docs'), path.join(claude, 'skills', 'audit-docs')],
  ]) {
    if (!fs.existsSync(src)) continue;
    if (fs.existsSync(dest) && !force) { skipped.push(path.relative(root, dest) + ' (already there)'); continue; }
    if (fs.statSync(src).isDirectory()) copyTree(src, dest);
    else { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(src, dest); }
    done.push(path.relative(root, dest));
  }

  // keep the build output out of git
  const ignore = path.join(root, '.gitignore');
  if (fs.existsSync(ignore)) {
    const txt = fs.readFileSync(ignore, 'utf8');
    if (!txt.split('\n').some((l) => l.trim() === '.docucane/' || l.trim() === '.docucane')) {
      fs.appendFileSync(ignore, (txt.endsWith('\n') ? '' : '\n') + '.docucane/\n');
      done.push('.gitignore (+ .docucane/)');
    }
  }

  return { root, done, skipped };
}
