// markdown.mjs
// ------------------------------------------------------------------
// A small, dependency-free Markdown renderer, tuned for the kind of
// document this dashboard shows: prose, tables, fenced code, mermaid
// diagrams, and links that point at sibling documents.
//
// It is deliberately not a general-purpose CommonMark implementation.
// It handles the constructs documents actually use, and leaves anything
// exotic as literal text rather than guessing.
// ------------------------------------------------------------------

import path from 'node:path';

// Printable, collision-proof placeholders used while parsing.
const SPAN_OPEN = '@@span7f3a:';
const SPAN_CLOSE = '@@';
const BLOCK_RE = /^@@block7f3a:(\d+)@@$/;
const SPAN_RE = /@@span7f3a:(\d+)@@/g;

// What a diagram's header calls it: its kind, and the title its front matter
// gives it, if any (a `title:` between two `---` lines, as mermaid reads it).
const DIAGRAM_KINDS = {
  flowchart: 'Flowchart', graph: 'Flowchart', erdiagram: 'ER diagram', sequencediagram: 'Sequence diagram',
  classdiagram: 'Class diagram', statediagram: 'State diagram', 'statediagram-v2': 'State diagram',
  gantt: 'Gantt chart', pie: 'Pie chart', journey: 'User journey', mindmap: 'Mind map',
  timeline: 'Timeline', gitgraph: 'Git graph', quadrantchart: 'Quadrant chart',
};
function diagramName(code) {
  let title = '';
  const body = String(code).replace(/^\s*---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/, (_, fm) => {
    const t = fm.match(/^\s*title\s*:\s*(.+?)\s*$/m);
    if (t) title = t[1].replace(/^(["'])(.*)\1$/, '$2');
    return '';
  });
  const first = body.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith('%%')) || '';
  const kind = DIAGRAM_KINDS[first.split(/\s/)[0].toLowerCase()] || 'Diagram';
  return '<span class="diagram-name"><span class="diagram-kind">' + esc(kind) + '</span>' +
    (title ? '<span class="diagram-title">' + esc(title) + '</span>' : '') + '</span>';
}

export const esc = (s) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// GitHub-compatible heading slugs, so ./3.%20SCHEMA.md#op-7 resolves.
export function slugify(text) {
  return text.trim().toLowerCase()
    .replace(/[^\p{L}\p{N}\-_ ]+/gu, '')
    .replace(/ /g, '-');   // one hyphen per space, exactly like GitHub
}

// Heading text minus its markdown formatting (for slugs and the sidebar tree).
export const plain = (s) => s
  .replace(/`([^`]*)`/g, '$1')
  .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/<[^>]+>/g, '')
  .replace(/\*+/g, '')
  .replace(/~~/g, '')
  .replace(/(^|[^\w\\])_+(?!\s)([^_\n]+?)(?<!\s)_+(?!\w)/g, '$1$2')  // _emphasis_, never user_private
  .trim();

/* ------------------------------------------------------- inline markdown */

export function inline(src, ctx) {
  const stash = [];
  const put = (html) => SPAN_OPEN + (stash.push(html) - 1) + SPAN_CLOSE;

  // 1. code spans first - nothing inside them is markdown
  let s = src.replace(/(`+)([\s\S]*?)\1/g, (_, _t, code) => put('<code>' + esc(code.trim()) + '</code>'));

  // 2. the only raw HTML documents are expected to use: link targets and hard breaks
  s = s.replace(/<a id="([\w.-]+)"><\/a>/g, (_, id) => put('<a id="' + id + '"></a>'));
  s = s.replace(/<br\s*\/?>/gi, () => put('<br>'));

  // 3. everything that survives is text
  s = esc(s);

  // 4. images, then links (both become opaque so later rules cannot touch them)
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g,
    (_, alt, url) => put('<img src="' + url + '" alt="' + alt + '" loading="lazy">'));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g,
    (_, text, href) => put(link(href, text, ctx)));
  s = s.replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g,
    (_, url) => put('<a href="' + url + '" target="_blank" rel="noreferrer">' + url + '</a>'));

  // 5. emphasis
  s = s.replace(/~~([\s\S]+?)~~/g, '<del>$1</del>');
  s = s.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^\w])__(\S[\s\S]*?\S|\S)__(?!\w)/g, '$1<strong>$2</strong>');
  s = s.replace(/(^|[^*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^\w\\])_(?!\s)([^_\n]+?)(?<!\s)_(?!\w)/g, '$1<em>$2</em>');

  // 6. bare urls left in plain text
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:])/g,
    (_, pre, url) => pre + '<a href="' + url + '" target="_blank" rel="noreferrer">' + url + '</a>');

  // restore repeatedly: a link's own text can hold stashed code spans
  for (let pass = 0; pass < 12 && s.includes(SPAN_OPEN); pass++) {
    s = s.replace(SPAN_RE, (_, i) => stash[+i]);
  }
  return s;
}

// Rewrite links between documents into dashboard routes; leave the rest alone.
function link(href, text, ctx) {
  const raw = href.replace(/^&quot;|&quot;$/g, '');
  if (raw.startsWith('#')) return '<a href="' + raw + '" class="x-anchor">' + text + '</a>';
  if (/^[a-z]+:/i.test(raw)) return '<a href="' + raw + '" target="_blank" rel="noreferrer">' + text + '</a>';

  // "./audits/one.md" first, then the bare filename - see assignIds
  const [file, hash] = decodeURIComponent(raw).split('#');
  const rel = file.replace(/^\.\//, '').replace(/^\//, '');
  const id = ctx.byFile.get(rel) || ctx.byFile.get(path.basename(file));
  if (id) return '<a href="#/' + id + (hash ? '/' + hash : '') + '" class="x-doc">' + text + '</a>';
  return '<a href="' + raw + '">' + text + '</a>';
}

/* -------------------------------------------------------- block markdown */

function splitRow(line) {
  const cells = [];
  let cur = '', tick = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\' && line[i + 1] === '|') { cur += '|'; i++; continue; }
    if (ch === '`') {
      let n = 0; while (line[i + n] === '`') n++;
      if (tick === 0) tick = n; else if (tick === n) tick = 0;
      cur += '`'.repeat(n); i += n - 1; continue;
    }
    if (ch === '|' && tick === 0) { cells.push(cur); cur = ''; continue; }
    cur += ch;
  }
  cells.push(cur);
  if (cells.length && !cells[0].trim()) cells.shift();
  if (cells.length && !cells[cells.length - 1].trim()) cells.pop();
  return cells.map((c) => c.trim());
}

const isDelim = (line) => {
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
};
const listMark = (line) => line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
const indentOf = (line) => (line.match(/^\s*/) || [''])[0].length;

export function renderBlocks(lines, ctx, asArray) {
  const out = [];
  let i = 0;

  const para = [];
  const flush = () => {
    if (!para.length) return;
    out.push('<p>' + inline(para.join('\n'), ctx) + '</p>');
    para.length = 0;
  };

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { flush(); i++; continue; }

    // fenced code / mermaid, parked earlier as a placeholder line
    const park = line.match(BLOCK_RE);
    if (park) { flush(); out.push(ctx.blocks[+park[1]]); i++; continue; }

    const head = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (head) {
      flush();
      const level = head[1].length;
      const text = head[2];
      const id = ctx.uniqueSlug(slugify(plain(text)));
      ctx.headings.push({ id, level, text: plain(text) });
      out.push('<h' + level + ' id="' + id + '">' +
        '<a class="h-anchor" href="#' + id + '" aria-hidden="true">#</a>' +
        inline(text, ctx) + '</h' + level + '>');
      i++; continue;
    }

    if (/^ {0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push('<hr>'); i++; continue; }

    if (/^ {0,3}>/.test(line)) {
      flush();
      const buf = [];
      while (i < lines.length && (/^ {0,3}>/.test(lines[i]) || (buf.length && lines[i].trim() && !listMark(lines[i])))) {
        buf.push(lines[i].replace(/^ {0,3}> ?/, ''));
        i++;
      }
      out.push('<blockquote>' + renderBlocks(buf, ctx) + '</blockquote>');
      continue;
    }

    // table: a pipe row followed by a delimiter row
    if (line.includes('|') && i + 1 < lines.length && isDelim(lines[i + 1])) {
      flush();
      const header = splitRow(line);
      const align = splitRow(lines[i + 1]).map((c) =>
        c.endsWith(':') ? (c.startsWith(':') ? 'center' : 'right') : (c.startsWith(':') ? 'left' : ''));
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { rows.push(splitRow(lines[i])); i++; }
      const at = (n) => (align[n] ? ' style="text-align:' + align[n] + '"' : '');
      const th = header.map((c, n) => '<th' + at(n) + '>' + inline(c, ctx) + '</th>').join('');
      const tb = rows.map((r) =>
        '<tr>' + header.map((_, n) => '<td' + at(n) + '>' + inline(r[n] || '', ctx) + '</td>').join('') + '</tr>').join('');
      out.push('<div class="table-wrap"><table><thead><tr>' + th + '</tr></thead><tbody>' + tb + '</tbody></table></div>');
      continue;
    }

    const mark = listMark(line);
    if (mark) {
      flush();
      const base = mark[1].length;
      const ordered = /\d/.test(mark[2]);
      const buf = [];
      while (i < lines.length) {
        const l = lines[i];
        if (!l.trim()) {
          // a blank line only ends the list if the next line leaves it
          const next = lines[i + 1];
          if (next === undefined) break;
          if (next.trim() && indentOf(next) <= base && !listMark(next)) break;
          buf.push(l); i++; continue;
        }
        if (indentOf(l) < base) break;
        if (indentOf(l) === base && !listMark(l) && buf.length) break;
        buf.push(l); i++;
      }
      while (buf.length && !buf[buf.length - 1].trim()) buf.pop();
      out.push(renderList(buf, base, ordered, ctx));
      continue;
    }

    para.push(line);
    i++;
  }

  flush();
  return asArray ? out : out.join('\n');
}

function renderList(lines, base, ordered, ctx) {
  const items = [];
  let cur = null;
  for (const l of lines) {
    const m = listMark(l);
    if (m && m[1].length === base) {
      if (cur) items.push(cur);
      cur = [m[3]];
    } else if (cur) {
      cur.push(l.length >= base ? l.slice(base) : l.trim());
    }
  }
  if (cur) items.push(cur);

  const html = items.map((item) => {
    // dedent continuation lines to the item's own content column
    const body = [item[0], ...item.slice(1).map((l) => l.replace(/^ {1,4}/, ''))];
    let h = renderBlocks(body, ctx);
    if (/^<p>[\s\S]*<\/p>$/.test(h) && h.indexOf('<p>', 1) === -1 && !/<(ul|ol|pre|table|blockquote|h[1-6]|div)/.test(h)) {
      h = h.slice(3, -4);
    }
    return '<li>' + h + '</li>';
  }).join('');

  return ordered ? '<ol>' + html + '</ol>' : '<ul>' + html + '</ul>';
}

/* ------------------------------------------------------------ fenced code */

// Pull fenced blocks out before line parsing so their contents stay literal.
export function parkFences(md, ctx) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(/^ {0,3}(`{3,}|~{3,})\s*([\w-]*)/);
    if (!open) { out.push(lines[i]); continue; }
    const fence = open[1][0].repeat(open[1].length);
    const lang = (open[2] || '').toLowerCase();
    const body = [];
    i++;
    while (i < lines.length && !new RegExp('^ {0,3}' + fence[0] + '{' + fence.length + ',}\\s*$').test(lines[i])) {
      body.push(lines[i]); i++;
    }
    const code = body.join('\n');
    const n = ctx.blocks.push(
      lang === 'mermaid'
        ? '<figure class="diagram" data-diagram><pre class="diagram-src">' + esc(code) + '</pre>' +
          '<div class="diagram-head">' + diagramName(code) +
            '<div class="diagram-bar">' +
              '<button class="diagram-btn" data-act="fold" type="button" title="Fold the diagram away">Collapse</button>' +
              '<button class="diagram-btn" data-act="zoom" type="button" title="Open full size">Expand</button>' +
              '<button class="diagram-btn" data-act="engine" type="button" title="Switch layout engine"></button>' +
            '</div>' +
          '</div>' +
          '<div class="diagram-out"></div></figure>'
        : '<div class="code-wrap">' + (lang ? '<span class="code-lang">' + esc(lang) + '</span>' : '') +
          '<pre class="code"><code>' + esc(code) + '</code></pre></div>'
    ) - 1;
    out.push('@@block7f3a:' + n + '@@');
  }
  // An HTML comment is hidden content, not text. Strip it here - after the
  // fences are parked, so a comment inside a code block survives - and a
  // commented-out section renders as nothing at all.
  return out.join('\n').replace(/<!--[\s\S]*?-->/g, '').split('\n');
}
