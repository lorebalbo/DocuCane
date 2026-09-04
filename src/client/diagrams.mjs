// diagrams.mjs - the client-side diagram engine, inlined into the page.
//
// Two renderers live here.
//
//   mermaid  - mermaid's own, used for every diagram type that is not a
//              flowchart (sequence, ER, state, pie, gantt, ...) and as the
//              fallback whenever the other one cannot do the job.
//
//   clean    - flowcharts only. Mermaid parses the source, ELK lays it out,
//              and this file draws the result.
//
// Why not just use mermaid for flowcharts too: mermaid lays flowcharts out
// with dagre and routes edges as curves, which on a dense chart produces
// crossing arcs and edge labels dropped wherever they happen to land - often
// on top of each other, or nearer a stranger's arc than their own. The reader
// then cannot tell which text belongs to which arrow, which is the one thing
// that makes a dense flowchart unreadable.
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
// None of this is required. With no ELK on the page every flowchart renders
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
  function fontString(px){
    return px + 'px ' + (getComputedStyle(document.body).fontFamily || 'sans-serif');
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
  function measure(label, px, maxw){
    cv.font = fontString(px);
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

  function nodeSize(n){
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

    var edges = data.edges.map(function(e){
      var ed = { id: e.id, sources: [e.start], targets: [e.end], _e: e };
      if (e.label != null && String(e.label).trim() !== ''){
        var m = measure(e.label, EDGE_FS, CFG.edgeTextWidth || 200);
        e._m = m;
        ed.labels = [{ id: e.id + '::label', text: 'x', width: m.w + 12, height: m.h + 4 }];
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
        'elk.spacing.nodeNode': '40',
        'elk.layered.spacing.nodeNodeBetweenLayers': '54',
        'elk.spacing.edgeNode': '22',
        'elk.layered.spacing.edgeNodeBetweenLayers': '24',
        'elk.spacing.edgeEdge': '16',
        'elk.layered.spacing.edgeEdgeBetweenLayers': '14',
        'elk.spacing.edgeLabel': '7',
        'elk.spacing.labelNode': '10',
        'elk.edgeLabels.placement': 'CENTER',
        'elk.padding': '[top=14,left=14,bottom=14,right=14]'
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

  function drawSvg(res, data){
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
      var g = mk('g', { 'data-node': id }, 'dg-el dg-node');
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
        if (info.pattern === 'dotted' || info.stroke === 'dotted') line.style.strokeDasharray = '4 3';
        if (info.thickness === 'thick' || info.stroke === 'thick') line.style.strokeWidth = '2.4';
        if (st.stroke) line.style.stroke = st.stroke;
        g.appendChild(line);

        if (i === runs.length - 1){
          var head = info.arrowTypeEnd === 'none' || info.type === 'arrow_open'
            ? null : (ARROW[info.arrowTypeEnd] || 'tri');
          if (head){
            var a = arrowHead(pts[pts.length-1], pts[pts.length-2], head);
            if (st.stroke){ a.style.fill = head === 'tri' ? st.stroke : ''; a.style.stroke = st.stroke; }
            g.appendChild(a);
          }
        }
        if (i === 0 && info.arrowTypeStart && info.arrowTypeStart !== 'none'){
          g.appendChild(arrowHead(pts[0], pts[1], ARROW[info.arrowTypeStart] || 'tri'));
        }
      });
      gEdge.appendChild(g);

      // the label, and the hairline that ties it to this arc and no other
      (e.labels || []).forEach(function(lb){
        var m = info._m;
        if (!m) return;
        var pts = runs[Math.floor(runs.length/2)] || runs[0];
        var lg = mk('g', { 'data-edge': e.id, 'data-src': src, 'data-dst': dst }, 'dg-el dg-label');
        var lx = lb.x + o.x, ly = lb.y + o.y;
        var cx = lx + lb.width/2, cy = ly + lb.height/2;
        var anchor = pts.length > 1 ? nearestOnPath(pts, cx, cy) : null;
        if (anchor){
          var dx = anchor.x - cx, dy = anchor.y - cy;
          var hw = lb.width/2 + 3, hh = lb.height/2 + 3, ax = cx, ay = cy;
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
        lg.appendChild(mk('rect', { x:lx, y:ly, width:lb.width, height:lb.height, rx:5 }, 'dg-label-plate'));
        lg.appendChild(textBlock(m, cx, cy, 'dg-edge-text'));
        gLabel.appendChild(lg);
      });
    });

    return svg;
  }

  /* --------------------------------------------------------------- render */

  function isFlowchart(code){
    var head = String(code).replace(/^\s*(%%\{[\s\S]*?\}%%\s*)*/, '').trim().split(/[\s\n]/)[0] || '';
    return /^(flowchart|graph)$/i.test(head);
  }

  function canClean(){
    return typeof ELK !== 'undefined' && typeof mermaid !== 'undefined' &&
           mermaid.mermaidAPI && typeof mermaid.mermaidAPI.getDiagramFromText === 'function';
  }

  function renderClean(fig, code){
    if (!initMermaid()) return Promise.reject(new Error('mermaid unavailable'));
    if (!elk) elk = new ELK();
    return Promise.resolve(mermaid.mermaidAPI.getDiagramFromText(code)).then(function(d){
      var db = d && d.db;
      if (!db || typeof db.getData !== 'function') throw new Error('no graph model');
      var data = db.getData();
      if (!data || !data.nodes || !data.nodes.length) throw new Error('nothing to draw');
      var raw = (db.getDirection && db.getDirection()) || 'TB';
      return elk.layout(buildGraph(data, DIRS[String(raw).toUpperCase()] || 'DOWN')).then(function(res){
        var out = fig.querySelector('.diagram-out');
        out.textContent = '';
        out.appendChild(drawSvg(res, data));
        var note = fig.querySelector('.diagram-note');
        if ((data.edges || []).length >= 6){
          if (!note){ note = el('div','diagram-note'); fig.appendChild(note); }
          note.textContent = 'Hover an arrow or a box to isolate it · click to pin · Esc to release';
        } else if (note) note.remove();
      });
    });
  }

  // The button is for comparing one diagram, not for changing the project's
  // mind: a switch lasts as long as the page is open and no longer. The
  // project-wide default is a config setting, where it can be reviewed.
  function engineFor(fig, code){
    if (!isFlowchart(code)) return 'mermaid';
    return fig.dataset.engine || CFG.engine || 'clean';
  }

  function paintButton(fig, code, used){
    var btn = fig.querySelector('[data-act="engine"]');
    if (!btn) return;
    btn.textContent = (isFlowchart(code) && canClean())
      ? (used === 'clean' ? 'Mermaid layout' : 'Clean layout') : '';
  }

  function draw(fig, force){
    var code = fig.querySelector('.diagram-src').textContent;
    var want = force || engineFor(fig, code);
    if (fig.dataset.drawn === want) return Promise.resolve();
    fig.dataset.drawn = want;
    var done;
    if (want === 'clean' && canClean()){
      done = renderClean(fig, code).catch(function(){
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
