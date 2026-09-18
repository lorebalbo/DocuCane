// diagrams.mjs - the client-side diagram engine, inlined into the page.
//
// Two renderers live here.
//
//   mermaid  - mermaid's own, used for every diagram type the other one does
//              not cover (state, class, gantt, pie, ...) and as the fallback
//              whenever the other one cannot do the job.
//
//   clean    - flowcharts, ER diagrams and sequence diagrams. Mermaid parses
//              the source, ELK lays a graph out (a sequence is laid out here,
//              lane by lane), and this file draws the result.
//
// Why not just use mermaid for flowcharts: mermaid lays them out with dagre and
// routes edges as curves, which on a dense chart produces crossing arcs and edge
// labels dropped wherever they happen to land - often on top of each other, or
// nearer a stranger's arc than their own. The reader then cannot tell which text
// belongs to which arrow, which is the one thing that makes a dense flowchart
// unreadable.
//
// ELK's layered algorithm fixes that at the source, in three ways:
//   - orthogonal routing: arcs run in straight lines with right-angle bends
//     and share lanes, instead of sweeping across the drawing as curves;
//   - reserved label space: an edge label is a first-class object in the
//     layout, so the algorithm sets room aside for it. Nothing is placed on
//     top of a label, and a label is never dropped onto a stranger's arc;
//   - crossing minimisation as a real objective rather than a side effect.
//
// Layout alone still leaves one ambiguity: six parallel arcs with six labels
// beside them. So each label is also tied to its own arc by a hairline ending
// in a dot ON that arc, and hovering either the label or the arc lights the
// pair while dimming everything else. Between the two, "which arrow is this
// text on" stops being a guess.
//
// ER diagrams have both of those problems - mermaid routes relationships as
// curves and drops the role name near the middle - plus one of their own: an
// entity is a table, and drawing it as a grid of equal cells means nothing
// lines up, so every attribute has to be read word by word. They come through
// the same pipeline because mermaid hands back the same shape of model for
// both, and the entity is drawn as a real table: type and name in columns, the
// keys pinned to the right edge so PK/FK/UK form a column of their own, and a
// crow's foot at each end of every relationship.
//
// None of this is required. With no ELK on the page every diagram renders
// through mermaid, and the reader can switch any single diagram back to
// mermaid's layout from the diagram itself.

export const DIAGRAMS_JS = String.raw`
(function(){
  var CFG = window.__DOCUCANE__ || {};
  var NS = 'http://www.w3.org/2000/svg';
  var seq = 0;
  var elk = null;
  var mermaidReady = false;

  function sel(v){ return (window.CSS && CSS.escape) ? CSS.escape(v) : String(v).replace(/["\\]/g,'\\$&'); }

  function mk(tag, attrs, cls){
    var e = document.createElementNS(NS, tag);
    if (cls) e.setAttribute('class', cls);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    return e;
  }
  function el(tag, cls, text){
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ------------------------------------------------------------ mermaid */

  function initMermaid(){
    if (mermaidReady || typeof mermaid === 'undefined') return mermaidReady;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'base',
      fontFamily: getComputedStyle(document.body).fontFamily,
      themeVariables: {
        fontSize: '13px',
        background: '#ffffff',
        primaryColor: '#f6f7f9', primaryBorderColor: '#c9ced8', primaryTextColor: '#121723',
        secondaryColor: '#ffffff', secondaryBorderColor: '#d5d9e0', secondaryTextColor: '#121723',
        tertiaryColor: '#ffffff', tertiaryBorderColor: '#d5d9e0', tertiaryTextColor: '#121723',
        lineColor: '#8a91a0', textColor: '#121723',
        mainBkg: '#f6f7f9', nodeBorder: '#c9ced8', clusterBkg: '#fbfbfc', clusterBorder: '#e0e3e9',
        edgeLabelBackground: '#ffffff', labelBoxBkgColor: '#ffffff', labelBoxBorderColor: '#c9ced8',
        pie1: '#121723', pie2: '#606775', pie3: '#9aa1af', pie4: '#c3c9d4', pie5: '#e0e3e9',
        pieTitleTextSize: '14px', pieSectionTextSize: '12px', pieStrokeColor: '#ffffff', pieOuterStrokeColor: '#d5d9e0'
      },
      flowchart: { curve: 'basis', padding: 14, nodeSpacing: 38, rankSpacing: 46, useMaxWidth: true, htmlLabels: true },
      er: { fill: '#ffffff', stroke: '#c9ced8', useMaxWidth: true, entityPadding: 12 },
      sequence: { useMaxWidth: true, actorMargin: 44, mirrorActors: false }
    });
    mermaidReady = true;
    return true;
  }

  function renderMermaid(fig, code){
    var out = fig.querySelector('.diagram-out');
    if (!initMermaid()){
      out.innerHTML = '<div class="fail">Diagram engine unavailable offline. Re-run the build with a network connection.</div>';
      return Promise.resolve();
    }
    return mermaid.render('mmd-' + (++seq), code).then(function(res){
      out.innerHTML = res.svg;
    }).catch(function(err){
      out.textContent = '';
      out.appendChild(el('div','fail', String(err && err.message || err)));
      fig.querySelector('.diagram-src').style.display = 'block';
    });
  }

  /* ------------------------------------------------------------ measuring
     Text is measured on a canvas using the page's own resolved font, so a box
     is the size of the words in it. The set is measured again once the webfont
     has actually loaded: Inter and the fallback are not the same width, and a
     diagram laid out against the wrong one comes out loose. */

  var cv = document.createElement('canvas').getContext('2d');
  function fontString(px, weight){
    return (weight ? weight + ' ' : '') + px + 'px ' +
      (getComputedStyle(document.body).fontFamily || 'sans-serif');
  }
  // Mermaid parks its own entity codes (#35; #quot;) behind placeholders while
  // it parses and only puts them back when it draws; the parsed model still
  // carries the placeholders, so they are put back here first.
  function decode(s){
    var t = document.createElement('textarea');
    t.innerHTML = String(s == null ? '' : s)
      .replace(/ﬂ°°/g, '&#').replace(/ﬂ°/g, '&').replace(/¶ß/g, ';');
    return t.value;
  }
  function splitLabel(label){
    var out = decode(label).split(/<br\s*\/?>|\n/).map(function(s){
      return s.replace(/<[^>]*>/g,'').trim();
    });
    return out.length ? out : [''];
  }
  // hard: a single word wider than the line - a path, a URL, a dotted table
  // name - is broken after its own punctuation rather than left to run long,
  // and a wrapped line is balanced, so it never ends on one stranded word
  function measure(label, px, maxw, weight, hard){
    cv.font = fontString(px, weight);
    var raw = splitLabel(label), out = [];
    var fill = function(pieces, width){
      var lines = [], cur = '';
      for (var j=0;j<pieces.length;j++){
        var t = cur ? cur + (pieces[j].glue ? '' : ' ') + pieces[j].t : pieces[j].t;
        if (cv.measureText(t).width > width && cur){ lines.push(cur); cur = pieces[j].t; }
        else cur = t;
      }
      if (cur) lines.push(cur);
      return lines;
    };
    for (var i=0;i<raw.length;i++){
      var line = raw[i];
      if (!maxw || cv.measureText(line).width <= maxw){ out.push(line); continue; }
      var pieces = [];
      line.split(' ').forEach(function(w){
        if (hard && cv.measureText(w).width > maxw){
          w.split(/(?<=[\/._,;:=&?-])/).forEach(function(p, k){ pieces.push({ t:p, glue:k > 0 }); });
        } else pieces.push({ t:w, glue:false });
      });
      var lines = fill(pieces, maxw);
      if (hard && lines.length > 1){
        // the narrowest width that still needs no more lines than the greedy fill
        var lo = cv.measureText(line).width / lines.length, hi = maxw;
        for (var step=0; step<9 && hi - lo > 2; step++){
          var mid = (lo + hi)/2;
          if (fill(pieces, mid).length > lines.length) lo = mid; else hi = mid;
        }
        lines = fill(pieces, hi);
      }
      out.push.apply(out, lines);
    }
    if (!out.length) out.push('');
    var w = 0;
    for (var k=0;k<out.length;k++) w = Math.max(w, cv.measureText(out[k]).width);
    var lh = px * 1.34;
    return { lines: out, w: Math.ceil(w), h: Math.ceil(out.length * lh), lh: lh };
  }

  /* ------------------------------------------------------------ elk graph */

  var NODE_FS = 12.5, EDGE_FS = 11.5;
  var PAD_X = 16, PAD_Y = 11;
  var DIRS = { TB:'DOWN', TD:'DOWN', BT:'UP', LR:'RIGHT', RL:'LEFT' };

  // An entity box is several times the size of a flowchart node, so an ER chart
  // is laid out to its own spacing profile: wider apart across a layer, and
  // slightly tighter between layers, because the gap between two entities is
  // dominated by the relationship label rather than by this number. (See the
  // edge labels in buildGraph for why.)
  var SPACING = {
    flow: { node:'40', layer:'54', edgeNode:'22', edgeNodeLayer:'24',
            edgeEdge:'16', edgeEdgeLayer:'14', pad:'14' },
    er:   { node:'58', layer:'50', edgeNode:'34', edgeNodeLayer:'36',
            edgeEdge:'20', edgeEdgeLayer:'18', pad:'18' }
  };

  /* ------------------------------------------------------------ entity box
     An ER entity is not a labelled box, it is a small table, and drawing it
     as one run of text per attribute is what makes mermaid's ER diagrams hard
     to read: nothing lines up, so every row has to be parsed word by word.
     Here the attributes are measured as real columns - type, name, comment,
     and the keys pinned to the right edge - so PK/FK/UK form a column of their
     own and the eye can scan down one of them instead of reading all of it. */

  var ER_TITLE_FS = 13, ER_FS = 11.6, ER_KEY_FS = 9.4;
  var ER_PAD = 13, ER_ROW_H = 21, ER_COL_GAP = 15, ER_HEAD_PAD = 9;
  var ER_BADGE_H = 14, ER_BADGE_PAD = 5, ER_BADGE_GAP = 4;
  // How much clear line a cardinality glyph needs at the end of a relationship.
  var ER_END_CLEAR = 22;
  // A comment up to this wide is a note, read in the table; a longer one is a
  // description, and the opened entity is where it is read.
  var ER_NOTE_W = 170;
  // the room the header gives the button that opens and closes the entity
  var ER_MORE = 24;
  // An opened entity: its description column wraps at ER_OPEN_DESC_W, its
  // notes at no less than ER_OPEN_NOTES_W, code in them is set at ER_CODE_FS.
  var ER_OPEN_DESC_W = 300, ER_OPEN_NOTES_W = 380, ER_OPEN_HEAD_H = 24, ER_OPEN_GAP = 16;
  var ER_LABEL_FS = 9.2, ER_CODE_FS = 10.8, ER_REF_FS = 10.6;

  /* ------------------------------------------------------- entity details
     Mermaid gives a column a type, a name, its keys and one comment. A schema
     document needs more - whether the column can be null, its default, what it
     references, a description longer than a diagram can hold - and so does the
     entity itself. Those are written in %% lines, which mermaid ignores, so the
     same source still renders wherever mermaid does:

       DATASET["ctl.dataset"] {
         %% What the table is for.              <- under the brace: the entity
         %% - a convention, or a constraint     <- a list item
         VARCHAR(50) dataset_code PK "What the column holds"
         %% not null · default 'x'              <- under a column: that column
         %% references ctl.other
       }

     A %% line under a column made only of null / not null / default ... /
     references ..., separated by a middle dot or a semicolon, sets those; any
     other text there is more description. */

  var ER_WORD = /^(?:not\s+null|null|nullable|default(?:\s*:)?(?:\s+.*)?|references?(?:\s*:)?\s+.+|ref(?:\s*:)?\s+.+)$/i;

  function erDetails(code){
    var found = {}, cur = null, col = null;
    String(code).split(/\r?\n/).forEach(function(raw){
      var line = raw.trim();
      if (!cur){
        var head = line.match(/^(?:"([^"]+)"|([^\s\["{]+))\s*(?:\[[^\]]*\])?\s*\{\s*$/);
        if (head){
          var name = head[1] || head[2];
          cur = found[name] = found[name] || { notes: [], cols: [] };
          col = null;
        }
        return;
      }
      if (/^\}/.test(line)){ cur = null; return; }
      var c = line.match(/^%%(?!\{)\s?(.*)$/);
      if (c){ (col ? col.lines : cur.notes).push(c[1]); return; }
      if (!line) return;
      col = { lines: [] };
      cur.cols.push(col);
    });
    return found;
  }

  function erColumn(lines){
    var meta = { nullable: null, def: '', ref: '', more: [] };
    lines.forEach(function(line){
      var bits = line.split(/\s+·\s+|\s*;\s*/).map(function(b){ return b.trim(); }).filter(Boolean);
      if (!bits.length || !bits.every(function(b){ return ER_WORD.test(b); })){
        if (line.trim()) meta.more.push(line.trim());
        return;
      }
      bits.forEach(function(b){
        var m;
        if (/^not\s+null$/i.test(b)) meta.nullable = false;
        else if (/^(?:null|nullable)$/i.test(b)) meta.nullable = true;
        else if ((m = b.match(/^default(?:\s*:)?\s*(.*)$/i))) meta.def = m[1].replace(/^\x60(.*)\x60$/, '$1');
        else if ((m = b.match(/^ref(?:erences?)?(?:\s*:)?\s+(.+)$/i))) meta.ref = m[1];
      });
    });
    return meta;
  }

  // Everything an opened entity shows, gathered before layout: the header
  // needs to know whether it carries the button.
  function attachDetails(data, code){
    var found = erDetails(code), nullKnown = false;
    var drafts = data.nodes.filter(function(n){ return !n.isGroup; }).map(function(n){
      var d = found[n.label] || found[n.id] || { notes: [], cols: [] };
      var rows = (n.attributes || []).map(function(a, i){
        var meta = erColumn((d.cols[i] || { lines: [] }).lines);
        var type = decode(a.type == null ? '' : a.type).trim();
        var sized = type.match(/^(.*?)\s*\(\s*([^)]*?)\s*\)$/);
        if (meta.nullable !== null) nullKnown = true;
        return {
          name: decode(a.name == null ? '' : a.name).trim(),
          type: sized ? sized[1] : type,
          size: sized ? sized[2] : '',
          keys: (a.keys || []).filter(Boolean).map(function(k){ return String(k).toUpperCase(); }),
          nullable: meta.nullable, def: meta.def, ref: meta.ref,
          desc: [decode(a.comment == null ? '' : a.comment).trim()].concat(meta.more).filter(Boolean).join(' ')
        };
      });
      // The lines under the brace are of two kinds. A list - its items, and the
      // line that leads into it - belongs with the columns, in the opened
      // entity. Every other line describes the entity as a whole, which is not
      // a column: it is shown while the pointer is on the entity, open or not.
      var lists = [], desc = [];
      d.notes.forEach(function(line, i){
        var t = line.trim(), item = t.match(/^[-*]\s+(.*)$/);
        if (!t) return;
        if (item) lists.push({ li: true, text: item[1] });
        else if (d.notes[i + 1] && /^[-*]\s+/.test(d.notes[i + 1].trim())) lists.push({ li: false, text: t });
        else desc.push(t);
      });
      n._desc = desc;
      return { n: n, details: { notes: lists, rows: rows } };
    });
    // A diagram whose comments are all short notes keeps them in its tables.
    // One that uses them as descriptions shows all of them only when an entity
    // is opened - not only the long ones, or the tables would show some and
    // not others.
    cv.font = fontString(ER_FS);
    var describes = drafts.some(function(dr){
      return (dr.n.attributes || []).some(function(a){
        return a.comment && cv.measureText(decode(a.comment).trim()).width > ER_NOTE_W;
      });
    });

    // Once any column says whether it can be null, a column that says nothing
    // is NOT NULL - which is how a schema document is written. A key never is.
    drafts.forEach(function(dr){
      dr.n._describes = describes;
      var s = dr.details;
      s.nullKnown = nullKnown;
      s.rows.forEach(function(r){
        if (nullKnown && (r.nullable === null || r.keys.indexOf('PK') >= 0)) r.nullable = false;
      });
      if (nullKnown || s.notes.length ||
          s.rows.some(function(r){ return r.desc || r.def || r.ref; })) dr.n._details = s;
    });
  }

  // Measured once and cached on the node, so the box drawn is the box the
  // layout was given room for - the two must not be allowed to disagree.
  function erModel(n){
    if (n._er) return n._er;
    if (n._open) return (n._er = erOpened(n));
    var title = measure(n.alias || n.label, ER_TITLE_FS, 340, 600);
    var rows = (n.attributes || []).map(function(a){
      return {
        type: decode(a.type == null ? '' : a.type).trim(),
        name: decode(a.name == null ? '' : a.name).trim(),
        comment: decode(a.comment == null ? '' : a.comment).trim(),
        keys: (a.keys || []).filter(Boolean).map(function(k){ return String(k).toUpperCase(); })
      };
    });

    if (n._describes && n._details) rows.forEach(function(r){ r.comment = ''; });
    cv.font = fontString(ER_FS);
    var wType = 0, wName = 0, wCom = 0;
    rows.forEach(function(r){
      if (r.type) wType = Math.max(wType, cv.measureText(r.type).width);
      if (r.name) wName = Math.max(wName, cv.measureText(r.name).width);
      if (r.comment) wCom = Math.max(wCom, cv.measureText(r.comment).width);
    });
    wType = Math.ceil(wType); wName = Math.ceil(wName); wCom = Math.ceil(wCom);

    cv.font = fontString(ER_KEY_FS, 600);
    var wKey = 0;
    rows.forEach(function(r){
      var w = 0;
      r.badges = r.keys.map(function(k){
        var bw = Math.ceil(cv.measureText(k).width) + ER_BADGE_PAD * 2;
        w += bw + (w ? ER_BADGE_GAP : 0);
        return { text: k, w: bw, pk: k === 'PK' };
      });
      r.keyW = w;
      wKey = Math.max(wKey, w);
    });

    var xName = ER_PAD + (wType ? wType + ER_COL_GAP : 0);
    var xCom = xName + wName + ER_COL_GAP;
    var contentW = (wCom ? xCom + wCom : xName + wName) +
                   (wKey ? ER_COL_GAP + wKey : 0) + ER_PAD;
    var headH = Math.ceil(title.h + ER_HEAD_PAD * 2) + (rows.length ? 0 : 4);

    n._er = {
      title: title, rows: rows, headH: headH, xType: ER_PAD, xName: xName, xCom: xCom,
      w: Math.round(Math.max(contentW, title.w + ER_PAD * 2 + 14 + (n._details ? ER_MORE * 2 : 0), 104)),
      h: Math.round(headH + (rows.length ? rows.length * ER_ROW_H + 5 : 0))
    };
    return n._er;
  }

  /* -------------------------------------------------------- opened entity
     The same entity with everything written about it: a real table of every
     column - name, type, length, keys and what they reference, null, default,
     description - with the notes and constraints for the entity above it. It
     opens in place, in the diagram, and the diagram is laid out again around
     it. Descriptions and notes wrap, and keep their code spans and bold. */

  var MONO = null;
  function monoString(px){
    if (MONO === null) MONO = getComputedStyle(document.documentElement).getPropertyValue('--mono').trim() || 'monospace';
    return px + 'px ' + MONO;
  }

  // text with code spans and bold, as words made of styled pieces
  function richWords(text){
    var parts = [], re = /\x60([^\x60]+)\x60|\*\*([^*]+)\*\*|([^\x60*]+|[\x60*])/g, m;
    while ((m = re.exec(text))){
      if (m[1] != null) parts.push({ s: m[1], k: 'code' });
      else if (m[2] != null) parts.push({ s: m[2], k: 'bold' });
      else parts.push({ s: m[3], k: '' });
    }
    var words = [[]];
    parts.forEach(function(p){
      p.s.split(/(\s+)/).forEach(function(bit){
        if (!bit) return;
        if (/^\s+$/.test(bit)){ if (words[words.length - 1].length) words.push([]); return; }
        words[words.length - 1].push({ s: bit, k: p.k });
      });
    });
    if (!words[words.length - 1].length) words.pop();
    return words;
  }

  // Each piece is measured in its own face, so a line of mixed prose and code
  // breaks where it really runs out of room.
  function richWrap(text, px, maxw){
    var words = richWords(decode(text));
    cv.font = fontString(px);
    var space = cv.measureText(' ').width, lines = [], cur = [], curW = 0, widest = 0;
    words.forEach(function(word){
      var pieces = word.map(function(p){
        cv.font = p.k === 'code' ? monoString(ER_CODE_FS) : fontString(px, p.k === 'bold' ? 620 : null);
        return { s: p.s, k: p.k, w: cv.measureText(p.s).width };
      });
      var ww = pieces.reduce(function(sum, p){ return sum + p.w; }, 0);
      if (cur.length && curW + space + ww > maxw){
        lines.push(cur);
        widest = Math.max(widest, curW);
        cur = []; curW = 0;
      }
      curW += (cur.length ? space : 0) + ww;
      cur.push({ pieces: pieces, w: ww });
    });
    if (cur.length){ lines.push(cur); widest = Math.max(widest, curW); }
    var lh = px * 1.42;
    return { lines: lines, w: Math.ceil(widest), h: Math.ceil(Math.max(1, lines.length) * lh), lh: lh, space: space };
  }

  // one text per line, each word placed where it was measured to start
  function richText(parent, m, x, cy, cls){
    m.lines.forEach(function(line, i){
      var t = mk('text', { x: x, y: cy + i * m.lh, 'text-anchor': 'start' }, cls);
      var at = x;
      line.forEach(function(word, j){
        if (j) at += m.space;
        // a word after the first is preceded by its own space, set one space
        // earlier and in the plain face: the text still reads, and is found by
        // a search in the page, as words
        if (j){
          var gap = mk('tspan', { x: at - m.space });
          gap.textContent = ' ';
          t.appendChild(gap);
        }
        word.pieces.forEach(function(p, k){
          var ts = mk('tspan', k || j ? null : { x: at }, p.k ? 'dg-er-x-' + p.k : null);
          ts.textContent = p.s;
          t.appendChild(ts);
          at += p.w;
        });
      });
      parent.appendChild(t);
    });
  }

  function erOpened(n){
    var s = n._details, P = ER_PAD, G = ER_OPEN_GAP;
    var title = measure(n.alias || n.label, ER_TITLE_FS, 340, 600);
    var headH = Math.ceil(title.h + ER_HEAD_PAD * 2);
    var any = function(test){ return s.rows.some(test); };

    // a column of the table appears only when some row has something to put in it
    var cols = [{ k: 'name', label: 'Column' }, { k: 'type', label: 'Type' }];
    if (any(function(r){ return r.size; })) cols.push({ k: 'size', label: 'Length' });
    if (any(function(r){ return r.keys.length || r.ref; })) cols.push({ k: 'key', label: 'Key' });
    if (s.nullKnown) cols.push({ k: 'null', label: 'Null' });
    if (any(function(r){ return r.def; })) cols.push({ k: 'def', label: 'Default' });
    var hasDesc = any(function(r){ return r.desc; });
    if (hasDesc) cols.push({ k: 'desc', label: 'Description' });
    cv.font = fontString(ER_LABEL_FS, 620);
    cols.forEach(function(c){
      c.label = c.label.toUpperCase();
      c.w = Math.ceil(cv.measureText(c.label).width + c.label.length * .65);
    });
    var col = {};
    cols.forEach(function(c){ col[c.k] = c; });
    var widen = function(k, w){ if (col[k]) col[k].w = Math.max(col[k].w, Math.ceil(w)); };

    var rows = s.rows.map(function(r){
      var row = { r: r };
      cv.font = fontString(ER_FS, 560); widen('name', cv.measureText(r.name).width);
      cv.font = fontString(ER_FS); widen('type', cv.measureText(r.type).width);
      if (r.size) widen('size', cv.measureText(r.size).width);
      cv.font = fontString(ER_KEY_FS, 600);
      var kw = 0;
      row.badges = r.keys.map(function(k){
        var bw = Math.ceil(cv.measureText(k).width) + ER_BADGE_PAD * 2;
        kw += bw + (kw ? ER_BADGE_GAP : 0);
        return { text: k, w: bw, pk: k === 'PK' };
      });
      widen('key', kw);
      if (r.ref){ cv.font = fontString(ER_REF_FS); widen('key', cv.measureText('→ ' + r.ref).width); }
      if (col.null){
        cv.font = fontString(ER_KEY_FS, 600);
        widen('null', r.nullable ? cv.measureText('NULL').width + ER_BADGE_PAD * 2 : cv.measureText('NOT NULL').width);
      }
      if (r.def){ cv.font = monoString(ER_CODE_FS); widen('def', cv.measureText(r.def).width); }
      if (r.desc) widen('desc', Math.min(richWrap(r.desc, ER_FS, 1e6).w, ER_OPEN_DESC_W));
      return row;
    });

    var tableW = function(){
      return P * 2 + cols.reduce(function(sum, c, i){ return sum + c.w + (i ? G : 0); }, 0);
    };
    var notes = s.notes.map(function(nt){ return { li: nt.li, text: nt.text }; });

    // The table sets the width; the notes wrap to it, but not narrower than
    // reads well, and the title and its button always fit. Any width to spare
    // goes to the descriptions, which then need fewer lines.
    var w = Math.max(tableW(), notes.length ? ER_OPEN_NOTES_W + P * 2 : 0,
                     title.w + P * 2 + 14 + ER_MORE * 2, 104);
    if (hasDesc) col.desc.w += w - tableW();
    w = Math.max(w, tableW());
    // Nor, when it can be helped, wider than the page gives the diagram: an
    // opened entity wider than that would shrink the whole diagram to fit, so
    // its descriptions wrap narrower first.
    if (n._room && hasDesc && w > n._room){
      col.desc.w = Math.max(160, col.desc.w - (w - n._room));
      w = Math.max(tableW(), notes.length ? Math.min(ER_OPEN_NOTES_W + P * 2, n._room) : 0,
                   title.w + P * 2 + 14 + ER_MORE * 2, 104);
    }

    var notesH = 0;
    notes.forEach(function(nt, i){
      nt.m = richWrap(nt.text, ER_FS, w - P * 2 - (nt.li ? 14 : 0));
      nt.gap = i ? (nt.li && notes[i - 1].li ? 3 : 7) : 0;
      notesH += nt.gap + nt.m.h;
    });
    if (notes.length) notesH += 20;

    var x = P;
    cols.forEach(function(c){ c.x = x; x += c.w + G; });
    var bodyH = 0;
    rows.forEach(function(row){
      var lines = 1;
      if (col.desc && row.r.desc){
        row.desc = richWrap(row.r.desc, ER_FS, col.desc.w);
        lines = Math.max(lines, row.desc.lines.length);
      }
      row.h = Math.max(ER_ROW_H + (row.r.ref ? 15 : 0), Math.ceil((lines - 1) * ER_FS * 1.42) + ER_ROW_H + (lines > 1 ? 4 : 0));
      bodyH += row.h;
    });

    return {
      open: true, title: title, headH: headH, notes: notes, notesH: notesH, cols: cols, col: col,
      rows: rows, w: Math.round(w),
      h: Math.round(headH + notesH + (rows.length ? ER_OPEN_HEAD_H + bodyH + 5 : 0))
    };
  }

  function nodeSize(n){
    if (n.shape === 'erBox'){ var e = erModel(n); return { w: e.w, h: e.h }; }
    var m = measure(n.label, NODE_FS, CFG.nodeTextWidth || 210);
    n._m = m;
    var w = m.w + PAD_X*2, h = m.h + PAD_Y*2;
    switch (n.shape){
      case 'diamond': case 'question': case 'rhombus':
        w = m.w*1.7 + 26; h = m.h*2 + 18; break;
      case 'circle': case 'doublecircle': case 'state':
        w = h = Math.max(w, h, Math.round(Math.hypot(m.w, m.h)) + 14); break;
      case 'cylinder': case 'database': h += 12; break;
      case 'hexagon': w += 26; break;
      case 'subroutine': w += 16; break;
      case 'lean_right': case 'lean_r': case 'lean_left': case 'lean_l':
      case 'trapezoid': case 'inv_trapezoid': w += 34; break;
    }
    return { w: Math.round(w), h: Math.round(h) };
  }

  function buildGraph(data, dir, extra){
    var sp = data.__er ? SPACING.er : SPACING.flow;
    var kids = {};
    data.nodes.forEach(function(n){
      var p = n.parentId || '__root';
      (kids[p] = kids[p] || []).push(n);
    });

    function build(n){
      if (n.isGroup){
        var gm = measure(n.label, NODE_FS, 320);
        n._m = gm;
        return {
          id: n.id, _n: n,
          layoutOptions: {
            'elk.padding': '[top=' + Math.round(gm.h + 22) + ',left=18,bottom=18,right=18]',
            'elk.direction': DIRS[String(n.dir || '').toUpperCase()] || dir
          },
          children: (kids[n.id] || []).map(build)
        };
      }
      var s = nodeSize(n);
      return { id: n.id, width: s.w, height: s.h, _n: n };
    }

    var horiz = dir === 'RIGHT' || dir === 'LEFT';
    var edges = data.edges.map(function(e){
      var ed = { id: e.id, sources: [e.start], targets: [e.end], _e: e };
      if (e.label != null && String(e.label).trim() !== ''){
        var m = measure(e.label, EDGE_FS, CFG.edgeTextWidth || 200);
        e._m = m;
        e._lw = m.w + 12;
        e._lh = m.h + 4;
        // ELK decides the gap around a centred edge label from the label box and
        // nothing else - not from the layer spacing - so the clear line the two
        // crow's feet need is reserved here, as part of the box, and the plate is
        // then drawn at its own size in the middle of it.
        var clear = data.__er ? ER_END_CLEAR * 2 : 0;
        ed.labels = [{ id: e.id + '::label', text: 'x',
          width: e._lw + (horiz ? clear : 0), height: e._lh + (horiz ? 0 : clear) }];
      }
      return ed;
    });

    var opts = {
        'elk.algorithm': 'layered',
        'elk.direction': dir,
        'elk.edgeRouting': 'ORTHOGONAL',
        'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
        'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
        'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
        // Keep the drawing in the order the document wrote it wherever that
        // costs nothing: a diagram should read the way its source reads.
        'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
        'elk.layered.thoroughness': '30',
        'elk.layered.mergeEdges': 'false',
        'elk.spacing.nodeNode': sp.node,
        'elk.layered.spacing.nodeNodeBetweenLayers': sp.layer,
        'elk.spacing.edgeNode': sp.edgeNode,
        'elk.layered.spacing.edgeNodeBetweenLayers': sp.edgeNodeLayer,
        'elk.spacing.edgeEdge': sp.edgeEdge,
        'elk.layered.spacing.edgeEdgeBetweenLayers': sp.edgeEdgeLayer,
        'elk.spacing.edgeLabel': '7',
        'elk.spacing.labelNode': '10',
        'elk.edgeLabels.placement': 'CENTER',
        'elk.padding': '[top='+sp.pad+',left='+sp.pad+',bottom='+sp.pad+',right='+sp.pad+']'
    };
    for (var k in extra || {}) opts[k] = extra[k];
    return { id: 'root', children: (kids.__root || []).map(build), edges: edges, layoutOptions: opts };
  }

  /* ---------------------------------------------------- the shape of an ER
     A layered layout puts every step of a chain of relationships on a new
     layer, so a schema written top to bottom comes out as a tower: a document
     much longer than it needs to be, and a diagram that is never on screen in
     one piece. The column is wide, and an ER diagram has no reading direction
     to keep, so it is laid out more than one way - as written, turned on its
     side, and on its side with a long chain folded into rows - and the one
     that takes the least height at the width it is shown in, while staying
     readable, is kept. A direction the source writes is kept: across can
     still be folded, down is left as it is. */

  // below this, fitted into the column, an entity's text is too small to read
  var ER_MIN_SCALE = .8;

  function erShapes(code, dir, avail){
    var said = /^\s*direction\s+(TB|TD|BT|LR|RL)\s*$/im.test(String(code));
    var across = dir === 'RIGHT' || dir === 'LEFT';
    // the shape a page wants: as wide as the column, no taller than most of a screen
    var ratio = String(Math.max(1, Math.min(4, avail / Math.max(360, innerHeight * .8))).toFixed(2));
    var packed = { 'elk.aspectRatio': ratio };
    // ELK folds a layout that runs across into rows, not one that runs down:
    // a chain laid out sideways and folded is the tower turned into a block
    var folded = { 'elk.aspectRatio': ratio, 'elk.layered.wrapping.strategy': 'MULTI_EDGE',
                   'elk.layered.wrapping.additionalEdgeSpacing': '24' };
    var shapes = [{ dir: dir, extra: packed }];
    if (said && !across) return shapes;
    if (!across) shapes.push({ dir: 'RIGHT', extra: packed });
    shapes.push({ dir: across ? dir : 'RIGHT', extra: folded });
    return shapes;
  }

  // the height a layout takes once fitted to the column, and whether it can still be read
  function erCost(res, avail){
    var k = avail ? Math.min(1, avail / Math.max(1, res.width)) : 1;
    return { h: res.height * k, legible: k >= ER_MIN_SCALE, k: k };
  }

  function pickShape(tries, avail){
    var best = null;
    tries.forEach(function(t, i){
      var c = erCost(t.res, avail);
      t.cost = c;
      if (!best){ best = t; return; }
      var b = best.cost;
      if (c.legible !== b.legible){ if (c.legible) best = t; return; }
      if (!c.legible){ if (c.k > b.k) best = t; return; }
      // as written wins unless another shape is clearly shorter
      if (c.h < b.h * (best === tries[0] ? .85 : 1)) best = t;
    });
    return best;
  }

  /* ------------------------------------------------------------ svg output */

  function absolutise(res){
    var abs = {};
    (function walk(n, ox, oy){
      var cs = n.children || [];
      for (var i=0;i<cs.length;i++){
        var c = cs[i], x = ox + (c.x||0), y = oy + (c.y||0);
        abs[c.id] = { x:x, y:y, w:c.width, h:c.height, n:c._n };
        walk(c, x, y);
      }
    })(res, 0, 0);
    return abs;
  }

  // An edge's route and its label come back in the coordinate space of the
  // lowest node that contains both of its ends - the root for most edges, but
  // the subgraph itself for an edge drawn wholly inside one. Everything else
  // here works in root coordinates, so each edge is shifted by its own origin.
  function edgeOrigin(data, abs, src, dst){
    var parent = {};
    data.nodes.forEach(function(n){ parent[n.id] = n.parentId || null; });
    var chain = function(id){
      var out = [];
      for (var p = parent[id]; p; p = parent[p]) out.unshift(p);
      return out;
    };
    var a = chain(src), b = chain(dst), lca = null;
    for (var i=0; i<a.length && i<b.length && a[i] === b[i]; i++) lca = a[i];
    var box = lca && abs[lca];
    return box ? { x: box.x, y: box.y } : { x: 0, y: 0 };
  }

  // classDef / style directives, flattened into a plain object
  function styleOf(src){
    var out = {};
    [].concat(src.cssCompiledStyles || [], src.cssStyles || [], src.styles || [], src.style || [])
      .forEach(function(s){
        String(s).split(';').forEach(function(bit){
          var i = bit.indexOf(':');
          if (i > 0) out[bit.slice(0,i).trim()] = bit.slice(i+1).trim();
        });
      });
    return out;
  }

  function shapeEl(x, y, w, h, shape){
    var s;
    switch (shape){
      case 'diamond': case 'question': case 'rhombus':
        return mk('polygon', { points: (x+w/2)+','+y+' '+(x+w)+','+(y+h/2)+' '+(x+w/2)+','+(y+h)+' '+x+','+(y+h/2) });
      case 'stadium': case 'pill':
        return mk('rect', { x:x, y:y, width:w, height:h, rx:h/2, ry:h/2 });
      case 'circle': case 'doublecircle': case 'state':
        return mk('ellipse', { cx:x+w/2, cy:y+h/2, rx:w/2, ry:h/2 });
      case 'cylinder': case 'database':
        var e = Math.min(11, h/5);
        return mk('path', { d:'M'+x+','+(y+e)+' A'+(w/2)+','+e+' 0 0 1 '+(x+w)+','+(y+e)+
          ' L'+(x+w)+','+(y+h-e)+' A'+(w/2)+','+e+' 0 0 1 '+x+','+(y+h-e)+' Z'+
          ' M'+x+','+(y+e)+' A'+(w/2)+','+e+' 0 0 0 '+(x+w)+','+(y+e) });
      case 'hexagon':
        s = Math.min(18, w/5);
        return mk('polygon', { points:(x+s)+','+y+' '+(x+w-s)+','+y+' '+(x+w)+','+(y+h/2)+' '+
          (x+w-s)+','+(y+h)+' '+(x+s)+','+(y+h)+' '+x+','+(y+h/2) });
      case 'lean_right': case 'lean_r':
        s = Math.min(22, w/6);
        return mk('polygon', { points:(x+s)+','+y+' '+(x+w)+','+y+' '+(x+w-s)+','+(y+h)+' '+x+','+(y+h) });
      case 'lean_left': case 'lean_l':
        s = Math.min(22, w/6);
        return mk('polygon', { points:x+','+y+' '+(x+w-s)+','+y+' '+(x+w)+','+(y+h)+' '+(x+s)+','+(y+h) });
      case 'trapezoid':
        s = Math.min(22, w/6);
        return mk('polygon', { points:(x+s)+','+y+' '+(x+w-s)+','+y+' '+(x+w)+','+(y+h)+' '+x+','+(y+h) });
      case 'inv_trapezoid':
        s = Math.min(22, w/6);
        return mk('polygon', { points:x+','+y+' '+(x+w)+','+y+' '+(x+w-s)+','+(y+h)+' '+(x+s)+','+(y+h) });
      case 'squareRect': case 'rect': case 'square':
        return mk('rect', { x:x, y:y, width:w, height:h, rx:3, ry:3 });
      default:
        return mk('rect', { x:x, y:y, width:w, height:h, rx:8, ry:8 });
    }
  }

  function textBlock(m, cx, cy, cls){
    var g = mk('text', { x:cx, y:Math.round(cy - (m.lines.length-1)*m.lh/2), 'text-anchor':'middle' }, cls);
    for (var i=0;i<m.lines.length;i++){
      var ts = mk('tspan', { x:cx, dy: i ? m.lh : 0 });
      ts.textContent = m.lines[i];
      g.appendChild(ts);
    }
    return g;
  }

  // The entity, drawn as a table. The header band is a path rather than a rect
  // so that only its top corners are rounded, and it is a wash laid over the
  // body rather than an opaque fill, so a classDef colour on the entity still
  // reads through it - and so the hover tint reaches the header too.
  function erBoxEl(g, a, n, st){
    var m = erModel(n), x = a.x, y = a.y, w = a.w, h = a.h, r = 9;

    var body = mk('rect', { x:x, y:y, width:w, height:h, rx:r, ry:r }, 'dg-node-shape');
    if (st.fill) body.style.fill = st.fill;
    if (st.stroke) body.style.stroke = st.stroke;
    if (st['stroke-width']) body.style.strokeWidth = st['stroke-width'];
    if (st['stroke-dasharray']) body.style.strokeDasharray = st['stroke-dasharray'];
    g.appendChild(body);

    if (m.rows.length){
      g.appendChild(mk('path', { d:
        'M'+x+','+(y+m.headH)+' V'+(y+r)+' A'+r+','+r+' 0 0 1 '+(x+r)+','+y+
        ' H'+(x+w-r)+' A'+r+','+r+' 0 0 1 '+(x+w)+','+(y+r)+' V'+(y+m.headH)+' Z'
      }, 'dg-er-head'));
      var rule = mk('line', { x1:x, y1:y+m.headH, x2:x+w, y2:y+m.headH }, 'dg-er-rule');
      if (st.stroke) rule.style.stroke = st.stroke;
      g.appendChild(rule);
    }

    var t = textBlock(m.title, x + w/2, y + m.headH/2, 'dg-er-title');
    if (st.color) t.style.fill = st.color;
    g.appendChild(t);

    // The button that opens the entity, or closes it again, in the corner of
    // the header. Which entities are open is remembered by name on the figure,
    // so it survives the diagram being drawn again.
    g.setAttribute('data-entity', n.label);
    if (n._desc && n._desc.length) g.setAttribute('data-desc', JSON.stringify(n._desc));
    if (n._details){
      var bx = x + w - 8 - 17, by = y + m.headH/2 - 8.5, cx = bx + 8.5, cy = by + 8.5;
      var more = mk('g', null, 'dg-er-more' + (m.open ? ' is-open' : ''));
      var tip = mk('title');
      tip.textContent = m.open ? 'Back to the compact table' : 'Every column, and the notes';
      more.appendChild(tip);
      more.appendChild(mk('rect', { x:bx, y:by, width:17, height:17, rx:5 }, 'dg-er-more-box'));
      more.appendChild(mk('path', { d: m.open
        ? 'M'+(cx-4)+','+(cy-.5)+' H'+(cx-.5)+' V'+(cy-4)+' M'+(cx+.5)+','+(cy+4)+' V'+(cy+.5)+' H'+(cx+4)
        : 'M'+(cx-4)+','+(cy-.5)+' V'+(cy-4)+' H'+(cx-.5)+' M'+(cx+.5)+','+(cy+4)+' H'+(cx+4)+' V'+(cy+.5)
      }, 'dg-er-more-icon'));
      g.appendChild(more);
    }

    if (m.open) return erOpenedEl(g, x, y, w, h, r, m);

    m.rows.forEach(function(row, i){
      var top = y + m.headH + i * ER_ROW_H, cy = top + ER_ROW_H/2;
      var rg = mk('g', null, 'dg-er-row');
      // what the column holds, shown while the pointer is on its row: the
      // compact table has no room for it (an opened one writes it out)
      var desc = n._details && n._details.rows[i] && n._details.rows[i].desc;
      if (desc) rg.setAttribute('data-desc', JSON.stringify([desc]));
      // a band under the row, lit on hover: on a wide entity it is what keeps
      // the eye on one line while it travels from the type across to the keys
      var last = i === m.rows.length - 1, rr = r - 1, x1 = x + 1, x2 = x + w - 1, y2 = y + h - 1;
      rg.appendChild(last
        ? mk('path', { d: 'M'+x1+','+top+' H'+x2+' V'+(y2-rr)+' A'+rr+','+rr+' 0 0 1 '+(x2-rr)+','+y2+
                          ' H'+(x1+rr)+' A'+rr+','+rr+' 0 0 1 '+x1+','+(y2-rr)+' Z' }, 'dg-er-band')
        : mk('rect', { x:x1, y:top, width:w-2, height:ER_ROW_H }, 'dg-er-band'));
      if (i) rg.appendChild(mk('line', { x1:x+ER_PAD, y1:top, x2:x+w-ER_PAD, y2:top }, 'dg-er-sep'));

      var put = function(text, tx, cls){
        if (!text) return;
        var e = mk('text', { x:tx, y:cy, 'text-anchor':'start' }, cls);
        e.textContent = text;
        rg.appendChild(e);
      };
      put(row.type, x + m.xType, 'dg-er-type');
      put(row.name, x + m.xName, 'dg-er-name');
      put(row.comment, x + m.xCom, 'dg-er-comment');

      var bx = x + w - ER_PAD - row.keyW;
      row.badges.forEach(function(b){
        rg.appendChild(mk('rect', { x:bx, y:cy - ER_BADGE_H/2, width:b.w, height:ER_BADGE_H, rx:4 },
          'dg-er-badge' + (b.pk ? ' is-pk' : '')));
        var bt = mk('text', { x:bx + b.w/2, y:cy, 'text-anchor':'middle' }, 'dg-er-key');
        bt.textContent = b.text;
        rg.appendChild(bt);
        bx += b.w + ER_BADGE_GAP;
      });
      g.appendChild(rg);
    });
  }

  function erOpenedEl(g, x, y, w, h, r, m){
    var P = ER_PAD, top = y + m.headH;

    // the notes and constraints, between the header and the table
    if (m.notes.length){
      var ng = mk('g', null, 'dg-er-notes');
      var at = top + 10;
      m.notes.forEach(function(nt){
        at += nt.gap;
        var tx = x + P + (nt.li ? 14 : 0), cy = at + nt.m.lh/2;
        if (nt.li) ng.appendChild(mk('circle', { cx: x + P + 4, cy: cy, r: 1.8 }, 'dg-er-bullet'));
        richText(ng, nt.m, tx, cy, 'dg-er-note');
        at += nt.m.h;
      });
      g.appendChild(ng);
      top += m.notesH;
      if (m.rows.length) g.appendChild(mk('line', { x1: x, y1: top, x2: x + w, y2: top }, 'dg-er-rule'));
    }
    if (!m.rows.length) return;

    // the column headings
    m.cols.forEach(function(c){
      var t = mk('text', { x: x + c.x, y: top + ER_OPEN_HEAD_H/2 + 1, 'text-anchor': 'start' }, 'dg-er-x-label');
      t.textContent = c.label;
      g.appendChild(t);
    });
    top += ER_OPEN_HEAD_H;
    g.appendChild(mk('line', { x1: x + P, y1: top, x2: x + w - P, y2: top }, 'dg-er-sep'));

    var col = m.col;
    m.rows.forEach(function(row, i){
      var r0 = row.r, cy = top + ER_ROW_H/2;
      var rg = mk('g', null, 'dg-er-row');
      var last = i === m.rows.length - 1, rr = r - 1, x1 = x + 1, x2 = x + w - 1, y2 = y + h - 1;
      rg.appendChild(last
        ? mk('path', { d: 'M'+x1+','+top+' H'+x2+' V'+(y2-rr)+' A'+rr+','+rr+' 0 0 1 '+(x2-rr)+','+y2+
                          ' H'+(x1+rr)+' A'+rr+','+rr+' 0 0 1 '+x1+','+(y2-rr)+' Z' }, 'dg-er-band')
        : mk('rect', { x: x1, y: top, width: w - 2, height: row.h }, 'dg-er-band'));
      if (i) rg.appendChild(mk('line', { x1: x + P, y1: top, x2: x + w - P, y2: top }, 'dg-er-sep'));

      var put = function(c, text, cls, dy){
        if (!c) return;
        var e = mk('text', { x: x + c.x, y: cy + (dy || 0), 'text-anchor': 'start' }, cls);
        e.textContent = text;
        rg.appendChild(e);
      };
      var none = function(c){ put(c, '—', 'dg-er-none'); };
      put(col.name, r0.name, 'dg-er-name dg-er-x-name');
      put(col.type, r0.type, 'dg-er-type');
      if (r0.size) put(col.size, r0.size, 'dg-er-type'); else none(col.size);

      if (col.key){
        var bx = x + col.key.x;
        row.badges.forEach(function(b){
          rg.appendChild(mk('rect', { x: bx, y: cy - ER_BADGE_H/2, width: b.w, height: ER_BADGE_H, rx: 4 },
            'dg-er-badge' + (b.pk ? ' is-pk' : '')));
          var bt = mk('text', { x: bx + b.w/2, y: cy, 'text-anchor': 'middle' }, 'dg-er-key');
          bt.textContent = b.text;
          rg.appendChild(bt);
          bx += b.w + ER_BADGE_GAP;
        });
        if (r0.ref) put(col.key, '→ ' + r0.ref, 'dg-er-ref', row.badges.length ? 15 : 0);
      }

      if (col.null){
        if (r0.nullable){
          cv.font = fontString(ER_KEY_FS, 600);
          var nw = Math.ceil(cv.measureText('NULL').width) + ER_BADGE_PAD * 2;
          rg.appendChild(mk('rect', { x: x + col.null.x, y: cy - ER_BADGE_H/2, width: nw, height: ER_BADGE_H, rx: 4 }, 'dg-er-null'));
          var nt = mk('text', { x: x + col.null.x + nw/2, y: cy, 'text-anchor': 'middle' }, 'dg-er-null-text');
          nt.textContent = 'NULL';
          rg.appendChild(nt);
        } else put(col.null, 'NOT NULL', 'dg-er-notnull');
      }
      if (r0.def) put(col.def, r0.def, 'dg-er-def'); else none(col.def);
      if (row.desc) richText(rg, row.desc, x + col.desc.x, cy, 'dg-er-desc');
      else if (col.desc) none(col.desc);

      g.appendChild(rg);
      top += row.h;
    });
  }

  // Right-angle bends look mechanical when they are exactly square; a small
  // radius reads as a route rather than as a staircase.
  function roundedPath(pts, r){
    if (pts.length < 2) return '';
    if (pts.length === 2) return 'M'+pts[0].x+','+pts[0].y+' L'+pts[1].x+','+pts[1].y;
    var d = 'M'+pts[0].x+','+pts[0].y;
    for (var i=1;i<pts.length-1;i++){
      var a=pts[i-1], b=pts[i], c=pts[i+1];
      var l1=Math.hypot(b.x-a.x,b.y-a.y), l2=Math.hypot(c.x-b.x,c.y-b.y);
      if (!l1 || !l2){ d += ' L'+b.x+','+b.y; continue; }
      var rr = Math.min(r, l1/2, l2/2);
      d += ' L'+(b.x+(a.x-b.x)/l1*rr)+','+(b.y+(a.y-b.y)/l1*rr) +
           ' Q'+b.x+','+b.y+' '+(b.x+(c.x-b.x)/l2*rr)+','+(b.y+(c.y-b.y)/l2*rr);
    }
    var e = pts[pts.length-1];
    return d + ' L'+e.x+','+e.y;
  }

  function nearestOnPath(pts, px, py){
    var best = null, bd = Infinity;
    for (var i=0;i<pts.length-1;i++){
      var a=pts[i], b=pts[i+1];
      var dx=b.x-a.x, dy=b.y-a.y, L=dx*dx+dy*dy;
      var t = L ? ((px-a.x)*dx + (py-a.y)*dy)/L : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      var x=a.x+dx*t, y=a.y+dy*t, d=(x-px)*(x-px)+(y-py)*(y-py);
      if (d < bd){ bd = d; best = { x:x, y:y }; }
    }
    return best;
  }

  // Arrowheads are drawn into the edge's own group rather than referenced as
  // shared <marker>s: that way one CSS rule recolours the head along with its
  // line when the edge lights up, and a cloned SVG carries its own heads.
  function arrowHead(tip, from, kind){
    var dx = tip.x - from.x, dy = tip.y - from.y;
    var L = Math.hypot(dx, dy) || 1;
    var ux = dx/L, uy = dy/L, px = -uy, py = ux;
    if (kind === 'dot'){
      return mk('circle', { cx: tip.x - ux*3.4, cy: tip.y - uy*3.4, r: 3.4 }, 'dg-head dg-head-open');
    }
    if (kind === 'cross'){
      var c = { x: tip.x - ux*4, y: tip.y - uy*4 }, s = 4;
      return mk('path', { d:
        'M'+(c.x-(ux+px)*s)+','+(c.y-(uy+py)*s)+' L'+(c.x+(ux+px)*s)+','+(c.y+(uy+py)*s)+
        ' M'+(c.x-(ux-px)*s)+','+(c.y-(uy-py)*s)+' L'+(c.x+(ux-px)*s)+','+(c.y+(uy-py)*s),
        fill:'none' }, 'dg-head dg-head-open');
    }
    var back = 8.5, half = 3.4;
    var bx = tip.x - ux*back, by = tip.y - uy*back;
    if (kind === 'open'){
      // two strokes and no fill: an asynchronous message in a sequence diagram
      return mk('path', { d:
        'M'+(bx+px*(half+.8))+','+(by+py*(half+.8))+' L'+tip.x+','+tip.y+' L'+(bx-px*(half+.8))+','+(by-py*(half+.8)),
        fill:'none' }, 'dg-head-line');
    }
    return mk('polygon', { points:
      tip.x+','+tip.y+' '+(bx+px*half)+','+(by+py*half)+' '+(bx-px*half)+','+(by-py*half) }, 'dg-head');
  }

  var ARROW = { arrow_point:'tri', double_arrow_point:'tri', arrow_circle:'dot', arrow_cross:'cross' };

  // Crow's-foot cardinality, drawn at the entity end of a relationship. The
  // mermaid source reads outwards from the entity - in "A }o--|| B" the "}"
  // is the mark nearest A and the "o" the one beyond it - so the glyphs are
  // placed in that order, stepping back along the line from the box edge.
  // Like arrowheads these are drawn into the edge's own group rather than as
  // shared <marker>s, so one CSS rule lights a glyph along with its line.
  var CARDS = { only_one:1, zero_or_one:1, one_or_more:1, zero_or_more:1, md_parent:1 };

  function erMarker(tip, from, card){
    if (!CARDS[card]) return null;
    var dx = tip.x - from.x, dy = tip.y - from.y, L = Math.hypot(dx, dy) || 1;
    var ux = dx/L, uy = dy/L, px = -uy, py = ux;
    var g = mk('g', null, 'dg-card');
    var at = function(d){ return { x: tip.x - ux*d, y: tip.y - uy*d }; };
    var bar = function(d){
      var c = at(d);
      g.appendChild(mk('line', { x1:c.x+px*5.6, y1:c.y+py*5.6, x2:c.x-px*5.6, y2:c.y-py*5.6 }, 'dg-card-line'));
    };
    var ring = function(d){
      var c = at(d);
      g.appendChild(mk('circle', { cx:c.x, cy:c.y, r:3.5 }, 'dg-card-ring'));
    };
    // the middle prong of the foot is the edge line itself; only the two
    // spread prongs have to be drawn
    var foot = function(){
      var apex = at(10.5);
      g.appendChild(mk('line', { x1:apex.x, y1:apex.y, x2:tip.x+px*7, y2:tip.y+py*7 }, 'dg-card-line'));
      g.appendChild(mk('line', { x1:apex.x, y1:apex.y, x2:tip.x-px*7, y2:tip.y-py*7 }, 'dg-card-line'));
    };
    if (card === 'only_one'){ bar(5.5); bar(10.5); }
    else if (card === 'zero_or_one'){ bar(5.5); ring(12.5); }
    else if (card === 'one_or_more'){ foot(); bar(15); }
    else if (card === 'zero_or_more'){ foot(); ring(17.5); }
    else g.appendChild(mk('circle', { cx: at(4).x, cy: at(4).y, r:3.4 }, 'dg-card-dot'));
    return g;
  }

  function drawSvg(res, data){
    var isEr = !!data.__er;
    var abs = absolutise(res);
    var W = Math.max(1, Math.ceil(res.width)), H = Math.max(1, Math.ceil(res.height));
    var svg = mk('svg', { viewBox:'0 0 '+W+' '+H, width:W, height:H, role:'img' }, 'dg');
    svg.style.maxWidth = '100%';
    svg.style.height = 'auto';

    var gGroup = mk('g', null, 'dg-groups');
    var gEdge  = mk('g', null, 'dg-edges');
    var gNode  = mk('g', null, 'dg-nodes');
    var gLabel = mk('g', null, 'dg-labels');
    svg.appendChild(gGroup); svg.appendChild(gEdge); svg.appendChild(gNode); svg.appendChild(gLabel);

    // subgraphs first: they are the ground everything else sits on
    Object.keys(abs).forEach(function(id){
      var a = abs[id], n = a.n;
      if (!n || !n.isGroup) return;
      var g = mk('g', { 'data-group': id }, 'dg-group');
      g.appendChild(mk('rect', { x:a.x, y:a.y, width:a.w, height:a.h, rx:12 }, 'dg-group-shape'));
      var t = mk('text', { x:a.x+16, y:a.y+18, 'text-anchor':'start' }, 'dg-group-text');
      t.textContent = n._m.lines.join(' ');
      g.appendChild(t);
      gGroup.appendChild(g);
    });

    Object.keys(abs).forEach(function(id){
      var a = abs[id], n = a.n;
      if (!n || n.isGroup) return;
      var st = styleOf(n);
      var g = mk('g', { 'data-node': id }, 'dg-el dg-node' + (n.shape === 'erBox' ? ' dg-er' : ''));
      if (n.shape === 'erBox'){ erBoxEl(g, a, n, st); gNode.appendChild(g); return; }
      var s = shapeEl(a.x, a.y, a.w, a.h, n.shape);
      s.setAttribute('class', 'dg-node-shape');
      if (st.fill) s.style.fill = st.fill;
      if (st.stroke) s.style.stroke = st.stroke;
      if (st['stroke-width']) s.style.strokeWidth = st['stroke-width'];
      if (st['stroke-dasharray']) s.style.strokeDasharray = st['stroke-dasharray'];
      g.appendChild(s);
      var t = textBlock(n._m, a.x + a.w/2, a.y + a.h/2, 'dg-node-text');
      if (st.color) t.style.fill = st.color;
      g.appendChild(t);
      gNode.appendChild(g);
    });

    (res.edges || []).forEach(function(e){
      var info = e._e || {};
      var src = info.start || (e.sources||[])[0];
      var dst = info.end || (e.targets||[])[0];
      var g = mk('g', { 'data-edge': e.id, 'data-src': src, 'data-dst': dst }, 'dg-el dg-edge');
      var runs = [];
      var st = styleOf(info);
      var o = edgeOrigin(data, abs, src, dst);
      var shift = function(p){ return { x: p.x + o.x, y: p.y + o.y }; };

      (e.sections || []).forEach(function(sec){
        runs.push([sec.startPoint].concat(sec.bendPoints || [], [sec.endPoint]).map(shift));
      });
      if (!runs.length) return;

      runs.forEach(function(pts, i){
        var d = roundedPath(pts, 7);
        g.appendChild(mk('path', { d:d, fill:'none' }, 'dg-edge-hit'));
        var line = mk('path', { d:d, fill:'none' }, 'dg-edge-line');
        if (info.pattern === 'dashed') line.style.strokeDasharray = '7 4';
        else if (info.pattern === 'dotted' || info.stroke === 'dotted') line.style.strokeDasharray = '4 3';
        if (info.thickness === 'thick' || info.stroke === 'thick') line.style.strokeWidth = '2.4';
        if (st.stroke) line.style.stroke = st.stroke;
        g.appendChild(line);

        if (i === runs.length - 1){
          if (isEr){
            var me = erMarker(pts[pts.length-1], pts[pts.length-2], info.arrowTypeEnd);
            if (me) g.appendChild(me);
          } else {
            var head = info.arrowTypeEnd === 'none' || info.type === 'arrow_open'
              ? null : (ARROW[info.arrowTypeEnd] || 'tri');
            if (head){
              var a = arrowHead(pts[pts.length-1], pts[pts.length-2], head);
              if (st.stroke){ a.style.fill = head === 'tri' ? st.stroke : ''; a.style.stroke = st.stroke; }
              g.appendChild(a);
            }
          }
        }
        if (i === 0){
          if (isEr){
            var ms = erMarker(pts[0], pts[1], info.arrowTypeStart);
            if (ms) g.appendChild(ms);
          } else if (info.arrowTypeStart && info.arrowTypeStart !== 'none'){
            g.appendChild(arrowHead(pts[0], pts[1], ARROW[info.arrowTypeStart] || 'tri'));
          }
        }
      });
      gEdge.appendChild(g);

      // the label, and the hairline that ties it to this arc and no other
      (e.labels || []).forEach(function(lb){
        var m = info._m;
        if (!m) return;
        var pts = runs[Math.floor(runs.length/2)] || runs[0];
        var lg = mk('g', { 'data-edge': e.id, 'data-src': src, 'data-dst': dst }, 'dg-el dg-label');
        var cx = lb.x + o.x + lb.width/2, cy = lb.y + o.y + lb.height/2;
        var pw = info._lw || lb.width, ph = info._lh || lb.height;
        var lx = cx - pw/2, ly = cy - ph/2;
        var anchor = pts.length > 1 ? nearestOnPath(pts, cx, cy) : null;
        if (anchor){
          var dx = anchor.x - cx, dy = anchor.y - cy;
          var hw = pw/2 + 3, hh = ph/2 + 3, ax = cx, ay = cy;
          if (dx || dy){
            var t = Math.min(Math.abs(dx) > 1e-6 ? hw/Math.abs(dx) : 1e9,
                             Math.abs(dy) > 1e-6 ? hh/Math.abs(dy) : 1e9);
            ax = cx + dx*t; ay = cy + dy*t;
          }
          if (Math.hypot(anchor.x-ax, anchor.y-ay) > 1.5){
            lg.appendChild(mk('line', { x1:ax, y1:ay, x2:anchor.x, y2:anchor.y }, 'dg-tie'));
          }
          lg.appendChild(mk('circle', { cx:anchor.x, cy:anchor.y, r:2.3 }, 'dg-tie-dot'));
        }
        lg.appendChild(mk('rect', { x:lx, y:ly, width:pw, height:ph, rx:5 }, 'dg-label-plate'));
        lg.appendChild(textBlock(m, cx, cy, 'dg-edge-text'));
        gLabel.appendChild(lg);
      });
    });

    return svg;
  }

  /* ------------------------------------------------------------- sequence
     A sequence diagram fails differently. Nothing has to be routed - every
     message is a straight line across the lanes - so what breaks is width.
     Mermaid opens each gap between two lifelines until the widest label that
     crosses it fits, so a diagram whose messages carry real payloads comes out
     thousands of pixels wide and is then shrunk into the column until none of
     it can be read. Its frames add their own trouble: the conditions of an alt
     float loose inside it, and an autonumber is a dot too small for its number.

     Here the lanes are only as far apart as the participants need. A label is
     wrapped - a path or a URL too, after its own punctuation - and may overhang
     the ends of its own arrow, but never as far as the next lifeline out, so it
     still sits over one message and no other; rows then take the height their
     label needs. Frames are measured from what they hold, each nested one inset
     in its parent, with the condition beside the keyword and every else, and,
     or option line named where it falls. Numbers are badges big enough to read,
     participants repeat at the foot of a long diagram and ride along the top of
     the page while it scrolls past, and hovering works as it does everywhere
     else: participants are the nodes and messages are the edges. */

  var SEQ = {
    fs: 11.5, textW: 220,          // message text, and how wide it runs before wrapping -
    wraps: [170, 190, 220, 250, 280, 310, 340],   // - chosen from these to suit the room
    actorFs: 12.5, actorW: 170,    // participant names
    // when the room is too narrow: [name width, message line width], tried in order
    squeeze: [[140, 220], [110, 220], [110, 190], [110, 170]],
    gap: 26,                       // the least clear space between two participant boxes
    arrow: 96,                     // the shortest arrow between neighbouring lanes
    maxGap: 300,                   // the widest a gap is opened to fill the room
    overhang: 62,                  // how far a label may run past either end of its arrow,
                                   // when the room is too narrow for it to fit its arrow
    clear: 14,                     // ... and how near it may come to the next lifeline out
    edge: 16,                      // how far past the first or last lane a label may start
    plateGap: 5, numGap: 11, rowGap: 15,
    selfW: 38, selfH: 20,
    noteExtra: 20, notePad: 10,    // a note runs a little wider than a message label
    framePad: 12, tabH: 19,
    bar: 9, badge: 8.5,
    tall: 420,                     // below this height nothing repeats or floats
    margin: 14
  };

  var FRAME_OPEN = { LOOP_START:'loop', ALT_START:'alt', OPT_START:'opt', PAR_START:'par',
    PAR_OVER_START:'par', CRITICAL_START:'critical', BREAK_START:'break', RECT_START:'rect' };
  var FRAME_SPLIT = { ALT_ELSE:'else', PAR_AND:'and', CRITICAL_OPTION:'option' };
  var FRAME_CLOSE = { LOOP_END:1, ALT_END:1, OPT_END:1, PAR_END:1, CRITICAL_END:1, BREAK_END:1, RECT_END:1 };

  // mermaid hands back Maps in some versions and plain objects in others
  function asObject(m){
    var o = {};
    if (m && typeof m.forEach === 'function' && !Array.isArray(m)) m.forEach(function(v, k){ o[k] = v; });
    else if (m) Object.keys(m).forEach(function(k){ o[k] = m[k]; });
    return o;
  }

  function headKind(type){
    if (/_OPEN$/.test(type)) return null;           // -> and -->: a line with no head
    if (/CROSS/.test(type)) return 'cross';          // -x
    if (/POINT$|STICK/.test(type)) return 'open';    // -) : asynchronous
    return 'tri';                                    // ->> and the rest
  }

  function kwWidth(word){
    cv.font = fontString(9.4, 620);
    return Math.ceil(cv.measureText(word).width + word.length * .5) + 14;
  }

  function textLeft(m, x, cy, cls){
    var t = mk('text', { x:x, y:cy, 'text-anchor':'start' }, cls);
    for (var i=0;i<m.lines.length;i++){
      var ts = mk('tspan', { x:x, dy: i ? m.lh : 0 });
      ts.textContent = m.lines[i];
      t.appendChild(ts);
    }
    return t;
  }

  // avail: the width it will be shown at, in pixels; 0 when not known yet
  function drawSequence(db, code, avail){
    var LT = db.LINETYPE, PL = db.PLACEMENT || { LEFTOF:0, RIGHTOF:1, OVER:2 };
    var typeName = {};
    Object.keys(LT).forEach(function(k){ typeName[LT[k]] = k; });

    /* --- participants --- */

    var actorMap = asObject(db.getActors());
    var keys = db.getActorKeys ? db.getActorKeys() : Object.keys(actorMap);
    var created = asObject(db.getCreatedActors && db.getCreatedActors());
    var destroyed = asObject(db.getDestroyedActors && db.getDestroyedActors());
    var actors = keys.map(function(k, i){
      var a = actorMap[k] || {};
      return { id:k, i:i, type:a.type || 'participant', label: a.description || k };
    });
    if (!actors.length) throw new Error('no participants');
    var byId = {};
    actors.forEach(function(a){ byId[a.id] = a; });

    // Fitting the diagram to its room measures the same text at the same few
    // widths over and over; each answer is kept for the length of this drawing.
    // (Not longer: the measurements change once the webfont has loaded.)
    var memo = {};
    var fit = function(text, px, width, weight){
      var key = px + '|' + width + '|' + (weight || '') + '|' + text;
      return memo[key] || (memo[key] = measure(text, px, width, weight, true));
    };

    // names are measured for a given line width too; every box in the row is as tall as the tallest
    var headH = 0;
    var remeasureActors = function(width){
      actors.forEach(function(a){
        a.m = fit(a.label, SEQ.actorFs, width, 560);
        a.w = Math.round(Math.max(a.m.w + PAD_X*2 + (a.type === 'actor' ? 20 : 0), 72));
      });
      headH = Math.round(Math.max.apply(null, actors.map(function(a){ return a.m.h; })) + PAD_Y*2 +
        (actors.some(function(a){ return a.type === 'database'; }) ? 12 : 0));
    };
    remeasureActors(SEQ.actorW);

    /* --- the message list, flattened --- */

    var items = [], num = 1, step = 1, numbered = false, count = 0;
    db.getMessages().forEach(function(m, mi){
      var t = typeName[m.type] || '';
      if (t === 'AUTONUMBER'){
        var o = m.message || {};
        num = o.start || num;
        step = o.step || step;
        numbered = o.visible !== false;
        return;
      }
      if (t === 'NOTE'){
        if (byId[m.from]) items.push({ kind:'note', from:m.from, to: byId[m.to] ? m.to : m.from,
                                       place:m.placement, text:m.message });
        return;
      }
      if (t === 'ACTIVE_START' || t === 'ACTIVE_END'){
        if (byId[m.from]) items.push({ kind: t === 'ACTIVE_START' ? 'on' : 'off', actor:m.from });
        return;
      }
      if (FRAME_OPEN[t]){ items.push({ kind:'open', frame:FRAME_OPEN[t], text:m.message }); return; }
      if (FRAME_SPLIT[t]){ items.push({ kind:'split', word:FRAME_SPLIT[t], text:m.message }); return; }
      if (FRAME_CLOSE[t]){ items.push({ kind:'close' }); return; }
      if (!byId[m.from] || !byId[m.to]) return;
      count++;
      items.push({ kind:'msg', id:'m' + mi, from:m.from, to:m.to, type:t, text:m.message,
        a: byId[m.from].i, b: byId[m.to].i, n: numbered ? num : null,
        born: created[m.to] === mi ? m.to : created[m.from] === mi ? m.from : null,
        dies: destroyed[m.to] === mi ? m.to : destroyed[m.from] === mi ? m.from : null });
      num += step;
    });

    // labels are measured for a given line width, which the fitting below may change
    var remeasure = function(width){
      items.forEach(function(it){
        if (it.kind === 'msg'){
          it.m = String(decode(it.text)).trim() ? fit(it.text, SEQ.fs, width) : null;
          it.pw = it.m ? it.m.w + 14 : 0;
          it.ph = it.m ? it.m.h + 6 : 0;
        } else if (it.kind === 'note'){
          it.m = fit(it.text, SEQ.fs, width + SEQ.noteExtra);
          it.w = it.m.w + SEQ.notePad*2;
          it.h = Math.round(it.m.h + SEQ.notePad*1.4);
        }
      });
    };
    remeasure(SEQ.textW);

    /* --- lanes --- */

    var n = actors.length, X = [0];

    // Where a label's plate starts, between the leftmost lane xl and the
    // rightmost xr of its message: centred, except on the first or last lane,
    // where hanging out past the edge of the diagram widens it for nothing -
    // there the label is moved inwards, over its own arrow.
    var plateLeft = function(xl, xr, a, b, pw){
      var left = (xl + xr)/2 - pw/2;
      if (a === 0 && b === n-1) return left;
      if (a === 0) left = Math.max(left, xl - SEQ.edge);
      if (b === n-1) left = Math.min(left, xr + (a === b ? SEQ.selfW + 6 : SEQ.edge) - pw);
      return left;
    };

    // The gaps between lanes for one allowance of overhang: each starts as wide
    // as its two participants need and opens further only where a label asks.
    var solveGaps = function(overhang){
      var gap = [];
      for (var k=0;k<n-1;k++) gap.push(Math.max((actors[k].w + actors[k+1].w)/2 + SEQ.gap, SEQ.arrow));
      var span = function(a, b){ var s = 0; for (var j=a;j<b;j++) s += gap[j]; return s; };
      // a shortfall is shared out across every gap the message crosses
      var widen = function(a, b, need){
        var have = span(a, b);
        if (b <= a || have >= need - .5) return false;
        for (var j=a;j<b;j++) gap[j] += (need - have)/(b - a);
        return true;
      };
      for (var pass=0; pass<8; pass++){
        var moved = false;
        items.forEach(function(it){
          if (it.kind === 'note'){
            var ni = byId[it.from].i;
            if (it.place === PL.RIGHTOF && ni < n-1) moved = widen(ni, ni+1, it.w + 12 + SEQ.clear) || moved;
            if (it.place === PL.LEFTOF && ni > 0) moved = widen(ni-1, ni, it.w + 12 + SEQ.clear) || moved;
            return;
          }
          if (it.kind !== 'msg') return;
          var a = Math.min(it.a, it.b), b = Math.max(it.a, it.b);
          if (a !== b){
            if (it.born) moved = widen(a, b, actors[byId[it.born].i].w/2 + 48) || moved;
            moved = widen(a, b, it.pw - overhang*2) || moved;
          }
          // wherever the label ends up, it stops short of the next lifeline out
          // (and a message to itself leaves room for its loop, which runs right)
          var xl = span(0, a), xr = span(0, b), left = plateLeft(xl, xr, a, b, it.pw);
          if (a > 0) moved = widen(a-1, a, xl - left + SEQ.clear) || moved;
          if (b < n-1) moved = widen(b, b+1, Math.max(left + it.pw - xr, a === b ? SEQ.selfW + 10 : 0) + SEQ.clear) || moved;
        });
        if (!moved) break;
      }
      return gap;
    };
    var placeLanes = function(gap){
      X = [0];
      for (var k=0;k<gap.length;k++) X.push(X[k] + gap[k]);
      X = X.map(Math.round);
    };
    var lane = function(id){ return X[byId[id].i]; };

    var noteSpan = function(it){
      var xa = lane(it.from), xb = lane(it.to), l, r;
      if (it.place === PL.LEFTOF){ r = xa - 12; l = r - it.w; }
      else if (it.place === PL.RIGHTOF){ l = xa + 12; r = l + it.w; }
      else {
        var reach = xa === xb ? 0 : 28;
        l = Math.min(xa, xb) - reach; r = Math.max(xa, xb) + reach;
        if (r - l < it.w){ var c = (l + r)/2; l = c - it.w/2; r = c + it.w/2; }
      }
      return [Math.round(l), Math.round(r)];
    };

    var extent = function(it){
      if (it.kind === 'note') return noteSpan(it);
      if (it.kind === 'on' || it.kind === 'off') return [lane(it.actor) - SEQ.bar, lane(it.actor) + SEQ.bar];
      if (it.kind !== 'msg') return null;
      var xa = X[it.a], xb = X[it.b], xl = Math.min(xa, xb), xr = Math.max(xa, xb);
      var left = plateLeft(xl, xr, Math.min(it.a, it.b), Math.max(it.a, it.b), it.pw);
      var l = Math.min(xl, left), r = Math.max(xr, left + it.pw);
      if (it.a === it.b) r = Math.max(r, xa + SEQ.selfW + 6);
      if (it.n != null){ l = Math.min(l, xa - SEQ.badge - 4); r = Math.max(r, xa + SEQ.badge + 4); }
      if (it.born){
        var bx = lane(it.born), bw = byId[it.born].w/2;
        l = Math.min(l, bx - bw); r = Math.max(r, bx + bw);
      }
      return [l, r];
    };

    /* --- frames: measured from what they hold, each one inside its parent --- */

    // balanced once: an else or an end with no frame to belong to is dropped,
    // and a frame left open is closed at the end
    var unclosed = 0;
    items = items.filter(function(it){
      if (it.kind === 'open') unclosed++;
      if (it.kind === 'split' && !unclosed) return false;
      if (it.kind === 'close'){ if (!unclosed) return false; unclosed--; }
      return true;
    });
    while (unclosed-- > 0) items.push({ kind:'close' });

    var frames = [];
    var finish = function(f){
      if (!isFinite(f.l)){ f.l = X[0] - 40; f.r = X[0] + 120; }
      f.l -= SEQ.framePad; f.r += SEQ.framePad;
      if (f.frame !== 'rect'){
        f.kw = f.frame.toUpperCase(); f.kwW = kwWidth(f.kw);
        var widest = function(text, kwW){
          return String(decode(text)).trim() ? kwW + Math.min(fit(text, SEQ.fs, 0).w, 300) + 30 : kwW + 16;
        };
        var need = widest(f.text, f.kwW);
        f.splits.forEach(function(s){ s.kw = s.word.toUpperCase(); s.kwW = kwWidth(s.kw); need = Math.max(need, widest(s.text, s.kwW)); });
        f.r = Math.max(f.r, f.l + need);
      }
      if (f.parent){ f.parent.l = Math.min(f.parent.l, f.l); f.parent.r = Math.max(f.parent.r, f.r); }
    };
    var buildFrames = function(){
      var stack = [];
      frames = [];
      items.forEach(function(it){
        if (it.kind === 'open'){
          it.f = { frame:it.frame, text:it.text, l:Infinity, r:-Infinity, splits:[], parent: stack[stack.length-1] || null };
          frames.push(it.f);
          stack.push(it.f);
          return;
        }
        if (it.kind === 'split'){ it.f = stack[stack.length-1]; it.f.splits.push(it); return; }
        if (it.kind === 'close'){ it.f = stack.pop(); finish(it.f); return; }
        var e = extent(it), top = stack[stack.length-1];
        if (e && top){ top.l = Math.min(top.l, e[0]); top.r = Math.max(top.r, e[1]); }
      });
    };

    // read from the source: mermaid keeps the title in state shared by every
    // diagram, and the next one parsed on the page clears it
    var title = String(decode((String(code || '').match(/^\s*title(?:\s*:\s*|\s+)(.+?)\s*$/m) || [])[1] || '')).trim();
    var titleM = title ? measure(title, 14, 0, 620) : null;
    var boxes = (db.getBoxes && db.getBoxes()) || [];
    var boxTitled = boxes.some(function(b){ return b.name && String(b.name).trim(); });

    // everything that takes horizontal room, for the lanes as they stand
    var bounds = function(){
      var minX = Infinity, maxX = -Infinity;
      var take = function(l, r){ minX = Math.min(minX, l); maxX = Math.max(maxX, r); };
      actors.forEach(function(a){ take(X[a.i] - a.w/2, X[a.i] + a.w/2); });
      items.forEach(function(it){ var e = extent(it); if (e) take(e[0], e[1]); });
      frames.forEach(function(f){ take(f.l, f.r); });
      var boxRects = boxes.map(function(b){
        var ids = (b.actorKeys || []).filter(function(id){ return byId[id]; });
        if (!ids.length) return null;
        var l = Math.min.apply(null, ids.map(function(id){ return lane(id) - byId[id].w/2; })) - 14;
        var r = Math.max.apply(null, ids.map(function(id){ return lane(id) + byId[id].w/2; })) + 14;
        take(l, r);
        return { b:b, l:l, r:r };
      }).filter(Boolean);
      if (titleM) take((minX + maxX)/2 - titleM.w/2, (minX + maxX)/2 + titleM.w/2);
      return { minX: Math.floor(minX - SEQ.margin), maxX: Math.ceil(maxX + SEQ.margin), boxRects: boxRects };
    };
    var widthFor = function(gap){
      placeLanes(gap);
      buildFrames();
      var b = bounds();
      return b.maxX - b.minX;
    };

    /* --- using the room there is ---
       Compact is the fallback, not the aim. Given the width the diagram will be
       shown at, it is laid out to fill that width, in order of what helps the
       reader most: first the overhang is taken back, so every label sits within
       its own arrow; then labels get longer lines, so they take fewer of them;
       then the narrowest gaps are raised - never past SEQ.maxGap, so two
       participants do not end up a whole column apart. A diagram too wide for
       the room goes the other way: its labels wrap shorter before the whole
       drawing is shrunk to fit. */

    var chosen = solveGaps(SEQ.overhang), wraps = SEQ.wraps, k;
    if (avail > 0 && n > 1 && widthFor(chosen) > avail){
      // Narrower participant names first - wide names set the least gap between
      // lanes, and wrapping one only makes the header row taller - then shorter
      // message lines, which make every row taller.
      var tryFit = function(names, lines){
        remeasureActors(names);
        remeasure(lines);
        chosen = solveGaps(SEQ.overhang);
        return widthFor(chosen) <= avail;
      };
      var fitted = SEQ.squeeze.some(function(s){ return tryFit(s[0], s[1]); });
      // shorter lines that still do not fit only make it taller: keep the usual ones
      if (!fitted) tryFit(SEQ.squeeze[SEQ.squeeze.length - 1][0], SEQ.textW);
    } else if (avail > 0 && n > 1){
      var loose = solveGaps(0);
      if (widthFor(loose) > avail){
        var lo = 0, hi = SEQ.overhang;
        for (k=0;k<7;k++){
          var mid = (lo + hi)/2, g = solveGaps(mid);
          if (widthFor(g) <= avail){ chosen = g; hi = mid; } else lo = mid;
        }
      } else {
        for (k = wraps.indexOf(SEQ.textW) + 1; k < wraps.length; k++){
          remeasure(wraps[k]);
          var longer = solveGaps(0);
          if (widthFor(longer) > avail){ remeasure(wraps[k-1]); break; }
          loose = longer;
        }
        var room = avail - widthFor(loose);
        var raise = function(level){
          return loose.map(function(gp){ return Math.max(gp, Math.min(level, SEQ.maxGap)); });
        };
        var added = function(level){
          return raise(level).reduce(function(s, gp, j){ return s + gp - loose[j]; }, 0);
        };
        var level = SEQ.maxGap;
        if (added(level) > room){
          var lo2 = Math.min.apply(null, loose), hi2 = SEQ.maxGap;
          for (k=0;k<20;k++){ var m2 = (lo2 + hi2)/2; if (added(m2) > room) hi2 = m2; else lo2 = m2; }
          level = lo2;
        }
        chosen = raise(level);
        // what grows with the lanes - a frame's reach, a centred note - is measured, not assumed
        for (k=0;k<4;k++){
          var over = widthFor(chosen) - avail;
          if (over <= 1) break;
          chosen = chosen.map(function(gp, j){ return Math.max(loose[j], gp - over/chosen.length); });
        }
      }
    }
    placeLanes(chosen);
    buildFrames();

    /* --- rows, top to bottom --- */

    var y = SEQ.margin;
    if (titleM) y += titleM.h + 14;
    if (boxes.length) y += boxTitled ? 28 : 12;
    var headTop = y, headBottom = y + headH;
    y = headBottom + 18;

    var active = {}, bars = [], born = {}, died = {};
    var depth = function(id){ return (active[id] || []).length; };
    // where an arrow meets a lane: the edge of an activation bar, if one is open
    var meet = function(id, side, extra){
      var d = depth(id) + (extra || 0);
      return d ? lane(id) + (d - 1)*SEQ.bar/2 + side*SEQ.bar/2 : lane(id);
    };

    items.forEach(function(it, k){
      var prev = items[k-1], next = items[k+1];
      if (it.kind === 'msg'){
        var gapBelow = it.n != null ? SEQ.numGap : SEQ.plateGap;
        var arrowY = y + (it.ph ? it.ph + gapBelow : gapBelow + 2);
        if (it.born) arrowY = Math.max(arrowY, y + headH/2 + 2);
        it.top = y;
        it.y = Math.round(arrowY);
        var dir = it.b >= it.a ? 1 : -1;
        var opens = next && next.kind === 'on' && next.actor === it.to ? 1 : 0;
        if (it.a === it.b){
          it.x1 = meet(it.from, 1);
          it.x2 = meet(it.from, 1, opens);
        } else {
          // a participant created by this message is met at its box, not its lane
          it.x1 = it.born === it.from ? lane(it.from) + dir*byId[it.from].w/2 : meet(it.from, dir);
          it.x2 = it.born === it.to ? lane(it.to) - dir*byId[it.to].w/2 : meet(it.to, -dir, opens);
        }
        if (it.born) born[it.born] = it.y;
        if (it.dies) died[it.dies] = it.y + 16;
        y = it.y + (it.a === it.b ? SEQ.selfH : 0) + (it.born ? headH/2 : 0) + SEQ.rowGap;
        return;
      }
      var anchor = prev && prev.kind === 'msg' ? prev.y + (prev.a === prev.b ? SEQ.selfH : 0) : y;
      if (it.kind === 'on'){
        (active[it.actor] = active[it.actor] || []).push({ y0: anchor, d: depth(it.actor) });
        return;
      }
      if (it.kind === 'off'){
        var open = active[it.actor] && active[it.actor].pop();
        if (open) bars.push({ actor:it.actor, y0:open.y0, y1:Math.max(anchor, open.y0 + 14), d:open.d });
        return;
      }
      if (it.kind === 'note'){
        var sp = noteSpan(it);
        it.l = sp[0]; it.r = sp[1]; it.y = y;
        y += it.h + SEQ.rowGap;
        return;
      }
      var f = it.f;
      if (!f) return;
      var labelFor = function(text, kwW){
        return String(decode(text)).trim()
          ? measure(text, SEQ.fs, Math.max(f.r - f.l - kwW - 30, 120), null, true) : null;
      };
      if (it.kind === 'open'){
        f.y0 = y - 4;
        if (f.frame === 'rect'){ y += 8; return; }
        f.cond = labelFor(f.text, f.kwW);
        y = f.y0 + Math.max(SEQ.tabH, f.cond ? f.cond.h + 6 : 0) + 14;
        return;
      }
      if (it.kind === 'split'){
        it.y = y - 4;
        it.cond = labelFor(it.text, it.kwW);
        y = it.y + Math.max(SEQ.tabH, it.cond ? it.cond.h + 6 : 0) + 14;
        return;
      }
      if (it.kind === 'close'){
        f.y1 = y - (f.frame === 'rect' ? 6 : 2);
        y = f.y1 + SEQ.rowGap + 2;
      }
    });

    var lifeEnd = y + 4;
    Object.keys(active).forEach(function(id){
      active[id].forEach(function(b){ bars.push({ actor:id, y0:b.y0, y1:Math.max(lifeEnd - 10, b.y0 + 14), d:b.d }); });
    });
    var tall = lifeEnd - headBottom > SEQ.tall;
    var footTop = lifeEnd, footBottom = tall ? footTop + headH : lifeEnd;
    var boxBottom = footBottom + 12;

    var bb = bounds(), minX = bb.minX, maxX = bb.maxX, boxRects = bb.boxRects;
    var W = maxX - minX, H = Math.ceil((boxRects.length ? boxBottom : footBottom) + SEQ.margin);

    /* --- drawing --- */

    var svg = mk('svg', { viewBox: minX + ' 0 ' + W + ' ' + H, width:W, height:H, role:'img' }, 'dg dg-seq');
    svg.style.maxWidth = '100%';
    svg.style.height = 'auto';
    var layer = function(cls){ var g = mk('g', null, cls); svg.appendChild(g); return g; };
    var gBox = layer('dg-seq-boxes'), gFrame = layer('dg-seq-frames'), gNode = layer('dg-nodes'),
        gEdge = layer('dg-edges'), gNote = layer('dg-seq-notes'), gLabel = layer('dg-labels'),
        gMark = layer('dg-seq-marks');

    if (titleM) svg.insertBefore(textBlock(titleM, (minX + maxX)/2, SEQ.margin + titleM.h/2, 'dg-seq-title'), gBox);

    boxRects.forEach(function(br){
      var top = headTop - (boxTitled ? 28 : 12);
      var rect = mk('rect', { x:br.l, y:top, width:br.r - br.l, height:boxBottom - top, rx:12 }, 'dg-seq-box');
      if (br.b.fill && !/^(transparent|none)$/i.test(br.b.fill)){ rect.style.fill = br.b.fill; rect.style.fillOpacity = '.13'; }
      gBox.appendChild(rect);
      if (br.b.name && String(br.b.name).trim()){
        gBox.appendChild(textBlock(measure(br.b.name, 12, br.r - br.l - 20, 560), (br.l + br.r)/2, top + 14, 'dg-seq-box-text'));
      }
    });

    var actorEl = function(g, a, top){
      var x = X[a.i], w = a.w, h = headH, l = x - w/2, shape;
      if (a.type === 'collections') g.appendChild(mk('rect', { x:l + 4, y:top - 4, width:w, height:h, rx:8 }, 'dg-node-shape'));
      if (a.type === 'database') shape = shapeEl(l, top, w, h, 'cylinder');
      else shape = mk('rect', { x:l, y:top, width:w, height:h, rx: a.type === 'queue' ? h/2 : 8 });
      shape.setAttribute('class', 'dg-node-shape');
      g.appendChild(shape);
      var cx = x, cy = top + h/2 + (a.type === 'database' ? 5 : 0);
      if (a.type === 'actor'){
        var gx = l + PAD_X + 3;
        cx = x + 10;
        g.appendChild(mk('circle', { cx:gx, cy:cy - 4.5, r:3.4 }, 'dg-seq-glyph'));
        g.appendChild(mk('path', { d:'M'+(gx - 6)+','+(cy + 7)+' a6,6.5 0 0 1 12,0' }, 'dg-seq-glyph'));
      }
      g.appendChild(textBlock(a.m, cx, cy, 'dg-node-text dg-seq-actor'));
    };

    actors.forEach(function(a){
      var x = X[a.i];
      var g = mk('g', { 'data-node':a.id }, 'dg-el dg-node');
      var y0 = born[a.id] != null ? born[a.id] + headH/2 : headBottom;
      var y1 = died[a.id] != null ? died[a.id] : footTop;
      g.appendChild(mk('line', { x1:x, y1:y0, x2:x, y2:y1 }, 'dg-seq-life-hit'));
      g.appendChild(mk('line', { x1:x, y1:y0, x2:x, y2:y1 }, 'dg-seq-life'));
      bars.forEach(function(b){
        if (b.actor !== a.id) return;
        g.appendChild(mk('rect', { x:x - SEQ.bar/2 + b.d*SEQ.bar/2, y:b.y0, width:SEQ.bar, height:b.y1 - b.y0, rx:2 }, 'dg-seq-bar'));
      });
      if (died[a.id] != null){
        g.appendChild(mk('path', { d:'M'+(x-6)+','+(y1-6)+' L'+(x+6)+','+(y1+6)+' M'+(x+6)+','+(y1-6)+' L'+(x-6)+','+(y1+6) }, 'dg-seq-x'));
      }
      actorEl(g, a, born[a.id] != null ? born[a.id] - headH/2 : headTop);
      if (tall && died[a.id] == null) actorEl(g, a, footTop);
      gNode.appendChild(g);
    });

    items.forEach(function(it){
      if (it.kind !== 'msg') return;
      var g = mk('g', { 'data-edge':it.id, 'data-src':it.from, 'data-dst':it.to }, 'dg-el dg-edge');
      var y = it.y, x1 = it.x1, x2 = it.x2, d, tip, back, tail, tailBack;
      if (it.a === it.b){
        // the badge sits on the lane like any other; the loop leaves from its edge
        var r = 6, xr = Math.max(x1, x2) + SEQ.selfW, yb = y + SEQ.selfH;
        var xs = it.n != null ? x1 + SEQ.badge + 1 : x1;
        d = 'M'+xs+','+y+' H'+(xr - r)+' Q'+xr+','+y+' '+xr+','+(y + r)+' V'+(yb - r)+
            ' Q'+xr+','+yb+' '+(xr - r)+','+yb+' H'+x2;
        tip = { x:x2, y:yb }; back = { x:x2 + 10, y:yb };
        tail = { x:x1, y:y }; tailBack = { x:x1 + 10, y:y };
      } else {
        var s = x2 > x1 ? 1 : -1;
        d = 'M'+x1+','+y+' H'+x2;
        tip = { x:x2, y:y }; back = { x:x2 - s*10, y:y };
        tail = { x:x1, y:y }; tailBack = { x:x1 + s*10, y:y };
      }
      g.appendChild(mk('path', { d:d, fill:'none' }, 'dg-edge-hit'));
      var line = mk('path', { d:d, fill:'none' }, 'dg-edge-line');
      if (/DOTTED/.test(it.type)) line.style.strokeDasharray = '6 4';
      g.appendChild(line);
      var head = headKind(it.type);
      if (head) g.appendChild(arrowHead(tip, back, head));
      if (/BIDIRECTIONAL/.test(it.type)){
        if (it.n != null && it.a !== it.b){
          var nudge = (x2 > x1 ? 1 : -1) * (SEQ.badge + 1);
          tail = { x:x1 + nudge, y:y }; tailBack = { x:tailBack.x + nudge, y:y };
        }
        g.appendChild(arrowHead(tail, tailBack, 'tri'));
      }
      gEdge.appendChild(g);

      var lg = mk('g', { 'data-edge':it.id, 'data-src':it.from, 'data-dst':it.to }, 'dg-el dg-label');
      if (it.m){
        var pl = plateLeft(Math.min(X[it.a], X[it.b]), Math.max(X[it.a], X[it.b]), Math.min(it.a, it.b), Math.max(it.a, it.b), it.pw);
        var cx = pl + it.pw/2;
        lg.appendChild(mk('rect', { x:pl, y:it.top, width:it.pw, height:it.ph, rx:5 }, 'dg-label-plate'));
        lg.appendChild(textBlock(it.m, cx, it.top + it.ph/2, 'dg-edge-text dg-seq-text'));
      }
      if (it.n != null){
        var label = String(it.n);
        cv.font = fontString(9.6, 620);
        var bw = Math.max(SEQ.badge*2, Math.ceil(cv.measureText(label).width) + 9);
        lg.appendChild(mk('rect', { x:x1 - bw/2, y:y - SEQ.badge, width:bw, height:SEQ.badge*2, rx:SEQ.badge }, 'dg-seq-num'));
        var nt = mk('text', { x:x1, y:y + .5, 'text-anchor':'middle' }, 'dg-seq-num-text');
        nt.textContent = label;
        lg.appendChild(nt);
      }
      gLabel.appendChild(lg);
    });

    items.forEach(function(it){
      if (it.kind !== 'note') return;
      gNote.appendChild(mk('rect', { x:it.l, y:it.y, width:it.r - it.l, height:it.h, rx:6 }, 'dg-seq-note'));
      gNote.appendChild(textBlock(it.m, (it.l + it.r)/2, it.y + it.h/2, 'dg-seq-note-text'));
    });

    // the keyword on a tab, the condition on a plate beside it
    var mark = function(f, top, kw, kwW, cond, first){
      var l = f.l, h = SEQ.tabH;
      gMark.appendChild(mk('path', { d: first
        ? 'M'+l+','+(top + h)+' V'+(top + 8)+' A8,8 0 0 1 '+(l + 8)+','+top+' H'+(l + kwW)+' V'+(top + h - 6)+
          ' A6,6 0 0 1 '+(l + kwW - 6)+','+(top + h)+' Z'
        : 'M'+l+','+top+' H'+(l + kwW)+' V'+(top + h - 6)+' A6,6 0 0 1 '+(l + kwW - 6)+','+(top + h)+' H'+l+' Z'
      }, 'dg-seq-tab'));
      var kt = mk('text', { x:l + kwW/2, y:top + h/2 + .5, 'text-anchor':'middle' }, 'dg-seq-kw');
      kt.textContent = kw;
      gMark.appendChild(kt);
      if (!cond) return;
      var tx = l + kwW + 9;
      gMark.appendChild(mk('rect', { x:tx - 4, y:top + 2, width:cond.w + 8, height:cond.h + 2, rx:4 }, 'dg-label-plate'));
      gMark.appendChild(textLeft(cond, tx, top + 3 + cond.lh/2, 'dg-seq-cond'));
    };

    frames.forEach(function(f){
      if (f.y0 == null || f.y1 == null) return;
      if (f.frame === 'rect'){
        var band = mk('rect', { x:f.l, y:f.y0, width:f.r - f.l, height:f.y1 - f.y0, rx:8 }, 'dg-seq-rect');
        if (f.text) band.style.fill = decode(f.text);
        gFrame.appendChild(band);
        return;
      }
      gFrame.appendChild(mk('rect', { x:f.l, y:f.y0, width:f.r - f.l, height:f.y1 - f.y0, rx:8 }, 'dg-seq-frame'));
      mark(f, f.y0, f.kw, f.kwW, f.cond, true);
      f.splits.forEach(function(s){
        if (s.y == null) return;
        gFrame.appendChild(mk('line', { x1:f.l, y1:s.y, x2:f.r, y2:s.y }, 'dg-seq-split'));
        mark(f, s.y, s.kw, s.kwW, s.cond, false);
      });
    });

    // the participant row alone, to ride along the top of the page
    var strip = null;
    if (tall){
      strip = mk('svg', { viewBox: minX + ' ' + (headTop - 7) + ' ' + W + ' ' + (headH + 14),
                          preserveAspectRatio:'xMidYMin meet' }, 'dg dg-seq dg-float-svg');
      actors.forEach(function(a){
        if (born[a.id] != null) return;
        var g = mk('g', { 'data-node':a.id }, 'dg-el dg-node');
        actorEl(g, a, headTop);
        strip.appendChild(g);
      });
      strip._top = headTop - 7;
      strip._h = headH + 14;
    }

    return { svg:svg, strip:strip, count:count };
  }

  function renderSequence(fig, code){
    return Promise.resolve(mermaid.mermaidAPI.getDiagramFromText(code)).then(function(d){
      var db = d && d.db;
      if (!db || typeof db.getMessages !== 'function' || !db.LINETYPE) throw new Error('no sequence model');
      var out = fig.querySelector('.diagram-out');
      var avail = out.clientWidth;
      var res = drawSequence(db, code, avail);
      out.textContent = '';
      out.appendChild(res.svg);
      fig._seqWidth = avail;
      refitOnResize(fig, out);
      if (res.strip){
        var wrap = el('div', 'dg-float');
        wrap.appendChild(res.strip);
        wrap._main = res.svg;
        res.strip._main = res.svg;
        res.svg._float = res.strip;
        out.appendChild(wrap);
      }
      var note = fig.querySelector('.diagram-note');
      if (res.count >= 6){
        if (!note){ note = el('div','diagram-note'); fig.appendChild(note); }
        note.textContent = 'Hover a message or a participant to isolate it · click to pin · Esc to release';
      } else if (note) note.remove();
      scheduleFloats();
    });
  }

  // The lanes of a sequence, and the shape of an ER diagram, are fitted to the
  // width the diagram had when it was drawn. When that changes - the window resized, the sidebar folded away, a folded
  // section opened for the first time - it is drawn again for the new width.
  function refitOnResize(fig, out){
    if (fig._seqRefit || typeof ResizeObserver === 'undefined') return;
    var timer = 0;
    fig._seqRefit = new ResizeObserver(function(){
      clearTimeout(timer);
      timer = setTimeout(function(){
        var w = out.isConnected ? out.clientWidth : 0;
        // a scrollbar coming and going is not a reason to redraw
        if (!w || fig.dataset.drawn !== 'clean' || Math.abs(w - (fig._seqWidth || 0)) < 16) return;
        fig.dataset.drawn = '';
        draw(fig, 'clean');
      }, 120);
    });
    fig._seqRefit.observe(out);
  }

  // A long sequence outlives its own header: a few screens down, which lane
  // is which becomes a guess. While the diagram is on screen and its header is
  // not, the participant row is laid over the top of it, lane for lane.
  function placeFloats(){
    var bar = document.getElementById('topbar');
    var edge = bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 0;
    [].slice.call(document.querySelectorAll('.dg-float')).forEach(function(f){
      var svg = f._main, strip = f.firstChild, fig = f.closest('.diagram');
      if (!svg || !strip || !fig || !svg.isConnected) return;
      var vb = svg.viewBox && svg.viewBox.baseVal, r = svg.getBoundingClientRect();
      if (!vb || !vb.width || !r.width){ f.classList.remove('on'); return; }
      var k = r.width / vb.width, h = strip._h * k;
      var on = r.top + (strip._top + strip._h - vb.y) * k < edge && r.bottom - h * 3 > edge;
      f.classList.toggle('on', on);
      if (!on) return;
      var fr = fig.getBoundingClientRect();
      f.style.top = Math.round(edge - fr.top - fig.clientTop + fig.scrollTop) + 'px';
      f.style.height = Math.round(h) + 'px';
      strip.style.left = Math.round(r.left - fr.left - fig.clientLeft + fig.scrollLeft) + 'px';
      strip.style.width = Math.round(r.width) + 'px';
      strip.style.height = Math.round(h) + 'px';
    });
  }
  var floatTick = false;
  function scheduleFloats(){
    if (floatTick) return;
    floatTick = true;
    requestAnimationFrame(function(){ floatTick = false; placeFloats(); });
  }
  addEventListener('scroll', scheduleFloats, { passive: true });
  addEventListener('resize', scheduleFloats);
  // the page's own top bar slides in and out; the row sits under it
  document.addEventListener('transitionend', function(e){
    if (e.target && e.target.id === 'topbar') scheduleFloats();
  });

  /* --------------------------------------------------------------- render */

  // The types the clean renderer draws. Everything else - state, class,
  // gantt, pie - goes to mermaid, which draws them well.
  var CLEAN_KINDS = { flowchart:'flowchart', graph:'flowchart', erdiagram:'er', sequencediagram:'sequence' };

  function cleanKind(code){
    var head = String(code).replace(/^\s*(%%\{[\s\S]*?\}%%\s*)*/, '').trim().split(/[\s\n]/)[0] || '';
    return CLEAN_KINDS[head.toLowerCase()] || null;
  }

  // a sequence is laid out here, not by ELK, so it only needs mermaid's parser
  function canClean(kind){
    return (kind === 'sequence' || typeof ELK !== 'undefined') && typeof mermaid !== 'undefined' &&
           mermaid.mermaidAPI && typeof mermaid.mermaidAPI.getDiagramFromText === 'function';
  }

  function renderClean(fig, code, kind){
    if (!initMermaid()) return Promise.reject(new Error('mermaid unavailable'));
    if (kind === 'sequence') return renderSequence(fig, code);
    if (!elk) elk = new ELK();
    return Promise.resolve(mermaid.mermaidAPI.getDiagramFromText(code)).then(function(d){
      var db = d && d.db;
      if (!db || typeof db.getData !== 'function') throw new Error('no graph model');
      var data = db.getData();
      if (!data || !data.nodes || !data.nodes.length) throw new Error('nothing to draw');
      // Flowcharts and ER diagrams hand back the same shape of model, which is
      // why one layout and one drawing pass serve both; only the sizes, the
      // end marks and the box itself differ.
      data.__er = kind === 'er';
      if (data.__er){
        attachDetails(data, code);
        var open = fig._open || {};
        // the width an opened entity can take without widening the diagram past the page
        var room = fig.querySelector('.diagram-out').clientWidth;
        room = room ? room - Number(SPACING.er.pad) * 2 - 4 : 0;
        data.nodes.forEach(function(n){
          n._open = !!(n._details && open[n.label]);
          n._room = room;
        });
      }
      var raw = (db.getDirection && db.getDirection()) || 'TB';
      var dir = DIRS[String(raw).toUpperCase()] || 'DOWN';
      var avail = fig.querySelector('.diagram-out').clientWidth;
      var shape = { dir: dir, extra: null };
      var layout = function(){ return elk.layout(buildGraph(data, shape.dir, shape.extra)); };
      var first = !data.__er || !avail ? layout() : Promise.all(erShapes(code, dir, avail).map(function(sh){
        return elk.layout(buildGraph(data, sh.dir, sh.extra)).then(function(res){
          return { dir: sh.dir, extra: sh.extra, res: res };
        }, function(){ return null; });
      })).then(function(tries){
        tries = tries.filter(Boolean);
        if (!tries.length) return layout();
        var best = pickShape(tries, avail);
        shape = { dir: best.dir, extra: best.extra };
        return best.res;
      });
      return first.then(function(res){
        // Relationships routed around an opened entity add width the entity
        // alone did not have. If that takes the diagram past the page, the
        // entity's descriptions give that width back and it is laid out once more.
        var over = Math.ceil(res.width) - avail;
        if (!data.__er || !avail || over <= 2 || !data.nodes.some(function(n){ return n._open; })) return res;
        data.nodes.forEach(function(n){ n._room = Math.max(0, n._room - over); n._er = null; });
        return layout();
      }).then(function(res){
        var out = fig.querySelector('.diagram-out');
        out.textContent = '';
        out.appendChild(drawSvg(res, data));
        // the shape was chosen for this width: another width may want another
        if (data.__er){ fig._seqWidth = avail; refitOnResize(fig, out); }
        var note = fig.querySelector('.diagram-note');
        // An ER chart turns dense sooner: entities are big, so fewer of them
        // fill the frame and the relationships start crossing earlier.
        var openable = data.__er && data.nodes.some(function(n){ return n._details; });
        if ((data.edges || []).length >= (data.__er ? 4 : 6) || openable){
          if (!note){ note = el('div','diagram-note'); fig.appendChild(note); }
          note.textContent = data.__er
            ? 'Hover a relationship or an entity to isolate it · click to pin · Esc to release' +
              (openable ? ' · the button in an entity’s corner opens it to every column' : '')
            : 'Hover an arrow or a box to isolate it · click to pin · Esc to release';
        } else if (note) note.remove();
      });
    });
  }

  // The button is for comparing one diagram, not for changing the project's
  // mind: a switch lasts as long as the page is open and no longer. The
  // project-wide default is a config setting, where it can be reviewed.
  function engineFor(fig, code){
    if (!cleanKind(code)) return 'mermaid';
    return fig.dataset.engine || CFG.engine || 'clean';
  }

  function paintButton(fig, code, used){
    var btn = fig.querySelector('[data-act="engine"]');
    if (!btn) return;
    btn.textContent = (cleanKind(code) && canClean(cleanKind(code)))
      ? (used === 'clean' ? 'Mermaid layout' : 'Clean layout') : '';
  }

  /* ------------------------------------------------------------- folding
     Any diagram can be collapsed to an empty frame, out of the reader's way.
     The page remembers it per document and per place in it, in the reader's
     browser, so it stays collapsed on the next visit and through an edit to
     its source. A collapsed diagram is not drawn: it is drawn when it opens,
     at the width it then has. */

  function foldKey(fig){
    var main = document.getElementById('main');
    var figs = main ? [].slice.call(main.querySelectorAll('[data-diagram]')) : [];
    var i = figs.indexOf(fig);
    if (i < 0) return null;
    var docId = decodeURIComponent((location.hash.match(/^#\/([^\/]+)/) || [])[1] || '');
    return (CFG.ns || 'docucane') + ':fold:' + docId + ':' + i;
  }
  function folded(fig){
    var k = foldKey(fig);
    try { return !!(k && localStorage.getItem(k)); } catch (e) { return false; }
  }
  function setFold(fig, on){
    var k = foldKey(fig);
    try { if (k){ if (on) localStorage.setItem(k, '1'); else localStorage.removeItem(k); } } catch (e) {}
    paintFold(fig, on);
    if (!on) draw(fig);
  }
  function paintFold(fig, on){
    fig.classList.toggle('is-folded', on);
    var btn = fig.querySelector('[data-act="fold"]');
    if (btn){
      btn.textContent = on ? 'Show' : 'Collapse';
      btn.title = on ? 'Show the diagram' : 'Fold the diagram away';
    }
  }

  function draw(fig, force){
    var code = fig.querySelector('.diagram-src').textContent;
    if (!fig._foldSeen){ fig._foldSeen = true; paintFold(fig, folded(fig)); }
    if (fig.classList.contains('is-folded')) return Promise.resolve();
    var want = force || engineFor(fig, code);
    if (fig.dataset.drawn === want) return Promise.resolve();
    fig.dataset.drawn = want;
    var kind = cleanKind(code);
    var done;
    if (want === 'clean' && kind && canClean(kind)){
      done = renderClean(fig, code, kind).catch(function(){
        // Anything the clean renderer cannot do is mermaid's job, quietly.
        fig.dataset.drawn = 'mermaid';
        var note = fig.querySelector('.diagram-note');
        if (note) note.remove();
        return renderMermaid(fig, code);
      });
    } else {
      var note = fig.querySelector('.diagram-note');
      if (note) note.remove();
      done = renderMermaid(fig, code);
    }
    return done.then(function(){ paintButton(fig, code, fig.dataset.drawn); });
  }

  function drawAll(scope){
    [].slice.call((scope || document).querySelectorAll('[data-diagram]')).forEach(function(f){ draw(f); });
  }

  // First pass so nothing is blank, then one more once the webfont has landed
  // and the measurements are the ones the reader will actually see.
  var refit = false;
  if (document.fonts && document.fonts.ready){
    document.fonts.ready.then(function(){
      if (refit) return;
      refit = true;
      [].slice.call(document.querySelectorAll('[data-diagram]')).forEach(function(f){
        if (f.dataset.drawn === 'clean'){ f.dataset.drawn = ''; draw(f, 'clean'); }
      });
    });
  }

  /* ---------------------------------------------------------- interaction
     A dense chart asks one hard question - which arrow is this label on, and
     what touches this box. Hovering answers it by lighting one thing and
     dimming the rest; clicking pins the answer so it survives the mouse
     moving away, which is what you want while reading the prose beside it. */

  var pinned = null;

  function clear(svg){
    svg.classList.remove('has-hot');
    [].slice.call(svg.querySelectorAll('.is-hot,.is-near')).forEach(function(n){
      n.classList.remove('is-hot');
      n.classList.remove('is-near');
    });
    mirror(svg);
  }

  // the floating participant row of a sequence shows what its diagram shows
  function mirror(svg){
    var strip = svg._float;
    if (!strip) return;
    strip.classList.toggle('has-hot', svg.classList.contains('has-hot'));
    [].slice.call(strip.querySelectorAll('.dg-node')).forEach(function(n){
      var twin = svg.querySelector('.dg-node[data-node="' + sel(n.dataset.node) + '"]');
      n.classList.toggle('is-hot', !!twin && twin.classList.contains('is-hot'));
      n.classList.toggle('is-near', !!twin && twin.classList.contains('is-near'));
    });
  }

  function light(svg, kind, id){
    clear(svg);
    svg.classList.add('has-hot');
    if (kind === 'edge'){
      var ends = {};
      [].slice.call(svg.querySelectorAll('[data-edge="' + sel(id) + '"]')).forEach(function(n){
        n.classList.add('is-hot');
        ends[n.dataset.src] = 1; ends[n.dataset.dst] = 1;
      });
      Object.keys(ends).forEach(function(nid){
        var n = svg.querySelector('.dg-node[data-node="' + sel(nid) + '"]');
        if (n) n.classList.add('is-near');
      });
      return mirror(svg);
    }
    var me = svg.querySelector('.dg-node[data-node="' + sel(id) + '"]');
    if (me) me.classList.add('is-hot');
    var near = {};
    [].slice.call(svg.querySelectorAll('.dg-edge,.dg-label')).forEach(function(n){
      if (n.dataset.src !== id && n.dataset.dst !== id) return;
      n.classList.add('is-hot');
      near[n.dataset.src === id ? n.dataset.dst : n.dataset.src] = 1;
    });
    Object.keys(near).forEach(function(nid){
      var n = svg.querySelector('.dg-node[data-node="' + sel(nid) + '"]');
      if (n && n !== me) n.classList.add('is-near');
    });
    mirror(svg);
  }

  function targetOf(e){
    var t = e.target;
    if (!t || !t.closest) return null;
    var svg = t.closest('svg.dg');
    if (!svg) return null;
    if (svg._main) svg = svg._main;      // the floating row stands in for its diagram
    var edge = t.closest('.dg-edge,.dg-label');
    if (edge) return { svg: svg, kind: 'edge', id: edge.dataset.edge };
    var node = t.closest('.dg-node');
    if (node) return { svg: svg, kind: 'node', id: node.dataset.node };
    return { svg: svg, kind: null };
  }

  document.addEventListener('mousemove', function(e){
    var hit = targetOf(e);
    var said = hit && hit.kind === 'node' && tipTarget(e);
    if (said) showTip(said); else hideTip();
    if (!hit){
      if (!pinned) [].slice.call(document.querySelectorAll('svg.dg.has-hot')).forEach(clear);
      return;
    }
    if (pinned && pinned.svg === hit.svg) return;
    if (!hit.kind){ clear(hit.svg); return; }
    light(hit.svg, hit.kind, hit.id);
  }, { passive: true });

  document.addEventListener('click', function(e){
    if (e.target.closest && e.target.closest('.diagram-btn')) return;
    var more = e.target.closest && e.target.closest('.dg-er-more');
    if (more){ toggleEntity(more); return; }
    var hit = targetOf(e);
    if (!hit || !hit.kind){
      if (pinned){ clear(pinned.svg); pinned = null; }
      return;
    }
    if (pinned && pinned.svg === hit.svg && pinned.id === hit.id){
      pinned = null;
      clear(hit.svg);
      return;
    }
    pinned = hit;
    light(hit.svg, hit.kind, hit.id);
  });

  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && pinned){ clear(pinned.svg); pinned = null; }
  });

  /* ------------------------------------------------- opening an entity
     An entity opens where it stands. Its size changes, so the diagram is laid
     out again - and so nothing jumps under the reader: the entity keeps its
     place on the screen, every other entity glides from where it was to where
     it now is, and the relationships, whose routes have changed, fade in once
     they are drawn. In the full-size view the same happens to the copy there. */

  function toggleEntity(more){
    var node = more.closest('.dg-node'), svg = more.closest('svg.dg');
    if (!node || !svg) return;
    var inBox = !!svg.closest('.lightbox');
    var source = inBox ? svg._source : svg;
    var fig = source && source.closest('.diagram');
    if (!fig) return;

    var key = node.getAttribute('data-entity');
    var open = fig._open = fig._open || {};
    if (open[key]) delete open[key]; else open[key] = true;

    var was = {};
    [].slice.call(svg.querySelectorAll('.dg-node[data-entity]')).forEach(function(n){
      was[n.getAttribute('data-entity')] = n.getBoundingClientRect();
    });
    if (pinned){ clear(pinned.svg); pinned = null; }

    fig.dataset.drawn = '';
    draw(fig, 'clean').then(function(){
      var shown = fig.querySelector('.diagram-out > svg.dg');
      if (!shown) return;
      if (inBox && window.__lightbox && window.__lightbox.swap) shown = window.__lightbox.swap(shown) || shown;
      var anchor = shown.querySelector('.dg-node[data-entity="' + sel(key) + '"]');
      if (anchor && was[key]){
        var now = anchor.getBoundingClientRect();
        if (inBox) window.__lightbox.nudge(was[key].left - now.left, was[key].top - now.top);
        else window.scrollBy(0, now.top - was[key].top);
      }
      glide(shown, was, key);
    });
  }

  function glide(svg, was, key){
    var vb = svg.viewBox && svg.viewBox.baseVal, box = svg.getBoundingClientRect();
    if (!vb || !vb.width || !box.width) return;
    var k = box.width / vb.width, moving = [];
    [].slice.call(svg.querySelectorAll('.dg-node[data-entity]')).forEach(function(n){
      var id = n.getAttribute('data-entity');
      if (id === key){ n.classList.add('dg-er-opening'); return; }
      if (!was[id]) return;
      var now = n.getBoundingClientRect();
      // screen pixels back into the diagram's own units, which a transform on an svg element is in
      var dx = (was[id].left - now.left) / k, dy = (was[id].top - now.top) / k;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      n.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      moving.push(n);
    });
    svg.classList.add('dg-reflow');
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        moving.forEach(function(n){
          n.style.transition = 'transform .32s cubic-bezier(.2,.7,.2,1)';
          n.style.transform = '';
        });
      });
    });
    // and whatever happened to the frames in between, everything ends where the layout put it
    setTimeout(function(){
      svg.classList.remove('dg-reflow');
      moving.forEach(function(n){ n.style.transition = ''; n.style.transform = ''; });
      [].slice.call(svg.querySelectorAll('.dg-er-opening')).forEach(function(n){ n.classList.remove('dg-er-opening'); });
    }, 700);
  }

  /* ------------------------------------------- what an entity, a column is for
     What is written about an entity as a whole is not one of its columns, so
     it is not in its table: it appears while the pointer is on the entity's
     header, open or not. What a column holds has no room in the compact table,
     so it appears while the pointer is on that column's row; an opened entity
     writes it out, and says nothing more on hover. Either shows above what it
     is about when there is room, below it when not, and goes when the pointer
     leaves, the page scrolls or a click lands. */

  var tip = null, tipFor = null, tipTimer = 0;

  function escHtml(s){
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  // code spans and bold, the two such a description actually uses
  function inlineMd(s){
    return escHtml(s).replace(/\x60([^\x60]+)\x60/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }

  // The element whose description the pointer is on, if any: a column's row,
  // or the entity when the pointer is on its header - the band with the title,
  // or the whole box of an entity with no columns.
  function tipTarget(e){
    var row = e.target.closest('.dg-er-row[data-desc]');
    if (row) return row;
    var node = e.target.closest('.dg-node[data-desc]');
    if (!node || e.target.closest('.dg-er-row')) return null;
    var rule = node.querySelector('.dg-er-rule');
    return !rule || e.clientY <= rule.getBoundingClientRect().bottom + 1 ? node : null;
  }

  function showTip(target){
    if (tipFor === target) return;
    hideTip();
    tipFor = target;
    tipTimer = setTimeout(function(){
      if (tipFor !== target || !target.isConnected) return;
      var lines;
      try { lines = JSON.parse(target.getAttribute('data-desc')); } catch (err) { return; }
      tip = el('div', 'dg-tip');
      tip.innerHTML = lines.map(function(l){ return '<p>' + inlineMd(l) + '</p>'; }).join('');
      document.body.appendChild(tip);
      var isRow = target.classList.contains('dg-er-row');
      var box = (target.querySelector(isRow ? '.dg-er-band' : '.dg-node-shape') || target).getBoundingClientRect();
      var head = !isRow && target.querySelector('.dg-er-rule');
      var below = isRow ? box.bottom : head ? head.getBoundingClientRect().bottom : box.top + 34;
      var vw = document.documentElement.clientWidth, w = tip.offsetWidth, h = tip.offsetHeight;
      var top = box.top - h - 8;
      if (top < 8) top = below + 8;
      tip.style.left = Math.round(Math.min(Math.max(8, box.left), vw - w - 8)) + 'px';
      tip.style.top = Math.round(top) + 'px';
    }, 160);
  }

  function hideTip(){
    clearTimeout(tipTimer);
    tipFor = null;
    if (tip){ tip.remove(); tip = null; }
  }
  addEventListener('scroll', hideTip, { passive: true });
  document.addEventListener('wheel', hideTip, { passive: true });
  document.addEventListener('mousedown', hideTip, true);

  /* ----------------------------------------------------------- the toolbar */

  document.addEventListener('click', function(e){
    var btn = e.target.closest && e.target.closest('.diagram-btn');
    var shut = e.target.closest && e.target.closest('.diagram.is-folded');
    // anywhere on a collapsed diagram opens it
    if (shut && (!btn || btn.dataset.act === 'fold')){ e.stopPropagation(); setFold(shut, false); return; }
    if (!btn) return;
    var fig = btn.closest('.diagram');
    if (!fig) return;
    e.stopPropagation();
    if (btn.dataset.act === 'fold'){
      if (pinned){ clear(pinned.svg); pinned = null; }
      hideTip();
      setFold(fig, true);
      return;
    }
    if (btn.dataset.act === 'engine'){
      var next = fig.dataset.drawn === 'clean' ? 'mermaid' : 'clean';
      fig.dataset.engine = next;
      draw(fig, next);
      return;
    }
    if (btn.dataset.act === 'zoom'){
      var svg = fig.querySelector('svg');
      if (svg && window.__lightbox) window.__lightbox(svg);
    }
  }, true);

  window.__diagrams = { drawAll: drawAll, draw: draw };
})();
`;
