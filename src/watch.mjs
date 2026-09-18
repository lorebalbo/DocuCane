// watch.mjs - docucane --watch: serve the page, render it again on every save.
// ------------------------------------------------------------------
// The built page stays a file:// document that needs nothing; this is the
// writing-time half. The same page is served from localhost with a small live
// client added (client/live.mjs), the documents folder is watched, and a save
// renders again only the files whose bytes changed. The open page is told,
// pulls the new data and patches itself in place: the document being read
// keeps its scroll position, its folds and its comments, and a diagram whose
// source did not change is not laid out again. index.html on disk is kept
// current as well, so the file:// page never falls behind.
//
// Changes are detected by content, not by timestamp, so a sync client or an
// editor touching a file without changing it costs nothing and shows nothing.
// Editing docs.config.json reloads the configuration and the page with it.
// ------------------------------------------------------------------

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadConfig, CONFIG_NAMES, MARGIN_MIN, MARGIN_MAX } from './config.mjs';
import { collectDocs, vendorAssets, pageFor, stampNow, openInBrowser } from './build.mjs';
import { countLine } from './page.mjs';
import { LIVE_CSS, LIVE_JS } from './client/live.mjs';

export const DEFAULT_PORT = 4747;
// one save is often several writes (truncate, write, rename); act on the last
const SETTLE_MS = 120;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.woff2': 'font/woff2', '.pdf': 'application/pdf',
};

const clock = () => new Date().toTimeString().slice(0, 8) + '  ';
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);

export async function watch(configArgs, { port = DEFAULT_PORT, open = true, refresh = false, quiet = false } = {}) {
  let cfg = loadConfig(configArgs);
  let assets = await vendorAssets(cfg, refresh);
  let configRaw = readOr(cfg.configFile);
  let shell = shellOf(cfg, assets);

  const boot = crypto.randomBytes(3).toString('hex');
  let memo = null, docs = [], html = '', stamp = '', seq = 0, error = null;
  let watchers = [], settle = null, retry = null;
  const clients = new Set();
  const log = quiet ? () => {} : (msg) => console.log(clock() + msg);

  const state = () => ({ version: boot + ':' + seq, shell, error });
  const send = (res, s) => res.write('event: state\ndata: ' + JSON.stringify(s) + '\n\n');
  const broadcast = () => { const s = state(); for (const res of clients) send(res, s); };

  /* ------------------------------------------------------------ rebuilding */

  function rebuild() {
    const t0 = Date.now();
    let r;
    try {
      r = collectDocs(cfg, memo);
    } catch (err) {
      // the page keeps showing the last good build, with the reason beside it
      const msg = String(err && err.message || err);
      if (msg !== error) { error = msg; broadcast(); log('failed   ' + msg.split('\n')[0]); }
      if (!fs.existsSync(cfg.docsDir)) waitForFolder();
      return;
    }
    const ids = (list) => list.map((d) => d.id).join('\n');
    const reordered = ids(docs) !== ids(r.docs);
    memo = r.memo;
    if (seq && !r.changed.length && !reordered && !error) return;   // touched, not changed

    const gone = docs.filter((d) => !r.docs.some((n) => n.id === d.id));
    docs = r.docs;
    error = null;
    stamp = stampNow();
    html = pageFor(cfg, docs, assets, stamp);
    seq++;
    try {
      fs.writeFileSync(path.join(cfg.outDir, 'index.html'), html);
    } catch (err) {
      log('could not write index.html: ' + err.message);
    }
    broadcast();

    if (seq === 1) return;
    const what = r.changed.length > 3 ? r.changed.length + ' documents'
      : r.changed.map((id) => docs.find((d) => d.id === id).file)
        .concat(gone.map((d) => d.file + ' (removed)')).join(', ') || 'document order';
    log('updated  ' + what + '  (' + (Date.now() - t0) + ' ms)');
  }

  const soon = () => { clearTimeout(settle); settle = setTimeout(rebuild, SETTLE_MS); };

  async function reconfigure() {
    const raw = readOr(cfg.configFile);
    if (raw === configRaw) return;
    configRaw = raw;
    try {
      const next = loadConfig(configArgs);
      if (next.outDir !== cfg.outDir) assets = await vendorAssets(next);
      cfg = next;
      shell = shellOf(cfg, assets);   // a new shell tells open pages to reload
      memo = null;
      log('config   ' + (cfg.configFile ? path.basename(cfg.configFile) : 'defaults') + ' reloaded');
      arm();
      rebuild();
    } catch (err) {
      error = String(err && err.message || err);
      broadcast();
      log('failed   ' + error.split('\n')[0]);
    }
  }

  /* -------------------------------------------------------------- watching */

  function arm() {
    disarm();
    const outside = (name) => {
      if (!name) return false;
      const abs = path.resolve(cfg.docsDir, name);
      return name.split(/[\\/]/).some((seg) => seg.startsWith('.')) ||
        abs === cfg.outDir || abs.startsWith(cfg.outDir + path.sep);
    };
    try {
      watchers = watchTree(cfg.docsDir, (name) => { if (!outside(name)) soon(); }, waitForFolder);
    } catch {
      return waitForFolder();
    }

    // The folder's own parent: renaming or deleting the watched folder is not
    // reported from inside it (on Windows its watcher quietly follows it to the
    // new name), and the config file usually lives there too.
    const docsName = path.basename(cfg.docsDir);
    const configName = cfg.configFile && path.basename(cfg.configFile);
    const parents = new Set([path.dirname(cfg.docsDir)]);
    if (cfg.configFile) parents.add(path.dirname(cfg.configFile));
    for (const dir of parents) {
      try {
        const w = fs.watch(dir, (_, name) => {
          name = name && String(name);
          if (dir === path.dirname(cfg.docsDir) && (!name || name === docsName)) soon();
          if (configName && dir === path.dirname(cfg.configFile) && (!name || name === configName)) reconfigure();
        });
        w.on('error', () => {});
        watchers.push(w);
      } catch { /* the documents still update; only a rename or a config edit needs a restart */ }
    }
  }

  function disarm() {
    for (const w of watchers) { try { w.close(); } catch {} }
    watchers = [];
  }

  // The documents folder went away (renamed, moved, a sync client replacing
  // it): the page already says so. Let go of it - a watcher left on it would
  // follow it to its new name - and pick it up again once it is back.
  function waitForFolder() {
    if (retry) return;
    disarm();
    retry = setInterval(() => {
      if (!fs.existsSync(cfg.docsDir)) return;
      clearInterval(retry);
      retry = null;
      arm();
      rebuild();
    }, 1000);
  }

  /* --------------------------------------------------------------- serving */

  const withLive = (page) => {
    const tail = '<style>' + LIVE_CSS + '</style>\n' +
      '<script>window.__DOCUCANE_LIVE__=' + JSON.stringify(state()).replace(/</g, '\\u003c') + ';<\/script>\n' +
      '<script>' + LIVE_JS + '<\/script>\n';
    const at = page.lastIndexOf('</body>');
    return at < 0 ? page + tail : page.slice(0, at) + tail + page.slice(at);
  };

  /* -------------------------------------------------------------- settings */

  // The page's settings panel saves here. They are the project's settings, so
  // they go into its config file - created next to the documents' project if
  // there is none - and the page is rendered again with them. The page that
  // saved already shows them and takes the new shell from the reply; any
  // other open page reloads to pick them up.
  function saveSettings(req, res) {
    const json = (status, body) => reply(res, status, TYPES['.json'], JSON.stringify(body));
    if (req.method !== 'POST') return json(405, { error: 'POST only' });
    // only this page may change the project, not any site the browser has open
    const origin = req.headers.origin;
    if (origin && origin !== 'http://' + req.headers.host) return json(403, { error: 'Not from this page' });
    if (!/^application\/json\b/.test(req.headers['content-type'] || '')) return json(415, { error: 'JSON only' });

    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { body += chunk; if (body.length > 4096) req.destroy(); });
    req.on('end', () => {
      let next;
      try { next = JSON.parse(body); } catch { return json(400, { error: 'Not JSON' }); }
      const margin = next && next.margin;
      if (margin !== null && !(Number.isFinite(margin) && margin >= MARGIN_MIN && margin <= MARGIN_MAX)) {
        return json(400, { error: 'margin must be null or ' + MARGIN_MIN + '–' + MARGIN_MAX });
      }

      const file = cfg.configFile || path.join(cfg.root, CONFIG_NAMES[0]);
      const before = readOr(file);
      try {
        const obj = before == null ? {} : JSON.parse(before);
        const layout = { ...(obj.layout || {}) };
        if (margin === null) delete layout.margin; else layout.margin = Math.round(margin);
        if (Object.keys(layout).length) obj.layout = layout; else delete obj.layout;
        // written the way the file already was: its indent, its line endings
        const indent = (before && (before.match(/\n([ \t]+)"/) || [])[1]) || 2;
        const eol = before && before.includes('\r\n') ? '\r\n' : '\n';
        const text = (JSON.stringify(obj, null, indent) + '\n').replace(/\n/g, eol);
        if (text !== before) fs.writeFileSync(file, text);
        // the watcher will see the write: it is already applied, so let it pass
        configRaw = text;
        if (!cfg.configFile) configArgs = { ...configArgs, configPath: file };
        cfg = loadConfig(configArgs);
      } catch (err) {
        return json(500, { error: 'Could not update ' + path.basename(file) + ': ' + err.message });
      }

      shell = shellOf(cfg, assets);
      html = pageFor(cfg, docs, assets, stamp);
      try { fs.writeFileSync(path.join(cfg.outDir, 'index.html'), html); }
      catch (err) { log('could not write index.html: ' + err.message); }
      log('settings saved to ' + path.basename(file) + '  (margin ' + (margin === null ? 'automatic' : Math.round(margin) + ' px') + ')');
      json(200, { shell });
      broadcast();
    });
  }

  const server = http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { return reply(res, 400, 'text/plain; charset=utf-8', 'Bad request'); }

    if (p === '/__docucane/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write('retry: 1000\n\n');
      send(res, state());
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (p === '/__docucane/data.json') {
      return reply(res, 200, TYPES['.json'],
        JSON.stringify({ version: state().version, count: countLine(docs, stamp), docs }));
    }
    if (p === '/__docucane/settings') return saveSettings(req, res);
    if (p === '/' || p === '/index.html') {
      const page = html || '<!doctype html><meta charset="utf-8"><title>' + escHtml(cfg.title) +
        '</title><body><pre>' + escHtml(error || 'Building…') + '</pre></body>';
      return reply(res, 200, TYPES['.html'], withLive(page));
    }
    // the vendored scripts, then anything a document points at (images)
    const file = inside(cfg.outDir, p) || inside(cfg.docsDir, p);
    if (!file) return reply(res, 404, 'text/plain; charset=utf-8', 'Not found');
    reply(res, 200, TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', fs.readFileSync(file));
  });

  rebuild();
  if (!seq) throw new Error(error);
  arm();

  const url = await listen(server, port);
  const beat = setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25000);
  beat.unref();

  if (!quiet) {
    console.log(cfg.title);
    console.log('  ' + docs.length + (docs.length === 1 ? ' document' : ' documents') + ' from ' + cfg.docsDir);
    console.log('  mermaid: ' + assets.mermaid.note + '  ·  elk: ' + assets.elk.note + '  ·  font: ' + assets.font.note);
    console.log('  -> ' + path.join(cfg.outDir, 'index.html'));
    console.log('\n  live at ' + url + '   (Ctrl+C to stop)\n');
  }
  if (open) openInBrowser(url);

  const close = () => new Promise((resolve) => {
    clearInterval(beat);
    clearTimeout(settle);
    clearInterval(retry);
    disarm();
    for (const res of clients) res.end();
    clients.clear();
    server.close(() => resolve());
    if (server.closeAllConnections) server.closeAllConnections();
  });
  return { url, close };
}

/* ------------------------------------------------------------------ helpers */

// Recursive watching is native on Windows and macOS, and on Linux from Node 20.
// Elsewhere: the folder, plus each folder directly inside it - as deep as
// listDocs ever looks - following sub-folders as they come and go.
function watchTree(dir, onEvent, onError) {
  try {
    const w = fs.watch(dir, { recursive: true }, (_, name) => onEvent(name && String(name)));
    w.on('error', onError);
    return [w];
  } catch (err) {
    if (err.code !== 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM') throw err;
  }
  const subs = new Map();
  const follow = () => {
    const now = new Set(fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name));
    for (const [name, w] of subs) if (!now.has(name)) { w.close(); subs.delete(name); }
    for (const name of now) {
      if (subs.has(name)) continue;
      try {
        const w = fs.watch(path.join(dir, name), (_, f) => onEvent(name + '/' + (f || '')));
        w.on('error', () => {});
        subs.set(name, w);
      } catch { /* gone again already */ }
    }
  };
  const top = fs.watch(dir, (_, name) => {
    try { follow(); } catch { /* the folder itself is going; its watcher reports that */ }
    onEvent(name && String(name));
  });
  top.on('error', onError);
  follow();
  return [top, { close: () => { for (const w of subs.values()) w.close(); subs.clear(); } }];
}

// The page's shell is everything but the documents. When it changes - the
// configuration, or DocuCane itself after a restart - an open page reloads
// rather than patching.
function shellOf(cfg, assets) {
  return sha(pageFor(cfg, [], assets, '') + LIVE_CSS + LIVE_JS);
}

function listen(server, port, tries = 20) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.off('listening', onListening);
      if (err.code === 'EADDRINUSE' && port && tries > 1) resolve(listen(server, port + 1, tries - 1));
      else reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve('http://127.0.0.1:' + server.address().port + '/');
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

function inside(base, p) {
  const file = path.resolve(base, p.replace(/^[\\/]+/, ''));
  if (file !== base && !file.startsWith(base + path.sep)) return null;
  try { return fs.statSync(file).isFile() ? file : null; } catch { return null; }
}

function reply(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function readOr(file) {
  try { return file ? fs.readFileSync(file, 'utf8') : null; } catch { return null; }
}

const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
