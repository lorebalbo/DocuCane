// diagrams.mjs - the client-side diagram engine, inlined into the page.
//
// Two renderers live here.
//
//   mermaid  - mermaid's own, used for every diagram type the other one does
//              not cover (sequence, state, class, gantt, pie, ...) and as the
//              fallback whenever the other one cannot do the job.
//
//   clean    - flowcharts and ER diagrams. Mermaid parses the source, ELK lays
//              it out, and this file draws the result.
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
  function decode(s){
    var t = document.createElement('textarea');
    t.innerHTML = String(s == null ? '' : s);
    return t.value;
  }
  function splitLabel(label){
    var out = decode(label).split(/<br\s*\/?>|\n/).map(function(s){
      return s.replace(/<[^>]*>/g,'').trim();
    });
    return out.length ? out : [''];
  }
  function measure(label, px, maxw, weight){
    cv.font = fontString(px, weight);
    var raw = splitLabel(label), out = [];
    for (var i=0;i<raw.length;i++){
      var line = raw[i];
      if (!maxw || cv.measureText(line).width <= maxw){ out.push(line); continue; }
      var cur = '', words = line.split(' ');
      for (var j=0;j<words.length;j++){
        var t = cur ? cur + ' ' + words[j] : words[j];
        if (cv.measureText(t).width > maxw && cur){ out.push(cur); cur = words[j]; }
        else cur = t;
      }
      if (cur) out.push(cur);
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

  // Measured once and cached on the node, so the box drawn is the box the
  // layout was given room for - the two must not be allowed to disagree.
  function erModel(n){
    if (n._er) return n._er;
    var title = measure(n.alias || n.label, ER_TITLE_FS, 340, 600);
    var rows = (n.attributes || []).map(function(a){
      return {
        type: decode(a.type == null ? '' : a.type).trim(),
        name: decode(a.name == null ? '' : a.name).trim(),
        comment: decode(a.comment == null ? '' : a.comment).trim(),
        keys: (a.keys || []).filter(Boolean).map(function(k){ return String(k).toUpperCase(); })
      };
    });

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
      w: Math.round(Math.max(contentW, title.w + ER_PAD * 2 + 14, 104)),
      h: Math.round(headH + (rows.length ? rows.length * ER_ROW_H + 5 : 0))
    };
    return n._er;
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

  function buildGraph(data, dir){
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

    return {
      id: 'root',
      children: (kids.__root || []).map(build),
      edges: edges,
      layoutOptions: {
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
      }
    };
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

    m.rows.forEach(function(row, i){
      var top = y + m.headH + i * ER_ROW_H, cy = top + ER_ROW_H/2;
      var rg = mk('g', null, 'dg-er-row');
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

  /* --------------------------------------------------------------- render */

  // Both of the types the clean renderer draws. Everything else - sequence,
  // state, class, gantt, pie - goes to mermaid, which draws them well.
  var CLEAN_KINDS = { flowchart:'flowchart', graph:'flowchart', erdiagram:'er' };

  function cleanKind(code){
    var head = String(code).replace(/^\s*(%%\{[\s\S]*?\}%%\s*)*/, '').trim().split(/[\s\n]/)[0] || '';
    return CLEAN_KINDS[head.toLowerCase()] || null;
  }

  function canClean(){
    return typeof ELK !== 'undefined' && typeof mermaid !== 'undefined' &&
           mermaid.mermaidAPI && typeof mermaid.mermaidAPI.getDiagramFromText === 'function';
  }

  function renderClean(fig, code, kind){
    if (!initMermaid()) return Promise.reject(new Error('mermaid unavailable'));
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
      var raw = (db.getDirection && db.getDirection()) || 'TB';
      return elk.layout(buildGraph(data, DIRS[String(raw).toUpperCase()] || 'DOWN')).then(function(res){
        var out = fig.querySelector('.diagram-out');
        out.textContent = '';
        out.appendChild(drawSvg(res, data));
        var note = fig.querySelector('.diagram-note');
        // An ER chart turns dense sooner: entities are big, so fewer of them
        // fill the frame and the relationships start crossing earlier.
        if ((data.edges || []).length >= (data.__er ? 4 : 6)){
          if (!note){ note = el('div','diagram-note'); fig.appendChild(note); }
          note.textContent = data.__er
            ? 'Hover a relationship or an entity to isolate it · click to pin · Esc to release'
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
    btn.textContent = (cleanKind(code) && canClean())
      ? (used === 'clean' ? 'Mermaid layout' : 'Clean layout') : '';
  }

  function draw(fig, force){
    var code = fig.querySelector('.diagram-src').textContent;
    var want = force || engineFor(fig, code);
    if (fig.dataset.drawn === want) return Promise.resolve();
    fig.dataset.drawn = want;
    var kind = cleanKind(code);
    var done;
    if (want === 'clean' && kind && canClean()){
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
      return;
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
  }

  function targetOf(e){
    var t = e.target;
    if (!t || !t.closest) return null;
    var svg = t.closest('svg.dg');
    if (!svg) return null;
    var edge = t.closest('.dg-edge,.dg-label');
    if (edge) return { svg: svg, kind: 'edge', id: edge.dataset.edge };
    var node = t.closest('.dg-node');
    if (node) return { svg: svg, kind: 'node', id: node.dataset.node };
    return { svg: svg, kind: null };
  }

  document.addEventListener('mousemove', function(e){
    var hit = targetOf(e);
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

  /* ----------------------------------------------------------- the toolbar */

  document.addEventListener('click', function(e){
    var btn = e.target.closest && e.target.closest('.diagram-btn');
    if (!btn) return;
    var fig = btn.closest('.diagram');
    if (!fig) return;
    e.stopPropagation();
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
