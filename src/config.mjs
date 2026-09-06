// config.mjs
// ------------------------------------------------------------------
// Everything the builder needs to know about one project, resolved from
// (in increasing priority): the defaults below, a docs.config.json found
// next to the documents or at the project root, and the command line.
//
// Zero configuration is a supported way to run: point the tool at a folder
// of Markdown and it renders.
// ------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';

export const CONFIG_NAMES = ['docs.config.json', '.docucane.json'];

const DEFAULTS = {
  // Shown in the sidebar, the browser tab, and used to namespace the
  // per-reader state (which document was open, folded sections, comments).
  title: null,                       // null -> derived from the project folder
  // Where the documents are, relative to the project root.
  docs: 'docs',
  // Where the built page goes, relative to the project root.
  out: '.docucane',
  // Files taken as documents. Markdown is rendered; everything else is shown
  // verbatim in a code block, which is how schema dumps stay readable.
  extensions: ['.md', '.markdown'],
  verbatim: {
    '.dbml': 'Schema',
    '.dbdiagram': 'Schema',
    '.sql': 'Schema',
    '.json': 'Data',
    '.yaml': 'Data',
    '.yml': 'Data',
    '.tsv': 'Data',
    '.csv': 'Data',
  },
  // The sidebar heading for documents sitting directly in the docs folder.
  rootGroup: 'Documents',
  // Sub-folders become their own group, named after the folder. List them here
  // to fix the order; anything not listed follows, alphabetically.
  groupOrder: [],
  diagrams: {
    // 'clean'   - re-lay flowcharts and ER diagrams out with ELK: right-angled
    //             routes, every edge label given its own reserved space and tied
    //             to its arc, and entities drawn as tables rather than grids.
    // 'mermaid' - mermaid's own renderer for everything.
    // Either way the reader can switch per diagram from the page.
    engine: 'clean',
    // Cap on how wide a node's text runs before it wraps, in pixels.
    nodeTextWidth: 210,
    edgeTextWidth: 200,
  },
  // Reader features. Turn off what a given project does not want.
  comments: true,
  search: true,
};

const titleCase = (s) => s
  .replace(/[-_]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/^\p{Ll}/u, (c) => c.toUpperCase());

function deepMerge(base, over) {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return over === undefined ? base : over;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = (v && typeof v === 'object' && !Array.isArray(v) && base && typeof base[k] === 'object')
      ? deepMerge(base[k], v)
      : v;
  }
  return out;
}

// Look for a config file next to the documents, then up the tree from there.
export function findConfig(startDir) {
  let dir = path.resolve(startDir);
  for (let hop = 0; hop < 12; hop++) {
    for (const name of CONFIG_NAMES) {
      const file = path.join(dir, name);
      if (fs.existsSync(file)) return file;
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

export function loadConfig({ root, docs, out, title, configPath, engine }) {
  let file = configPath ? path.resolve(configPath) : null;
  if (file && !fs.existsSync(file)) throw new Error('No config file at ' + file);
  if (!file) file = findConfig(root || process.cwd());

  let fromFile = {};
  if (file) {
    try {
      fromFile = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      throw new Error('Could not read ' + file + ': ' + err.message);
    }
  }

  // The project root is the config file's folder, or wherever we were pointed.
  const projectRoot = path.resolve(root || (file ? path.dirname(file) : process.cwd()));

  const cfg = deepMerge(DEFAULTS, fromFile);
  // `verbatim` is a list of what to include, not a bag of settings: writing one
  // replaces the defaults, so a project can narrow it rather than only add to it.
  if (fromFile.verbatim) cfg.verbatim = fromFile.verbatim;
  if (docs) cfg.docs = docs;
  if (out) cfg.out = out;
  if (title) cfg.title = title;
  if (engine) cfg.diagrams = { ...cfg.diagrams, engine };

  cfg.root = projectRoot;
  cfg.docsDir = path.resolve(projectRoot, cfg.docs);
  cfg.outDir = path.resolve(projectRoot, cfg.out);
  cfg.configFile = file;
  if (!cfg.title) cfg.title = titleCase(path.basename(projectRoot)) + ' Docs';

  // Namespace for everything the reader's browser remembers. Two dashboards
  // opened from file:// can otherwise land in the same storage bucket.
  cfg.ns = 'docucane:' + cfg.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  if (!['clean', 'mermaid'].includes(cfg.diagrams.engine)) {
    throw new Error("diagrams.engine must be 'clean' or 'mermaid', got: " + cfg.diagrams.engine);
  }
  return cfg;
}

export { DEFAULTS, titleCase };
