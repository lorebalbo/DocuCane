// app.mjs - the page's own behaviour, inlined into the built file.
// Sidebar and routing, folding sections, search, the diagram lightbox, and
// the margin comments. Diagram rendering itself lives in diagrams.mjs.

export const APP_JS = String.raw`
(function(){
  var CFG = window.__DOCUCANE__ || {};
  var NS = CFG.ns || 'docucane';
  var DATA = JSON.parse(document.getElementById('doc-data').textContent);
  var docs = DATA.docs, byId = {};
  docs.forEach(function(d){ byId[d.id] = d; });

  var layout = document.getElementById('layout');
  var nav = document.getElementById('nav');
  var main = document.getElementById('main');
  var bar = document.getElementById('topbar');
  var barTitle = document.getElementById('topbar-title');
  var search = document.getElementById('search');
  var cache = {};
  var current = null;
  var heads = [];

  // a file:// origin can refuse storage; the dashboard must still work
  function keep(k, v){ try { localStorage.setItem(NS + ':' + k, v); } catch (e) {} }
  function recall(k){ try { return localStorage.getItem(NS + ':' + k); } catch (e) { return null; } }

  /* ---------------- sidebar ---------------- */

  function el(tag, cls, text){
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  var CARET = '<svg class="caret" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 4l4 4-4 4"/></svg>';

  function buildNav(){
    var group = null;
    docs.forEach(function(d){
      if (d.group !== group){
        group = d.group;
        nav.appendChild(el('div', 'nav-group', group));
      }
      var item = el('div', 'item');
      item.dataset.doc = d.id;
      item.title = d.file;
      item.appendChild(el('span', 'num', d.badge));
      item.appendChild(el('span', 'item-title', d.title));
      if (d.sections.length) item.insertAdjacentHTML('beforeend', CARET);
      item.addEventListener('click', function(e){
        if (e.target.closest('.caret') && current === d.id){ item.classList.toggle('open'); return; }
        go(d.id);
      });
      nav.appendChild(item);

      var subs = el('div', 'subs');
      subs.dataset.subs = d.id;
      d.sections.forEach(function(s){
        var a = el('a', 'sub');
        a.href = '#/' + d.id + '/' + s.id;
        a.title = (s.num ? s.num + '  ' : '') + s.text;
        if (s.num) a.appendChild(el('span', 'sub-n', s.num));
        a.appendChild(el('span', 'sub-t', s.text));
        subs.appendChild(a);
      });
      nav.appendChild(subs);
    });
  }

  /* ---------------- routing ---------------- */

  function parseHash(){
    var m = location.hash.match(/^#\/([^/]+)(?:\/(.+))?$/);
    return m ? { id: decodeURIComponent(m[1]), anchor: m[2] && decodeURIComponent(m[2]) } : null;
  }

  function go(id, anchor){
    location.hash = '#/' + id + (anchor ? '/' + anchor : '');
  }

  function route(){
    var r = parseHash();
    var id = r && byId[r.id] ? r.id : (recall('last') || docs[0].id);
    if (!byId[id]) id = docs[0].id;
    show(id, r && r.anchor);
  }

  function show(id, anchor){
    var d = byId[id];
    if (current !== id){
      current = id;
      keep('last', id);

      main.textContent = '';
      main.appendChild(bodyFor(d));

      nav.querySelectorAll('.item').forEach(function(n){
        var on = n.dataset.doc === id;
        n.classList.toggle('active', on);
        n.classList.toggle('open', on);
      });
      heads = [].slice.call(main.querySelectorAll('h1[id],h2[id]'));
      barTitle.textContent = d.title;
      document.title = d.title + ' — ' + CFG.title;
      restoreFolds(main);
      if (window.__diagrams) window.__diagrams.drawAll(main);
      renderComments();
      watch();
    }
    if (anchor && reveal(anchor, false)) return;
    if (!anchor) window.scrollTo(0, 0);
    requestAnimationFrame(sync);
  }

  // step to the neighbouring document, in sidebar order
  function navBtn(d, dir){
    var a = el('a', 'docnav-btn ' + dir);
    a.href = '#/' + d.id;
    a.title = d.file;
    a.appendChild(el('span', 'docnav-label', dir === 'prev' ? '← Previous' : 'Next →'));
    a.appendChild(el('span', 'docnav-title', d.title));
    return a;
  }

  function bodyFor(d){
    if (cache[d.id]) return cache[d.id];
    var wrap = document.createDocumentFragment();

    var head = el('header', 'head');
    head.appendChild(el('h1', null, d.title));
    if (d.subtitle){
      var p = el('p');
      p.innerHTML = d.subtitle;
      head.appendChild(p);
    }
    var meta = el('div', 'meta');
    meta.appendChild(el('span', null, d.file));
    meta.appendChild(el('span', null, d.words.toLocaleString() + ' words'));
    if (d.diagrams) meta.appendChild(el('span', null, d.diagrams + (d.diagrams > 1 ? ' diagrams' : ' diagram')));
    head.appendChild(meta);
    wrap.appendChild(head);

    var body = el('article', 'doc');
    body.innerHTML = d.html;
    wrap.appendChild(body);

    var i = docs.indexOf(d);
    var prev = i > 0 ? docs[i - 1] : null;
    var next = i >= 0 && i < docs.length - 1 ? docs[i + 1] : null;
    if (prev || next){
      var footer = el('nav', 'docnav');
      if (prev) footer.appendChild(navBtn(prev, 'prev'));
      if (next) footer.appendChild(navBtn(next, 'next'));
      wrap.appendChild(footer);
    }

    var holder = el('div', 'body-wrap');
    holder.appendChild(wrap);
    holder.appendChild(el('div', 'cmt-layer'));
    cache[d.id] = holder;
    return holder;
  }

  /* ---------------- folding sections ---------------- */
  // Which sections are folded is remembered per document, so a long reference
  // page stays folded down to the parts you actually read.

  var shut = {};
  try { shut = JSON.parse(recall('folded') || '{}') || {}; } catch (e) { shut = {}; }

  function secKey(sec){ return current + '#' + sec.dataset.sec; }

  function fold(sec, on, persist){
    sec.classList.toggle('shut', on);
    var tog = sec.querySelector(':scope > .sec-head > .sec-tog');
    if (tog) tog.setAttribute('aria-label', on ? 'Unfold section' : 'Fold section');
    if (persist){
      if (on) shut[secKey(sec)] = 1; else delete shut[secKey(sec)];
      keep('folded', JSON.stringify(shut));
    }
    schedulePlace();
  }

  function restoreFolds(scope){
    [].slice.call(scope.querySelectorAll('.sec')).forEach(function(sec){
      if (shut[current + '#' + sec.dataset.sec]) fold(sec, true, false);
    });
  }

  // a target inside folded sections is useless - open every ancestor first
  function unfoldTo(node){
    for (var p = node; p && p !== main; p = p.parentNode){
      if (p.classList && p.classList.contains('shut')) fold(p, false, true);
    }
  }

  function reveal(id, smooth){
    var t = document.getElementById(id);
    if (!t) return false;
    unfoldTo(t);
    t.scrollIntoView(smooth ? { behavior: 'smooth' } : undefined);
    return true;
  }

  /* ---------------- lightbox ---------------- */

  var box = document.getElementById('lightbox');
  var stage = document.getElementById('lightbox-stage');
  var zoomLabel = document.getElementById('zoom-label');
  var scale = 1, tx = 0, ty = 0, dragging = false, sx = 0, sy = 0, moved = false;

  function apply(){
    stage.style.transform = 'translate(-50%,-50%) translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
    zoomLabel.textContent = Math.round(scale * 100) + '%';
  }
  function zoom(mult){ scale = Math.min(8, Math.max(.2, scale * mult)); apply(); }

  // The diagram shown full size is a copy; it remembers the one on the page, so
  // a change made from the copy (an entity opened) can be made to the original.
  function stageCopy(svg){
    stage.innerHTML = '';
    var clone = svg.cloneNode(true);
    clone.removeAttribute('style');
    clone._source = svg;

    // size from the viewBox: the rendered rect depends on the column it came from
    var vb = (clone.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    var w = vb[2] || svg.getBoundingClientRect().width || 1;
    var h = vb[3] || svg.getBoundingClientRect().height || 1;
    clone.setAttribute('width', w);
    clone.setAttribute('height', h);
    stage.appendChild(clone);
    return { svg: clone, w: w, h: h };
  }

  function openBox(svg){
    var copy = stageCopy(svg);
    box.classList.add('on');

    // fit the whole diagram, but never so small it stops being readable:
    // tall flowcharts open at a legible scale and are panned instead
    var fitW = (innerWidth - 120) / copy.w, fitH = (innerHeight - 140) / copy.h;
    scale = Math.min(2, Math.max(Math.min(fitW, fitH), Math.min(.75, fitW)));
    tx = 0; ty = 0; apply();
  }
  function closeBox(){ box.classList.remove('on'); stage.innerHTML = ''; }
  window.__lightbox = openBox;
  // a redrawn diagram replaces the one on view, at the same zoom and pan...
  openBox.swap = function(svg){
    if (!box.classList.contains('on')) return null;
    var copy = stageCopy(svg);
    apply();
    return copy.svg;
  };
  // ...which the caller then nudges, to keep what the reader was looking at in place
  openBox.nudge = function(dx, dy){ tx += dx; ty += dy; apply(); };

  // Dragging pans, but a plain click inside the diagram is the reader talking
  // to the diagram (pinning an arrow), so only start a drag on empty space.
  box.addEventListener('pointerdown', function(e){
    if (e.target.closest('.lightbox-bar')) return;
    if (e.target.closest('.dg-node,.dg-edge,.dg-label')) return;
    dragging = true; moved = false; sx = e.clientX - tx; sy = e.clientY - ty;
    box.classList.add('drag'); box.setPointerCapture(e.pointerId);
  });
  box.addEventListener('pointermove', function(e){
    if (!dragging) return;
    moved = true;
    tx = e.clientX - sx; ty = e.clientY - sy; apply();
  });
  box.addEventListener('pointerup', function(){ dragging = false; box.classList.remove('drag'); });
  box.addEventListener('wheel', function(e){ e.preventDefault(); zoom(e.deltaY < 0 ? 1.042 : 1 / 1.042); }, { passive: false });
  document.getElementById('zoom-in').addEventListener('click', function(){ zoom(1.25); });
  document.getElementById('zoom-out').addEventListener('click', function(){ zoom(1 / 1.25); });
  document.getElementById('zoom-close').addEventListener('click', closeBox);

  /* ---------------- events ---------------- */

  document.addEventListener('click', function(e){
    // A click on the diagram's own furniture opens it full size. A click on a
    // node or an arrow belongs to the diagram - it pins that part - so it is
    // left alone here.
    var fig = e.target.closest('.diagram');
    if (fig && !e.target.closest('svg.dg') && !e.target.closest('.diagram-head')){
      var svg = fig.querySelector('svg');
      if (svg) openBox(svg);
      return;
    }
    var a = e.target.closest('a[href^="#"]');
    if (a){
      var href = a.getAttribute('href');
      if (href.indexOf('#/') === 0) return;
      e.preventDefault();
      if (reveal(href.slice(1), true)) history.replaceState(null, '', '#/' + current + '/' + href.slice(1));
      return;
    }
    // anywhere on a heading folds its section - unless the click was really the
    // end of a drag that selected some of it
    var head = e.target.closest('.sec-head');
    if (!head || !head.parentNode.classList.contains('sec')) return;
    var s = window.getSelection();
    if (s && !s.isCollapsed && String(s).trim()) return;
    var sec = head.parentNode;
    fold(sec, !sec.classList.contains('shut'), true);
  });

  document.getElementById('toggle').addEventListener('click', function(){
    var on = layout.classList.toggle('collapsed');
    keep('collapsed', on ? '1' : '');
    schedulePlace();
  });

  if (search) search.addEventListener('input', function(){
    var q = search.value.trim().toLowerCase();
    nav.querySelectorAll('.item').forEach(function(item){
      var d = byId[item.dataset.doc];
      var subs = nav.querySelector('[data-subs="' + d.id + '"]');
      if (!q){
        item.style.display = '';
        item.classList.toggle('open', d.id === current);
        subs.querySelectorAll('.sub').forEach(function(s){ s.style.display = ''; });
        return;
      }
      var hitDoc = (d.title + ' ' + d.file).toLowerCase().indexOf(q) >= 0;
      var hitSub = 0;
      subs.querySelectorAll('.sub').forEach(function(s){
        var on = s.textContent.toLowerCase().indexOf(q) >= 0;
        s.style.display = (hitDoc || on) ? '' : 'none';
        if (on) hitSub++;
      });
      item.style.display = (hitDoc || hitSub) ? '' : 'none';
      item.classList.toggle('open', !!hitSub);
    });
    nav.querySelectorAll('.nav-group').forEach(function(g){ g.style.display = q ? 'none' : ''; });
  });

  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape'){
      if (box.classList.contains('on')) return closeBox();
      if (search && document.activeElement === search){
        search.value = ''; search.dispatchEvent(new Event('input')); search.blur();
      }
      return;
    }
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === '/' && search){ e.preventDefault(); search.focus(); }
    if (e.key === '[') document.getElementById('toggle').click();
  });

  function sync(){
    var head = main.querySelector('.head');
    bar.classList.toggle('show', head ? head.getBoundingClientRect().bottom < 8 : false);
    var y = scrollY + 120, at = null;
    for (var i = 0; i < heads.length; i++){
      if (!heads[i].offsetParent) continue;          // inside a folded section
      if (heads[i].offsetTop <= y) at = heads[i].id; else break;
    }
    var subs = nav.querySelector('[data-subs="' + current + '"]');
    if (subs) subs.querySelectorAll('.sub').forEach(function(s){
      s.classList.toggle('current', !!at && s.getAttribute('href') === '#/' + current + '/' + at);
    });
  }

  var ticking = false;
  addEventListener('scroll', function(){
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function(){ ticking = false; sync(); });
  }, { passive: true });

  addEventListener('hashchange', route);

  /* ---------------- comments ---------------- */
  // Selected text is stored as a quote plus a little context either side, so a
  // comment can find its home again after the document is edited and re-rendered.

  var CMT_ON = CFG.comments !== false;
  var CARD_MAX = 264, CARD_MIN = 176, CARD_GAP = 10, EDGE = 12;
  var comments = readComments();
  var cmtOn = CMT_ON && recall('cmt-off') !== '1';
  var pending = null, warned = false, ro = null, placeTick = false;
  var addBtn = document.getElementById('cmt-add');
  var pop = document.getElementById('cmt-pop');
  var toastEl = document.getElementById('cmt-toast'), toastT = 0;

  function readComments(){
    try {
      var raw = recall('comments');
      if (!raw) return [];
      var o = JSON.parse(raw);
      var list = Array.isArray(o) ? o : (o && o.comments) || [];
      return list.filter(function(c){ return c && c.id && c.doc && c.quote && c.body; });
    } catch (e) { return []; }
  }

  function writeComments(){
    keep('comments', JSON.stringify({ version: 1, comments: comments }));
    if (!warned && comments.length && recall('comments') === null){
      warned = true;
      toast('This browser refuses to store anything — comments made here will be gone when the page closes.');
    }
    paintCount();
  }

  function paintCount(){
    var n = document.getElementById('cmt-n');
    if (n) n.textContent = comments.length;
  }

  function toast(msg){
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(function(){ toastEl.hidden = true; }, 4200);
  }

  function uid(){ return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function forDoc(id){ return comments.filter(function(c){ return c.doc === id; }); }
  function layerEl(){ return main.querySelector('.cmt-layer'); }

  function when(ts){
    if (!ts) return '';
    var d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' +
           d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  /* --- text addressing --- */

  function flatten(root){
    var walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function(n){
        if (!n.nodeValue) return NodeFilter.FILTER_REJECT;
        for (var p = n.parentNode; p && p !== root; p = p.parentNode){
          var tag = (p.nodeName || '').toUpperCase();
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'SVG') return NodeFilter.FILTER_REJECT;
          if (p.classList && p.classList.contains('diagram-src')) return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [], starts = [], text = '', n;
    while ((n = walk.nextNode())){ nodes.push(n); starts.push(text.length); text += n.nodeValue; }
    return { nodes: nodes, starts: starts, text: text };
  }

  function posOf(flat, node, off){
    if (node.nodeType !== 3){
      var kid = node.childNodes[off] || node.lastChild;
      while (kid && kid.nodeType !== 3) kid = kid.firstChild || kid.nextSibling;
      if (!kid) return -1;
      node = kid; off = 0;
    }
    var i = flat.nodes.indexOf(node);
    return i < 0 ? -1 : flat.starts[i] + off;
  }

  function sectionAt(node){
    var body = main.querySelector('.doc');
    var here = node.nodeType === 3 ? node.parentNode : node;
    var hs = [].slice.call(body.querySelectorAll('h1[id],h2[id],h3[id]'));
    var found = '';
    for (var i = 0; i < hs.length; i++){
      if (hs[i].compareDocumentPosition(here) & Node.DOCUMENT_POSITION_FOLLOWING) found = hs[i].id;
    }
    return found;
  }

  function capture(){
    var s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) return null;
    var body = main.querySelector('.doc');
    if (!body) return null;
    var r = s.getRangeAt(0);
    if (!body.contains(r.startContainer) || !body.contains(r.endContainer)) return null;
    var host = r.startContainer.nodeType === 3 ? r.startContainer.parentNode : r.startContainer;
    if (host.closest && host.closest('.diagram')) return null;
    var flat = flatten(body);
    var a = posOf(flat, r.startContainer, r.startOffset);
    var b = posOf(flat, r.endContainer, r.endOffset);
    if (a < 0 || b < 0 || b <= a) return null;
    var quote = flat.text.slice(a, b).trim();
    if (quote.length < 2 || quote.length > 600) return null;
    a = flat.text.indexOf(quote, Math.max(0, a - 8));
    if (a < 0) return null;
    b = a + quote.length;
    return {
      doc: current, quote: quote,
      prefix: flat.text.slice(Math.max(0, a - 48), a),
      suffix: flat.text.slice(b, b + 48),
      section: sectionAt(r.startContainer),
      rect: r.getBoundingClientRect()
    };
  }

  // quote plus context first, then progressively looser fallbacks
  function locate(flat, c){
    var t = flat.text, at;
    if (c.prefix){
      at = t.indexOf(c.prefix + c.quote + (c.suffix || ''));
      if (at < 0) at = t.indexOf(c.prefix + c.quote);
      if (at >= 0) return [at + c.prefix.length, at + c.prefix.length + c.quote.length];
    }
    if (c.suffix){
      at = t.indexOf(c.quote + c.suffix);
      if (at >= 0) return [at, at + c.quote.length];
    }
    at = t.indexOf(c.quote);
    return at >= 0 ? [at, at + c.quote.length] : null;
  }

  function paintRange(flat, from, to, id){
    var made = [];
    for (var i = flat.nodes.length - 1; i >= 0; i--){
      var node = flat.nodes[i], s = flat.starts[i], e = s + node.nodeValue.length;
      if (e <= from || s >= to) continue;
      var a = Math.max(from, s) - s, b = Math.min(to, e) - s;
      if (b < node.nodeValue.length) node.splitText(b);
      if (a > 0) node = node.splitText(a);
      var m = document.createElement('mark');
      m.className = 'cmt-hl';
      m.dataset.cmt = id;
      node.parentNode.insertBefore(m, node);
      m.appendChild(node);
      made.unshift(m);
    }
    return made;
  }

  /* --- rendering --- */

  function renderComments(){
    if (!CMT_ON) return;
    var body = main.querySelector('.doc'), layer = layerEl();
    if (!body || !layer) return;

    [].slice.call(body.querySelectorAll('mark.cmt-hl')).forEach(function(m){
      var p = m.parentNode;
      while (m.firstChild) p.insertBefore(m.firstChild, m);
      p.removeChild(m);
    });
    body.normalize();
    layer.textContent = '';
    layer.hidden = !cmtOn;
    if (!cmtOn) return;

    var list = forDoc(current);
    if (!list.length) return;

    var flat = flatten(body);
    var found = [], lost = [];
    list.forEach(function(c){
      var at = locate(flat, c);
      if (at) found.push({ c: c, from: at[0] }); else lost.push(c);
    });
    found.sort(function(x, y){ return y.from - x.from; });
    found.forEach(function(f){
      var at = locate(flat, f.c);
      f.marks = at ? paintRange(flat, at[0], at[1], f.c.id) : [];
    });
    found.sort(function(x, y){ return x.from - y.from; });

    var n = 0;
    lost.forEach(function(c){ layer.appendChild(cardFor(c, null, ++n)); });
    found.forEach(function(f){ layer.appendChild(cardFor(f.c, f.marks[0], ++n)); });
    place();
  }

  function cardFor(c, mark, n){
    var card = el('div', 'cmt-card');
    card.dataset.cmt = c.id;
    card._mark = mark || null;
    card.appendChild(el('span', 'cmt-face', String(n)));

    var full = el('div', 'cmt-full');
    if (!mark) full.appendChild(el('div', 'cmt-lost', 'text not found'));
    full.appendChild(el('div', 'cmt-quote', c.quote));
    full.appendChild(el('div', 'cmt-text', c.body));
    var foot = el('div', 'cmt-foot');
    foot.appendChild(el('span', 'cmt-when', when(c.updated || c.created)));
    var edit = el('button', 'cmt-act', 'Edit');
    var del = el('button', 'cmt-act', 'Delete');
    foot.appendChild(edit);
    foot.appendChild(del);
    full.appendChild(foot);
    card.appendChild(full);

    edit.addEventListener('click', function(e){
      e.stopPropagation();
      openEdit(c, (card._mark || card).getBoundingClientRect());
    });
    del.addEventListener('click', function(e){ e.stopPropagation(); armDelete(del, c); });
    card.addEventListener('click', function(){
      focusCmt(c.id, true);
      if (layerEl().classList.contains('dots')) openRead(c, (card._mark || card).getBoundingClientRect());
    });
    return card;
  }

  // the gutter with more room wins; too tight for a readable card and it becomes a dot
  function place(){
    var wrap = main.querySelector('.body-wrap'), body = main.querySelector('.doc');
    var layer = layerEl();
    if (!wrap || !body || !layer || !cmtOn) return;
    var cards = [].slice.call(layer.children);
    if (!cards.length) return;
    cards.forEach(function(card){ card.hidden = !!(card._mark && !card._mark.offsetParent); });
    cards = cards.filter(function(card){ return !card.hidden; });
    if (!cards.length) return;

    var wr = wrap.getBoundingClientRect(), dr = body.getBoundingClientRect();
    var roomL = dr.left - wr.left, roomR = wr.right - dr.right;
    var side = roomR >= roomL ? 'right' : 'left';
    var room = Math.max(roomL, roomR) - EDGE * 2;
    var dots = room < CARD_MIN;
    var w = dots ? 22 : Math.floor(Math.min(CARD_MAX, room));
    layer.classList.toggle('dots', dots);
    layer.style.setProperty('--cmt-w', w + 'px');

    var x = side === 'right' ? (dr.right - wr.left + EDGE) : (dr.left - wr.left - EDGE - w);
    var floor = -1e9;
    cards.forEach(function(card){
      var top = card._mark ? (card._mark.getBoundingClientRect().top - wr.top) : 0;
      if (top < floor) top = floor;
      card.style.left = Math.round(x) + 'px';
      card.style.top = Math.round(top) + 'px';
      floor = top + card.offsetHeight + CARD_GAP;
    });
  }

  function schedulePlace(){
    if (placeTick) return;
    placeTick = true;
    requestAnimationFrame(function(){ placeTick = false; place(); });
  }

  function watch(){
    if (!ro) return;
    ro.disconnect();
    var wrap = main.querySelector('.body-wrap');
    if (wrap) ro.observe(wrap);
  }

  function focusCmt(id, scroll){
    main.querySelectorAll('.cmt-card').forEach(function(c){ c.classList.toggle('on', c.dataset.cmt === id); });
    main.querySelectorAll('mark.cmt-hl').forEach(function(m){ m.classList.toggle('on', m.dataset.cmt === id); });
    if (!scroll) return;
    var m = main.querySelector('mark.cmt-hl[data-cmt="' + id + '"]');
    if (!m) return;
    unfoldTo(m);
    var r = m.getBoundingClientRect();
    if (r.top < 70 || r.bottom > innerHeight - 20) m.scrollIntoView({ block: 'center' });
  }

  // a highlight and its card are one comment seen twice: hovering either lights
  // both, so the link between the margin and the sentence is never a guess
  var hotId = null;
  function hot(id){
    if (id === hotId) return;
    hotId = id;
    main.querySelectorAll('.cmt-card').forEach(function(c){ c.classList.toggle('hot', !!id && c.dataset.cmt === id); });
    main.querySelectorAll('mark.cmt-hl').forEach(function(m){ m.classList.toggle('hot', !!id && m.dataset.cmt === id); });
  }

  /* --- the floating button and popover --- */

  function showAdd(rect){
    addBtn.hidden = false;
    var w = addBtn.offsetWidth;
    var left = Math.min(Math.max(8, rect.left), innerWidth - w - 8);
    var top = rect.bottom + 8;
    if (top > innerHeight - 40) top = Math.max(8, rect.top - 34);
    addBtn.style.left = Math.round(left) + 'px';
    addBtn.style.top = Math.round(top) + 'px';
  }
  function hideAdd(){ if (addBtn) addBtn.hidden = true; }

  function placePop(rect){
    pop.hidden = false;
    var w = pop.offsetWidth, h = pop.offsetHeight;
    var left = rect.left, top = rect.bottom + 8;
    if (top + h > innerHeight - 10) top = Math.max(10, rect.top - h - 8);
    if (left + w > innerWidth - 10) left = innerWidth - w - 10;
    pop.style.left = Math.round(Math.max(10, left)) + 'px';
    pop.style.top = Math.round(top) + 'px';
  }
  function closePop(){ if (pop){ pop.hidden = true; pop.textContent = ''; } }

  function editor(c, cap, rect){
    pop.textContent = '';
    pop.appendChild(el('div', 'cmt-quote', (c || cap).quote));
    var ta = document.createElement('textarea');
    ta.placeholder = 'Add a comment';
    ta.value = c ? c.body : '';
    pop.appendChild(ta);
    var row = el('div', 'cmt-row');
    row.appendChild(el('span', 'cmt-spacer'));
    var cancel = el('button', 'cmt-btn', 'Cancel');
    var save = el('button', 'cmt-btn go', c ? 'Save' : 'Comment');
    row.appendChild(cancel);
    row.appendChild(save);
    pop.appendChild(row);
    placePop(rect);
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);

    cancel.addEventListener('click', closePop);
    save.addEventListener('click', function(){
      var text = ta.value.trim();
      if (!text) { ta.focus(); return; }
      if (c){
        c.body = text;
        c.updated = Date.now();
      } else {
        comments.push({ id: uid(), doc: cap.doc, quote: cap.quote, prefix: cap.prefix,
                        suffix: cap.suffix, section: cap.section, body: text,
                        created: Date.now(), updated: Date.now() });
      }
      writeComments();
      closePop();
      hideAdd();
      var s = window.getSelection();
      if (s) s.removeAllRanges();
      renderComments();
    });
    ta.addEventListener('keydown', function(e){
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save.click();
    });
  }

  function openEdit(c, rect){ editor(c, null, rect); }

  function openRead(c, rect){
    pop.textContent = '';
    pop.appendChild(el('div', 'cmt-quote', c.quote));
    pop.appendChild(el('div', 'cmt-text', c.body));
    var foot = el('div', 'cmt-foot');
    foot.appendChild(el('span', 'cmt-when', when(c.updated || c.created)));
    var edit = el('button', 'cmt-act', 'Edit');
    var del = el('button', 'cmt-act', 'Delete');
    foot.appendChild(edit);
    foot.appendChild(del);
    pop.appendChild(foot);
    placePop(rect);
    edit.addEventListener('click', function(){ openEdit(c, rect); });
    del.addEventListener('click', function(){ armDelete(del, c); });
  }

  // two taps rather than a blocking confirm dialog
  function armDelete(btn, c){
    if (btn.dataset.armed){
      comments = comments.filter(function(x){ return x.id !== c.id; });
      writeComments();
      closePop();
      renderComments();
      return;
    }
    btn.dataset.armed = '1';
    btn.textContent = 'Sure?';
    setTimeout(function(){
      if (!btn.isConnected) return;
      delete btn.dataset.armed;
      btn.textContent = 'Delete';
    }, 3000);
  }

  /* --- wiring --- */

  function near(e, s){ var t = e.target; return t && t.closest ? t.closest(s) : null; }

  if (CMT_ON){
    document.addEventListener('mouseup', function(e){
      if (near(e, '#cmt-add') || near(e, '.cmt-pop') || near(e, '.cmt-card')) return;
      setTimeout(function(){
        if (!cmtOn) return;
        var cap = capture();
        if (!cap){ hideAdd(); return; }
        pending = cap;
        showAdd(cap.rect);
      }, 0);
    });

    document.addEventListener('mousedown', function(e){
      if (near(e, '#cmt-add') || near(e, '.cmt-pop')) return;
      hideAdd();
      closePop();
    });

    addBtn.addEventListener('click', function(){
      if (!pending) return;
      hideAdd();
      editor(null, pending, pending.rect);
    });

    document.addEventListener('mouseover', function(e){
      var t = near(e, 'mark.cmt-hl') || near(e, '.cmt-card');
      hot(t ? t.dataset.cmt : null);
    });

    document.addEventListener('click', function(e){
      var m = near(e, 'mark.cmt-hl');
      if (!m) return;
      var c = comments.filter(function(x){ return x.id === m.dataset.cmt; })[0];
      if (!c) return;
      focusCmt(c.id, false);
      if (layerEl().classList.contains('dots')) openRead(c, m.getBoundingClientRect());
    });

    document.addEventListener('keydown', function(e){
      if (e.key !== 'Escape' || pop.hidden) return;
      closePop();
      hideAdd();
      e.stopImmediatePropagation();
    }, true);

    document.getElementById('cmt-tog').addEventListener('click', function(){
      cmtOn = !cmtOn;
      keep('cmt-off', cmtOn ? '' : '1');
      this.classList.toggle('off', !cmtOn);
      closePop();
      hideAdd();
      renderComments();
    });
    document.getElementById('cmt-tog').classList.toggle('off', !cmtOn);
    paintCount();
  }

  addEventListener('resize', schedulePlace);
  if (typeof ResizeObserver !== 'undefined') ro = new ResizeObserver(schedulePlace);

  /* ---------------- live update ---------------- */
  // Only the page served by docucane --watch calls this; one opened from disk
  // never does. New documents replace old ones one by one: the sidebar is
  // rebuilt only if something it shows moved, and the document being read is
  // patched rather than opened again - same place on the page, same folds, same
  // comments, and a diagram whose source did not change is carried over as
  // drawn instead of being laid out again. What did change is marked.

  var BLOCKS = 'p,li,h1,h2,h3,h4,h5,h6,pre,table,blockquote,figure,img,hr';
  var MARK_SHARE = .5;       // past half the page changed, marking all of it says nothing
  var TOP_EDGE = 64;         // below the sticky top bar
  var hold = null;

  function applyUpdate(next, count){
    var old = byId, before = docs;
    var navOf = function(list){
      return JSON.stringify(list.map(function(d){ return [d.id, d.title, d.badge, d.group, d.file, d.sections]; }));
    };
    var navMoved = navOf(before) !== navOf(next);

    docs = next;
    byId = {};
    docs.forEach(function(d){ byId[d.id] = d; });
    var changed = docs.filter(function(d){
      return !old[d.id] || JSON.stringify(old[d.id]) !== JSON.stringify(d);
    }).map(function(d){ return d.id; });
    var removed = before.filter(function(d){ return !byId[d.id]; }).map(function(d){ return d.id; });

    var small = document.querySelector('.brand small');
    if (small && count) small.textContent = count;

    // other documents are built again when next opened; when the order or a
    // title moved, their previous / next links are stale too
    Object.keys(cache).forEach(function(id){
      if (id !== current && (navMoved || !byId[id] || changed.indexOf(id) >= 0)) delete cache[id];
    });
    if (navMoved) rebuildNav();

    var r = { changed: changed, removed: removed, current: current, count: 0, first: null };
    if (!byId[current]){
      // a rename is one document gone and one arrived: follow it
      var added = changed.filter(function(id){ return !old[id]; });
      var to = removed.length === 1 && added.length === 1 ? added[0] : docs[0].id;
      delete cache[current];
      current = null;
      history.replaceState(null, '', '#/' + to);
      show(to);
      r.current = to;
      r.moved = true;
      return r;
    }
    if (navMoved || changed.indexOf(current) >= 0) patch(old[current], byId[current], r);
    return r;
  }

  function rebuildNav(){
    var top = nav.scrollTop, open = {};
    nav.querySelectorAll('.item.open').forEach(function(n){ open[n.dataset.doc] = 1; });
    nav.textContent = '';
    buildNav();
    nav.querySelectorAll('.item').forEach(function(n){
      n.classList.toggle('active', n.dataset.doc === current);
      n.classList.toggle('open', !!open[n.dataset.doc] || n.dataset.doc === current);
    });
    if (search && search.value) search.dispatchEvent(new Event('input'));
    nav.scrollTop = top;
  }

  function patch(was, d, r){
    var from = main.querySelector('.body-wrap');
    var at = anchorPoint();
    delete cache[d.id];
    var to = bodyFor(d);
    var marks = changedBlocks(was, d, to);
    carryDiagrams(from, to);

    main.textContent = '';
    main.appendChild(to);
    heads = [].slice.call(main.querySelectorAll('h1[id],h2[id]'));
    barTitle.textContent = d.title;
    document.title = d.title + ' — ' + CFG.title;
    restoreFolds(main);
    if (window.__diagrams) window.__diagrams.drawAll(main);
    renderComments();
    watch();
    keepPlace(at);

    r.count = marks.length;
    r.first = marks[0] || null;
    if (marks.length <= Math.max(3, MARK_SHARE * to.querySelectorAll(BLOCKS).length)){
      marks.forEach(function(m){ m.classList.add('dc-changed'); });
    }
    requestAnimationFrame(sync);
  }

  // Blocks of the new copy that were not in the old one, compared as markup
  // before anything (diagrams, comments) is drawn into either. Only the
  // innermost is kept: an edited list item marks the item, not the list.
  function changedBlocks(was, d, holder){
    var out = [];
    var head = holder.querySelector('.head');
    if (was.title !== d.title) out.push(head.querySelector('h1'));
    if (was.subtitle !== d.subtitle && head.querySelector('p')) out.push(head.querySelector('p'));

    var body = holder.querySelector('.doc');
    var t = document.createElement('template');
    t.innerHTML = was.html;
    var left = {};
    [].slice.call(t.content.querySelectorAll(BLOCKS)).forEach(function(n){
      left[n.outerHTML] = (left[n.outerHTML] || 0) + 1;
    });
    var hits = [].slice.call(body.querySelectorAll(BLOCKS)).filter(function(n){
      if (!left[n.outerHTML]) return true;
      left[n.outerHTML]--;
      return false;
    }).filter(function(n){
      // a diagram's source is hidden; the diagram itself is what changed
      return n.tagName === 'FIGURE' || !n.closest('figure');
    });
    var outer = new Set();
    hits.forEach(function(n){
      for (var p = n.parentNode; p && p !== body; p = p.parentNode) outer.add(p);
    });
    return out.concat(hits.filter(function(n){ return !outer.has(n); }));
  }

  function srcOf(fig){
    var s = fig.querySelector('.diagram-src');
    return s ? s.textContent : '';
  }

  function carryDiagrams(from, to){
    if (!from) return;
    var olds = [].slice.call(from.querySelectorAll('figure[data-diagram]'));
    var pool = {}, used = new Set(), fresh = [];
    olds.forEach(function(f){ (pool[srcOf(f)] = pool[srcOf(f)] || []).push(f); });
    [].slice.call(to.querySelectorAll('figure[data-diagram]')).forEach(function(f){
      var same = pool[srcOf(f)];
      if (!same || !same.length) return fresh.push(f);
      var o = same.shift();
      used.add(o);
      f.parentNode.replaceChild(o, f);
    });

    // Edited diagrams, when they line up one for one with the ones they
    // replace: the old drawing stays up, faded, until the new one is ready -
    // no collapse and regrow under the reader - and a layout switched, or an
    // entity opened, from the page stays that way.
    var stale = olds.filter(function(f){ return !used.has(f); });
    if (stale.length !== fresh.length) return;
    fresh.forEach(function(f, i){
      var o = stale[i];
      if (o.dataset.engine) f.dataset.engine = o.dataset.engine;
      if (o._open) f._open = o._open;
      var out = f.querySelector('.diagram-out'), prev = o.querySelector('.diagram-out');
      if (!out || !prev || !prev.firstChild) return;
      while (prev.firstChild) out.appendChild(prev.firstChild);
      f.classList.add('dc-redraw');
      if (typeof MutationObserver === 'undefined') return;
      new MutationObserver(function(_, mo){
        f.classList.remove('dc-redraw');
        mo.disconnect();
      }).observe(out, { childList: true });
    });
  }

  // What the reader is looking at: the first visible block under the top bar,
  // remembered by its text so the same block can be found in the new copy,
  // plus the heading of its section in case that block is the one edited.
  function blockKey(n){
    return n.tagName + '\n' + (n.tagName === 'FIGURE' ? srcOf(n) : n.textContent);
  }

  function anchorPoint(){
    var body = main.querySelector('.doc');
    if (!body || scrollY < 4) return null;
    var list = [].slice.call(body.querySelectorAll(BLOCKS));
    for (var i = 0; i < list.length; i++){
      if (!list[i].offsetParent || list[i].getBoundingClientRect().bottom <= TOP_EDGE) continue;
      var pick = list[i];
      for (var j = i + 1; j < list.length && pick.contains(list[j]); j++){
        if (list[j].offsetParent && list[j].getBoundingClientRect().bottom > TOP_EDGE) pick = list[j];
      }
      var key = blockKey(pick), nth = 0;
      for (var k = 0; list[k] !== pick; k++) if (list[k].tagName === pick.tagName && blockKey(list[k]) === key) nth++;
      var sec = pick.closest('.sec');
      var h = sec && document.getElementById(sec.dataset.sec);
      return {
        key: key, tag: pick.tagName, nth: nth, top: pick.getBoundingClientRect().top,
        head: h ? h.id : null, headTop: h ? h.getBoundingClientRect().top : 0
      };
    }
    return null;
  }

  function findAnchor(at){
    var list = main.querySelectorAll('.doc ' + BLOCKS.split(',').join(',.doc '));
    for (var i = 0, n = 0; i < list.length; i++){
      if (list[i].tagName !== at.tag || blockKey(list[i]) !== at.key) continue;
      if (n++ !== at.nth) continue;
      if (list[i].offsetParent) return { el: list[i], top: at.top };
      break;
    }
    var h = at.head && document.getElementById(at.head);
    return h && main.contains(h) && h.offsetParent ? { el: h, top: at.headTop } : null;
  }

  // Put that block back where it was, and keep it there while edited diagrams
  // finish drawing and change the height of what is above it - until the reader
  // scrolls, clicks or types, which means they have moved on.
  function keepPlace(at){
    if (hold) hold.stop();
    if (!at) return;
    var target = findAnchor(at);
    if (!target) return;
    var until = Date.now() + 4000, stopped = false;
    var kinds = ['wheel', 'touchstart', 'keydown', 'mousedown'];
    var stop = function(){
      stopped = true;
      kinds.forEach(function(k){ removeEventListener(k, stop, true); });
      hold = null;
    };
    kinds.forEach(function(k){ addEventListener(k, stop, true); });
    hold = { stop: stop };
    (function align(){
      if (stopped) return;
      if (Date.now() > until || !target.el.isConnected) return stop();
      var drift = target.el.getBoundingClientRect().top - target.top;
      if (Math.abs(drift) >= 1) window.scrollBy(0, drift);
      requestAnimationFrame(align);
    })();
  }

  function bring(n){
    if (!n || !n.isConnected) return;
    if (hold) hold.stop();
    unfoldTo(n);
    n.scrollIntoView({ behavior: 'smooth', block: 'center' });
    n.classList.remove('dc-changed');
    void n.offsetWidth;
    n.classList.add('dc-changed');
  }

  /* ---------------- settings ----------------
     The panel changes the page as the reader moves a control, so the effect is
     judged on the documents themselves. Keeping a change is not the page's to
     do - a page opened from its file cannot write the project's config - so it
     hands the settings to whoever can: docucane --watch sets app.save. */

  var setBox = document.getElementById('settings');
  var setBtn = document.getElementById('settings-btn');
  var setMarginIn = document.getElementById('set-margin');
  var setMarginVal = document.getElementById('set-margin-val');
  var setMarginAuto = document.getElementById('set-margin-auto');
  var setStatus = document.getElementById('settings-status');
  var settings = { margin: CFG.margin == null ? null : CFG.margin };
  var saveTimer = 0, saved = JSON.stringify(settings);

  function applyMargin(px){
    var root = document.documentElement;
    root.classList.toggle('fixed-margin', px != null);
    if (px == null) root.style.removeProperty('--margin');
    else root.style.setProperty('--margin', px + 'px');
    schedulePlace();
  }

  // the room there is now, from the edge of the reading area to the text
  function marginNow(){
    var col = main.querySelector('.doc') || main.querySelector('.head') || main.querySelector('.empty');
    if (!col) return Number(setMarginIn.min);
    var pad = parseFloat(getComputedStyle(col).paddingLeft) || 0;
    return Math.round(col.getBoundingClientRect().left - main.getBoundingClientRect().left + pad);
  }

  function showSettings(){
    var auto = settings.margin == null;
    setMarginIn.value = auto ? marginNow() : settings.margin;
    setMarginVal.textContent = auto ? 'Automatic · ' + setMarginIn.value + ' px' : settings.margin + ' px';
    setMarginAuto.disabled = auto;
  }

  function status(html, bad){
    setStatus.className = 'settings-foot' + (bad ? ' bad' : '');
    setStatus.innerHTML = html;
  }
  function idleStatus(){
    status(app.save ? 'Changes are saved to the project, in <code>docs.config.json</code>.'
      : 'Preview only: a page opened from its file cannot change the project. ' +
        'Run <code>docucane --watch</code> to save changes.');
  }

  function changed(){
    applyMargin(settings.margin);
    showSettings();
    if (!app.save) return;
    clearTimeout(saveTimer);
    status('Saving…');
    // a slider sends a value for every step; the project is written once it rests
    saveTimer = setTimeout(function(){
      var sent = JSON.stringify(settings);
      if (sent === saved) return idleStatus();
      app.save(JSON.parse(sent)).then(function(){
        saved = sent;
        status('Saved to <code>docs.config.json</code>.');
      }, function(err){
        status('Not saved: ' + escText(err && err.message || err), true);
      });
    }, 450);
  }
  function escText(s){ return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  function openSettings(){
    showSettings();
    idleStatus();
    setBox.hidden = false;
    setMarginIn.focus();
  }
  function closeSettings(){ setBox.hidden = true; }

  setBtn.addEventListener('click', function(){ if (setBox.hidden) openSettings(); else closeSettings(); });
  document.getElementById('settings-close').addEventListener('click', closeSettings);
  setMarginIn.addEventListener('input', function(){ settings.margin = Number(setMarginIn.value); changed(); });
  setMarginAuto.addEventListener('click', function(){ settings.margin = null; changed(); });
  document.addEventListener('mousedown', function(e){
    if (!setBox.hidden && !setBox.contains(e.target) && !setBtn.contains(e.target)) closeSettings();
  });
  // Esc closes the panel before it does anything else on the page
  document.addEventListener('keydown', function(e){
    if (e.key !== 'Escape' || setBox.hidden) return;
    e.stopImmediatePropagation();
    closeSettings();
    setBtn.focus();
  }, true);

  var app = window.__docucane = {
    save: null,
    apply: applyUpdate,
    bring: bring,
    doc: function(id){ return byId[id]; }
  };

  if (recall('collapsed')) layout.classList.add('collapsed');
  buildNav();
  route();
})();
`;
