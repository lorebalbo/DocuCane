// css.mjs - the whole stylesheet, inlined into the page.

export const CSS = `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
:root{
  --bg:#e9ebef; --ink:#141a26; --muted:#5f6674; --faint:#98a0ad; --line:#d7dbe2;
  --surface:#fff; --surface-2:#f2f3f6; --hover:rgba(255,255,255,.62);
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
  /* Inter is vendored into the page as a variable font; everything after it is
     the offline fallback. Swap this one line to re-face the whole dashboard. */
  --font:Inter,"Avenir Next","Segoe UI",system-ui,-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;
  /* Emphasis is one notch of weight, not two: bold should read as emphasis
     inside the sentence, not as a heavier typeface dropped into it. */
  --semi:560; --bold:620;
  --scroll:#c3c9d4; --scroll-on:#a3abb9;
  --rail:270px;
  /* content column: --measure is the text width, --gutter the breathing room
     either side of it. The column is centred in the main area. */
  --measure:92ch; --gutter:46px;
  --column:calc(var(--measure) + var(--gutter) * 2);
  --margin:var(--gutter);
  /* diagrams */
  --dg-node:#fff; --dg-node-line:#c3c9d4; --dg-edge:#8a91a0; --dg-edge-text:#5f6674;
  --dg-group:#f7f8fa; --dg-group-line:#dfe3ea; --dg-hot:#1b56d6; --dg-hot-soft:#eaf0fd;
  /* entity tables: the header band and the row hover are washes laid over the
     box, so a classDef colour on an entity still reads through them */
  --dg-er-head:rgba(20,26,38,.045); --dg-er-head-hot:rgba(27,86,214,.07);
  --dg-er-line:#e7eaf0; --dg-er-hover:rgba(27,86,214,.11);
  --dg-er-badge:#eef0f4; --dg-er-badge-line:#dce0e8; --dg-er-badge-ink:#5f6674;
  --dg-er-badge-pk:#dfe4ee; --dg-er-badge-pk-line:#c8d0dd;
  /* sequences: notes are the one warm surface, so an aside never reads as a message */
  --dg-seq-num:#5f6674; --dg-seq-note:#fbf8ee; --dg-seq-note-line:#e7dfc4; --dg-seq-note-ink:#4f4a3a;
}
/* A project that fixes its margins (layout.margin) gives the column whatever
   the reading area leaves once they are taken: --margin runs from the edge of
   the area to the text, so the column's own gutter is inside it. Never wider
   than the area, never so narrow the text stops reading as a column. */
:root.fixed-margin{--column:clamp(360px,calc(100% - var(--margin) * 2 + var(--gutter) * 2),100%)}
body{margin:0;background:var(--bg);color:var(--ink);
  font:15px/1.7 var(--font);
  font-optical-sizing:auto;
  -webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.layout{display:grid;grid-template-columns:var(--rail) 1fr;min-height:100vh}
.layout.collapsed{--rail:62px}

/* ---- scrollbars ----
   Chrome and Safari take the ::-webkit rules. Firefox only understands the two
   standard properties - and Chrome lets those override everything below - so
   they are kept behind a Firefox-only @supports. */
::-webkit-scrollbar{width:11px;height:11px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{min-height:34px;border:3px solid transparent;border-radius:99px;
  background:var(--scroll);background-clip:padding-box}
::-webkit-scrollbar-thumb:hover{background:var(--scroll-on);background-clip:padding-box}
::-webkit-scrollbar-thumb:active{background:var(--muted);background-clip:padding-box}
::-webkit-scrollbar-corner{background:transparent}
@supports (-moz-appearance:none){*{scrollbar-width:thin;scrollbar-color:var(--scroll) transparent}}

/* ---- sidebar ---- */
.side{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;
  border-right:1px solid var(--line);overflow:hidden}
.side-top{padding:16px 14px 12px}
.brand{min-width:0}
/* the toggle shares a row with the title, so its 28px box - and the background
   that appears under it on hover - is centred on the title's own line rather
   than on the title-plus-subtitle block */
.brand-row{display:flex;align-items:center;gap:8px;min-width:0}
.brand-name{flex:1;min-width:0;height:28px;line-height:28px;font-size:14px;font-weight:var(--bold);
  letter-spacing:-.012em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.brand small{display:block;margin-top:1px;font-size:11.5px;line-height:1.45;color:var(--muted)}
.icon-btn{width:28px;height:28px;flex:none;display:grid;place-items:center;border:1px solid transparent;
  border-radius:8px;background:none;color:var(--muted);cursor:pointer;
  transition:background .15s,color .15s,border-color .15s}
.icon-btn:hover{background:var(--hover);color:var(--ink);border-color:var(--line)}
.icon-btn svg{width:15px;height:15px}
.search{margin:8px 14px 6px;position:relative}
.search input{width:100%;padding:7px 10px 7px 29px;border:1px solid var(--line);border-radius:9px;
  background:var(--surface);color:var(--ink);font:inherit;font-size:13px;outline:none}
.search input::placeholder{color:var(--faint)}
.search input:focus{border-color:#b9c0cc;box-shadow:0 0 0 3px rgba(18,23,35,.05)}
.search svg{position:absolute;left:10px;top:50%;transform:translateY(-50%);width:13px;height:13px;color:var(--faint)}
.nav{flex:1;overflow-y:auto;overflow-x:hidden;padding:2px 10px 24px}
.nav::-webkit-scrollbar{width:9px}
.nav-group{margin:16px 6px 6px;font-size:10px;font-weight:var(--bold);letter-spacing:.11em;
  text-transform:uppercase;color:var(--faint)}
.nav-group:first-child{margin-top:2px}

/* documents: a flat row, an ink hairline marking the open one */
.item{position:relative;display:flex;align-items:center;gap:10px;padding:7px 8px 7px 14px;
  border-radius:8px;cursor:pointer;color:var(--muted);transition:color .12s,background .12s}
.item::before{content:"";position:absolute;left:4px;top:50%;width:2px;height:0;border-radius:2px;
  background:var(--ink);transform:translateY(-50%);transition:height .18s ease}
.item:hover{color:var(--ink);background:var(--hover)}
.item.active{color:var(--ink)}
.item.active::before{height:15px}
.num{flex:none;min-width:15px;font-size:11px;font-weight:var(--semi);color:var(--faint);
  font-variant-numeric:tabular-nums;transition:color .12s}
.item:hover .num,.item.active .num{color:var(--muted)}
.item-title{flex:1;min-width:0;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.item.active .item-title{font-weight:var(--semi)}
.caret{width:13px;height:13px;flex:none;color:var(--faint);opacity:0;
  transition:transform .18s ease,opacity .15s}
.item:hover .caret,.item.active .caret{opacity:1}
.item.open .caret{transform:rotate(90deg)}

/* sections: a hairline rail with one node per heading */
.subs{display:none;position:relative;margin:2px 0 10px;padding:2px 0}
.subs::before{content:"";position:absolute;left:20px;top:9px;bottom:9px;width:1px;background:var(--line)}
.item.open+.subs{display:block}
.sub{position:relative;display:flex;gap:8px;padding:4px 8px 4px 33px;border-radius:7px;
  font-size:12.5px;color:var(--muted);cursor:pointer;transition:color .12s,background .12s}
.sub::after{content:"";position:absolute;left:17px;top:50%;width:7px;height:7px;margin-top:-3.5px;
  border-radius:50%;background:var(--bg);border:1px solid var(--line);transition:.15s}
.sub:hover{color:var(--ink);background:var(--hover)}
.sub:hover::after{border-color:var(--muted)}
.sub.current{color:var(--ink);font-weight:var(--semi)}
.sub.current::after{background:var(--ink);border-color:var(--ink)}
.sub-n{flex:none;font-size:11px;color:var(--faint);font-variant-numeric:tabular-nums}
.sub.current .sub-n{color:var(--muted)}
.sub-t{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

.collapsed .brand-name,.collapsed .brand small,.collapsed .search,.collapsed .nav-group,
.collapsed .item-title,.collapsed .caret,.collapsed .side-foot,.collapsed #settings-btn{display:none}
.collapsed .subs,.collapsed .item.open+.subs{display:none}
.collapsed .side-top{padding:16px 0 12px}
.collapsed .brand-row{justify-content:center}
.collapsed .nav{padding:2px 8px;scrollbar-width:none}
.collapsed .nav::-webkit-scrollbar{display:none}
.collapsed .item{justify-content:center;padding:8px 0;margin-bottom:2px}
.collapsed .item::before{left:0}
.collapsed .num{min-width:0;font-size:12px}
`;

export const CSS_MAIN = `
/* ---- main ---- */
.main{min-width:0;display:flex;flex-direction:column}
.head{padding:34px var(--gutter) 22px;width:100%;max-width:var(--column);margin-inline:auto}
.head h1{margin:0;font-size:27px;line-height:1.22;font-weight:var(--bold);letter-spacing:-.024em;color:var(--ink)}
.head p{margin:11px 0 0;max-width:78ch;font-size:15px;line-height:1.62;color:var(--muted)}
.meta{margin-top:16px;display:flex;flex-wrap:wrap;gap:16px;font-size:11.5px;color:var(--faint);
  font-variant-numeric:tabular-nums}
.doc{padding:4px var(--gutter) 30px;width:100%;max-width:var(--column);margin-inline:auto}
.doc:last-child{padding-bottom:25vh}

/* ---- prev / next ---- */
.docnav{width:100%;max-width:var(--column);margin-inline:auto;padding:0 var(--gutter) 25vh;
  display:grid;grid-template-columns:1fr 1fr;gap:14px}
.docnav-btn{display:flex;flex-direction:column;gap:4px;min-width:0;padding:14px 16px;
  background:var(--surface);border:1px solid var(--line);border-radius:11px;
  transition:background .15s ease,border-color .15s ease}
.docnav-btn:hover{background:var(--surface-2);border-color:#c3c9d4}
.docnav-btn.next{grid-column:2;text-align:right}
.docnav-label{font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--faint)}
.docnav-title{font-size:14px;font-weight:var(--semi);letter-spacing:-.01em;color:var(--ink);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

/* ---- sections ----
   Every heading owns the blocks under it, so a section can be folded away and
   the space between two of them can be set as one rule instead of guessed at
   from heading margins. */
.doc [id]{scroll-margin-top:88px}
.sec{margin-top:30px}
.doc>.sec{margin-top:54px;padding-top:32px;border-top:1px solid var(--line)}
.doc>.sec:first-child{margin-top:2px;padding-top:0;border-top:0}
.sec .sec{margin-top:34px}
.sec .sec .sec{margin-top:24px}
.sec .sec .sec .sec{margin-top:18px}
.sec.shut>.sec-body{display:none}

.sec-head{position:relative;display:flex;align-items:baseline;gap:11px;cursor:pointer;
  line-height:1.32;letter-spacing:-.018em;scroll-margin-top:98px}
h1.sec-head{margin:0 0 15px;font-size:22px;font-weight:var(--bold)}
h2.sec-head{margin:0 0 13px;font-size:18.5px;font-weight:var(--bold)}
h3.sec-head{margin:0 0 10px;font-size:15.5px;font-weight:var(--semi)}
h4.sec-head,h5.sec-head,h6.sec-head{margin:0 0 8px;font-size:14px;font-weight:var(--semi);color:var(--muted)}
/* The fold arrow and the number sit out in the margin, so a heading starts on
   the same left edge as the prose under it. The cluster is anchored by its
   right edge and grows leftwards, so the number never moves when the arrow
   fades in; its box is exactly one line tall, which is what centres both of
   them on the heading's first line whatever the heading's size. */
.sec-gut{position:absolute;right:100%;top:0;margin-right:14px;height:1.32em;
  display:flex;align-items:center;gap:5px;white-space:nowrap;user-select:none}
.sec-num{font-size:.8em;font-weight:var(--semi);letter-spacing:0;color:var(--faint);
  font-variant-numeric:tabular-nums}
.sec-txt{min-width:0}
.sec-tog{flex:none;width:18px;height:18px;padding:0;display:grid;place-items:center;
  border:0;border-radius:6px;background:none;color:var(--faint);
  cursor:pointer;opacity:0;transition:opacity .15s,background .15s,color .15s}
.sec-tog svg{width:12px;height:12px;transition:transform .18s ease}
.sec-tog:hover{background:var(--hover);color:var(--ink)}
.sec-head:hover .sec-tog,.sec.shut>.sec-head .sec-tog{opacity:1}
.sec.shut>.sec-head{margin-bottom:0;color:var(--muted)}
.sec.shut>.sec-head .sec-num{color:var(--muted)}
.sec.shut>.sec-head .sec-tog svg{transform:rotate(-90deg)}
.h-anchor{flex:none;font-size:.78em;font-weight:400;color:var(--faint);
  opacity:0;transition:opacity .15s,color .15s}
.sec-head:hover .h-anchor{opacity:1}
.h-anchor:hover{color:var(--ink)}

/* ---- prose ---- */
.doc p{margin:0 0 18px}
.doc>p:first-child{margin-top:6px}
.sec-body>:last-child,.doc blockquote>:last-child,.doc li>:last-child{margin-bottom:0}
.doc li{margin:6px 0}
.doc ul,.doc ol{margin:0 0 18px;padding-left:24px}
.doc li>ul,.doc li>ol{margin:6px 0}
.doc li::marker{color:var(--faint)}
.doc strong{font-weight:var(--semi);color:inherit}
.doc em{font-style:italic}
.doc a:not(.h-anchor){color:var(--ink);border-bottom:1px solid #b6bdc9;padding-bottom:1px}
.doc a:not(.h-anchor):hover{border-bottom-color:var(--ink);background:rgba(255,255,255,.55)}
.doc hr{margin:32px 0;border:0;border-top:1px solid var(--line)}
.doc blockquote{margin:0 0 18px;padding:2px 0 2px 17px;border-left:2px solid #c3c9d4;color:var(--muted)}
/* Inline code is a wash laid inside the sentence, not a bordered chip dropped
   into it: no outline, a tint of the ink instead of a white plate, and padding
   in em so the box tracks the text it sits in - including inside a heading or
   a white table cell, where a white plate would have vanished. */
.doc code{font-family:var(--mono);font-size:.855em;letter-spacing:-.008em;
  background:rgba(20,26,38,.06);border-radius:4px;padding:.13em .32em;
  color:#333a4a;white-space:nowrap}
.doc a:not(.h-anchor) code{background:rgba(27,86,214,.075);color:#22315a}
.doc h1 code,.doc h2 code,.doc h3 code,.doc h4 code{font-size:.88em;font-weight:var(--semi)}
.doc del{color:var(--faint)}
.doc img{max-width:100%;border-radius:10px}

/* ---- code ---- */
.code-wrap{position:relative;margin:0 0 20px}
.code-lang{position:absolute;top:9px;right:12px;font-family:var(--mono);font-size:10px;
  letter-spacing:.06em;text-transform:uppercase;color:var(--faint);pointer-events:none}
pre.code{margin:0;padding:15px 17px;overflow-x:auto;max-width:100%;background:var(--surface);
  border:1px solid var(--line);border-radius:11px}
pre.code code{font-family:var(--mono);font-size:12.5px;line-height:1.62;white-space:pre;
  letter-spacing:0;background:none;border:0;padding:0;color:#2a3040}

/* ---- tables ---- */
.table-wrap{margin:0 0 20px;overflow-x:auto;max-width:100%;background:var(--surface);
  border:1px solid var(--line);border-radius:11px}
table{border-collapse:collapse;width:100%;font-size:13.5px}
th,td{padding:10px 14px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}
th{font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);
  font-weight:var(--bold);white-space:nowrap;background:var(--surface-2)}
tbody tr:last-child td{border-bottom:0}
td code{white-space:normal}

/* ---- misc ---- */
.empty{padding:60px var(--gutter);width:100%;max-width:var(--column);margin-inline:auto;color:var(--muted)}
mark{background:#dfe3ea;color:var(--ink);border-radius:3px;padding:0 2px}
@media (max-width:820px){
  .layout{grid-template-columns:var(--rail)}
  .layout:not(.collapsed) .main{display:none}
  :root{--gutter:20px}
  :root.fixed-margin{--column:100%}
  .docnav{grid-template-columns:1fr}
  .docnav-btn.next{grid-column:1;text-align:left}
}
/* Not enough room beside the column to hang the arrow and the number in:
   bring them back into the heading row rather than let them fall off-screen. */
@media (max-width:1120px){
  .sec-gut{position:static;height:auto;margin-right:0;align-self:center}
  .sec-tog{opacity:1}
}
@media print{
  .side{display:none}.layout{grid-template-columns:1fr}
  .sec.shut>.sec-body{display:block}.sec-tog,.h-anchor{display:none}
}
`;

export const CSS_BAR = `
.topbar{position:fixed;top:0;left:var(--rail);right:0;z-index:6;pointer-events:none;
  display:flex;height:46px;
  background:rgba(233,235,239,.88);backdrop-filter:saturate(180%) blur(12px);
  border-bottom:1px solid var(--line);transform:translateY(-101%);transition:transform .22s ease}
.topbar.show{transform:none}
.topbar-in{display:flex;align-items:center;gap:10px;min-width:0;width:100%;
  max-width:var(--column);margin-inline:auto;padding:0 var(--gutter)}
.topbar b{font-size:13.5px;font-weight:var(--bold);letter-spacing:-.012em}
.topbar span{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
`;

/* ------------------------------------------------------------- diagrams */

export const CSS_DIAGRAM = `
.diagram{position:relative;margin:0 0 22px;padding:0 18px 22px;background:var(--surface);
  border:1px solid var(--line);border-radius:12px;text-align:center;overflow-x:auto;max-width:100%}
.diagram-src{display:none}
.diagram svg{max-width:100%;height:auto}
/* The header: what the diagram is, and what can be done with it. It spans the
   frame (the negative margins undo the frame's side padding) and stays put
   while a diagram wider than the frame is scrolled sideways. */
.diagram-head{position:sticky;left:0;z-index:4;display:flex;align-items:center;gap:12px;min-height:40px;
  margin:0 -18px 20px;padding:6px 8px 6px 16px;border-bottom:1px solid var(--line);
  background:var(--surface);border-radius:12px 12px 0 0;text-align:left}
.diagram-name{flex:1;min-width:0;display:flex;align-items:baseline;gap:9px;overflow:hidden;white-space:nowrap}
.diagram-kind{flex:none;font-size:10px;font-weight:var(--bold);letter-spacing:.09em;text-transform:uppercase;color:var(--faint)}
.diagram-title{min-width:0;overflow:hidden;text-overflow:ellipsis;font-size:12.5px;font-weight:var(--semi);color:var(--ink)}
.diagram-bar{flex:none;display:flex;gap:5px}
.diagram-btn{padding:3px 9px;font:inherit;font-size:11px;color:var(--muted);
  background:var(--surface-2);border:1px solid var(--line);border-radius:7px;cursor:pointer}
.diagram-btn:hover{color:var(--ink);border-color:#c3c9d4}
.diagram-btn:empty{display:none}
.diagram:has(svg):hover{border-color:#c3c9d4}
.diagram .fail{font-family:var(--mono);font-size:12px;color:var(--muted);text-align:left;white-space:pre-wrap}
.diagram-note{margin-top:10px;font-size:11px;color:var(--faint);text-align:center}
/* A collapsed diagram is its header and nothing else: a plain white box the
   height of a line, which a click opens again. */
.diagram.is-folded{padding-bottom:0;overflow:hidden;cursor:pointer}
.diagram.is-folded .diagram-head{margin-bottom:0;border-bottom-color:transparent}
.diagram.is-folded:hover{border-color:#c3c9d4}
.diagram.is-folded .diagram-out,.diagram.is-folded .diagram-note,
.diagram.is-folded .diagram-btn:not([data-act=fold]){display:none}
@media print{.diagram.is-folded{display:none}.diagram-bar{display:none}}

/* A wide diagram is allowed to spill a little past the text column - the point
   of the column is to keep prose readable, and a diagram is not prose. */
@media (min-width:1280px){.diagram,.table-wrap{width:calc(100% + 170px)}}

/* ---- the clean renderer ----
   Nothing here is decoration. Every rule exists so a reader can answer one of
   two questions in a dense chart: which arrow is this label on, and what
   touches this box. Hovering answers the first, clicking a node the second. */
svg.dg{display:block;margin-inline:auto;cursor:default;-webkit-user-select:none;user-select:none}
svg.dg text{font-family:var(--font);dominant-baseline:middle}
.dg-node-shape{fill:var(--dg-node);stroke:var(--dg-node-line);stroke-width:1.1}
.dg-node-text{fill:var(--ink);font-size:12.5px}
.dg-group-shape{fill:var(--dg-group);stroke:var(--dg-group-line);stroke-width:1}
.dg-group-text{fill:var(--muted);font-size:12.5px;font-weight:560}
.dg-edge-line{fill:none;stroke:var(--dg-edge);stroke-width:1.3;stroke-linejoin:round}
.dg-edge-hit{fill:none;stroke:transparent;stroke-width:14;stroke-linejoin:round;cursor:pointer}
.dg-edge-text{fill:var(--dg-edge-text);font-size:11.5px}
/* arrowheads are drawn into the edge's own group, not shared <marker>s, so one
   rule recolours a head with its line and a cloned diagram carries its own */
.dg-head{fill:var(--dg-edge);stroke:none}
.dg-head-open{fill:var(--surface);stroke:var(--dg-edge);stroke-width:1.4}
/* the plate under a label: the label owns its own space, so this only has to
   survive the odd arc that ELK routes through the reserved band */
.dg-label-plate{fill:var(--surface);fill-opacity:.95}
/* the tie between a label and its arc: a hairline to a dot sitting on the arc
   itself, which is what makes "which arrow is this text on" a fact, not a guess */
.dg-tie{stroke:#c3c9d4;stroke-width:1}
.dg-tie-dot{fill:var(--dg-edge)}
.dg-label{cursor:pointer}

/* hover states: two tiers, both fully lit - see .is-near below */
.dg-el{transition:opacity .12s ease}
svg.dg.has-hot .dg-el{opacity:.14}
svg.dg .dg-el.is-hot,svg.dg .dg-el.is-near{opacity:1}
.dg-el.is-hot .dg-edge-line{stroke:var(--dg-hot);stroke-width:2}
.dg-el.is-hot .dg-tie{stroke:var(--dg-hot)}
.dg-el.is-hot .dg-tie-dot{fill:var(--dg-hot)}
.dg-el.is-hot .dg-edge-text{fill:var(--dg-hot);font-weight:560}
.dg-el.is-hot .dg-label-plate{fill:var(--dg-hot-soft);fill-opacity:1}
.dg-el.is-hot .dg-node-shape{stroke:var(--dg-hot);stroke-width:2;fill:var(--dg-hot-soft)}
.dg-el.is-hot .dg-head{fill:var(--dg-hot)}
.dg-el.is-hot .dg-head-open{fill:var(--surface);stroke:var(--dg-hot)}
/* the box at the far end of a lit arrow: lit too - "where does this go" is the
   question being asked - but left unfilled, so which box the pointer is on stays
   obvious. Both tiers are fully opaque; only the untouched rest fades. */
.dg-el.is-near .dg-node-shape{stroke:var(--dg-hot);stroke-width:1.5}

/* ---- entities ----
   The reason ER gets the same treatment as flowcharts: mermaid draws an entity
   as a stack of text, so nothing lines up and every row has to be read in full.
   Here it is a table - the type column, the name column, and the keys pinned
   right - which is what lets the eye scan one column instead of all of them. */
.dg-er-head{fill:var(--dg-er-head);stroke:none;pointer-events:none}
.dg-er-rule{stroke:var(--dg-node-line);stroke-width:1}
.dg-er-sep{stroke:var(--dg-er-line);stroke-width:.8}
.dg-er-title{fill:var(--ink);font-size:13px;font-weight:600;letter-spacing:-.004em}
.dg-er-type{fill:var(--muted);font-size:11.6px}
.dg-er-name{fill:var(--ink);font-size:11.6px}
.dg-er-comment{fill:var(--faint);font-size:11.6px;font-style:italic}
.dg-er-badge{fill:var(--dg-er-badge);stroke:var(--dg-er-badge-line);stroke-width:.8}
.dg-er-badge.is-pk{fill:var(--dg-er-badge-pk);stroke:var(--dg-er-badge-pk-line)}
.dg-er-key{fill:var(--dg-er-badge-ink);font-size:9.4px;font-weight:600;letter-spacing:.02em}
/* on a wide entity the band is what keeps the eye on one row while it travels
   from the type on the left across to the keys on the right */
.dg-er-band{fill:transparent;transition:fill .12s ease}
.dg-er-row:hover .dg-er-band{fill:var(--dg-er-hover)}

/* crow's feet: line-drawn like the arrowheads, and lit by the same rules, so a
   relationship and both of its cardinalities light as one thing */
.dg-card-line{fill:none;stroke:var(--dg-edge);stroke-width:1.3;stroke-linecap:round}
.dg-card-ring{fill:var(--surface);stroke:var(--dg-edge);stroke-width:1.3}
.dg-card-dot{fill:var(--dg-edge);stroke:none}
.dg-el.is-hot .dg-card-line{stroke:var(--dg-hot);stroke-width:1.8}
.dg-el.is-hot .dg-card-ring{stroke:var(--dg-hot);stroke-width:1.8}
.dg-el.is-hot .dg-card-dot{fill:var(--dg-hot)}
.dg-el.is-hot .dg-er-head{fill:var(--dg-er-head-hot)}

/* the button in an entity's header that opens it to every column, and closes it */
.dg-er-more{cursor:pointer}
.dg-er-more-box{fill:var(--surface);stroke:var(--dg-node-line);stroke-width:1;transition:fill .12s,stroke .12s}
.dg-er-more-icon{fill:none;stroke:var(--muted);stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}
.dg-er-more:hover .dg-er-more-box{fill:var(--dg-hot-soft);stroke:var(--dg-hot)}
.dg-er-more:hover .dg-er-more-icon{stroke:var(--dg-hot)}
.dg-er-more.is-open .dg-er-more-box{fill:var(--dg-er-badge-pk);stroke:var(--dg-er-badge-pk-line)}
.dg-er-more.is-open .dg-er-more-icon{stroke:var(--ink)}
.dg-er-more.is-open:hover .dg-er-more-box{fill:var(--dg-hot-soft);stroke:var(--dg-hot)}

/* ---- an opened entity ----
   The same table with every column a schema document writes down, and the
   notes above it - in the faces and weights of the compact table, so opening
   an entity adds columns without changing how the ones already there read.
   The sizes here are the ones the layout measures with: change them together. */
.dg-er-x-label{fill:var(--faint);font-size:9.2px;font-weight:620;letter-spacing:.07em}
.dg-er-x-name{font-weight:560}
.dg-er-x-code{font-family:var(--mono);font-size:10.8px;fill:#3a4150}
.dg-er-x-bold{font-weight:620}
.dg-er-note,.dg-er-desc{fill:#3a4150;font-size:11.6px}
.dg-er-bullet{fill:var(--faint)}
.dg-er-ref{fill:var(--muted);font-size:10.6px}
/* text.dg-er-def, to outweigh svg.dg text, which sets the family of every label */
svg.dg text.dg-er-def{fill:#3a4150;font-family:var(--mono);font-size:10.8px}
.dg-er-none{fill:var(--faint);font-size:11px}
.dg-er-notnull{fill:var(--faint);font-size:9.4px;font-weight:600;letter-spacing:.02em}
.dg-er-null{fill:var(--dg-seq-note);stroke:var(--dg-seq-note-line);stroke-width:.8}
.dg-er-null-text{fill:var(--dg-seq-note-ink);font-size:9.4px;font-weight:600;letter-spacing:.02em}
/* laid out again around it: the entities glide (inline transitions), and the
   relationships fade back in once their new routes are drawn */
.dg-reflow .dg-edges,.dg-reflow .dg-labels{animation:dg-fade-in .3s ease-out .18s both}
.dg-er-opening{animation:dg-fade-in .24s ease-out both}
@keyframes dg-fade-in{from{opacity:0}}
/* what an entity is for, shown while the pointer is on it */
.dg-tip{position:fixed;z-index:70;max-width:min(440px,calc(100vw - 16px));padding:9px 12px;text-align:left;
  font-size:12.5px;line-height:1.5;color:#e9ecf2;background:var(--ink);border-radius:9px;pointer-events:none;
  box-shadow:0 12px 32px -12px rgba(20,26,40,.5);animation:dg-fade-in .12s ease-out}
.dg-tip p{margin:0}
.dg-tip p+p{margin-top:6px}
.dg-tip code{font-family:var(--mono);font-size:.88em;background:rgba(255,255,255,.13);border-radius:4px;padding:.05em .3em}
@media print{.dg-er-more,.dg-tip{display:none}}

/* ---- sequences ----
   Participants are nodes and messages are edges, so hovering and pinning run
   on the rules above; what follows is only what a sequence adds. Frames, notes
   and participant boxes are the ground the messages sit on: they fade part of
   the way with the rest, never all the way, so a lit message keeps its context. */
.dg-seq-life{stroke:#d3d8e0;stroke-width:1.1}
.dg-seq-life-hit{stroke:transparent;stroke-width:12;cursor:pointer}
.dg-seq-actor{font-weight:560;letter-spacing:-.004em}
.dg-seq-glyph{fill:none;stroke:var(--muted);stroke-width:1.2}
.dg-seq-bar{fill:var(--dg-group);stroke:var(--dg-node-line);stroke-width:1}
.dg-seq-x{fill:none;stroke:var(--dg-edge);stroke-width:1.7;stroke-linecap:round}
.dg-seq-text{fill:#2f3544}
.dg-head-line{fill:none;stroke:var(--dg-edge);stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}
.dg-seq-num{fill:var(--dg-seq-num);stroke:var(--surface);stroke-width:1.5}
.dg-seq-num-text{fill:#fff;font-size:9.6px;font-weight:620}
.dg-seq-frame{fill:rgba(20,26,38,.018);stroke:#d3d8e0;stroke-width:1}
.dg-seq-split{stroke:#cdd2db;stroke-width:1;stroke-dasharray:5 4}
.dg-seq-tab{fill:var(--dg-er-badge);stroke:#d3d8e0;stroke-width:1}
.dg-seq-kw{fill:var(--dg-er-badge-ink);font-size:9.4px;font-weight:620;letter-spacing:.05em}
.dg-seq-cond{fill:var(--muted);font-size:11.5px}
.dg-seq-rect{fill:var(--dg-group);fill-opacity:.8}
.dg-seq-note{fill:var(--dg-seq-note);stroke:var(--dg-seq-note-line);stroke-width:1}
.dg-seq-note-text{fill:var(--dg-seq-note-ink);font-size:11.5px}
.dg-seq-box{fill:var(--dg-group);stroke:var(--dg-group-line);stroke-width:1}
.dg-seq-box-text{fill:var(--muted);font-size:12px;font-weight:560}
.dg-seq-title{fill:var(--ink);font-size:14px;font-weight:620}
.dg-seq-boxes,.dg-seq-frames,.dg-seq-notes,.dg-seq-marks{transition:opacity .12s ease}
svg.dg.has-hot .dg-seq-boxes,svg.dg.has-hot .dg-seq-frames,
svg.dg.has-hot .dg-seq-notes,svg.dg.has-hot .dg-seq-marks{opacity:.4}
.dg-el.is-hot .dg-seq-life{stroke:var(--dg-hot);stroke-width:1.6}
.dg-el.is-near .dg-seq-life{stroke:var(--dg-hot);stroke-opacity:.5}
.dg-el.is-hot .dg-seq-bar{stroke:var(--dg-hot)}
.dg-el.is-hot .dg-seq-x{stroke:var(--dg-hot)}
.dg-el.is-hot .dg-head-line{stroke:var(--dg-hot)}
.dg-el.is-hot .dg-seq-num{fill:var(--dg-hot)}
.dg-el.is-hot .dg-seq-text{fill:var(--dg-hot)}
/* the participant row that rides along the top of a long sequence */
.dg-float{position:absolute;left:0;right:0;top:0;z-index:3;pointer-events:none;opacity:0;visibility:hidden;
  background:rgba(255,255,255,.93);backdrop-filter:blur(6px);border-bottom:1px solid var(--line);
  box-shadow:0 8px 16px -14px rgba(20,26,40,.35);transition:opacity .15s ease,visibility .15s}
.dg-float.on{opacity:1;visibility:visible}
.dg-float svg.dg{position:absolute;top:0;margin:0;max-width:none}
.dg-float.on .dg-node{pointer-events:auto;cursor:pointer}

@media print{svg.dg.has-hot .dg-el{opacity:1}
  svg.dg.has-hot .dg-seq-boxes,svg.dg.has-hot .dg-seq-frames,
  svg.dg.has-hot .dg-seq-notes,svg.dg.has-hot .dg-seq-marks{opacity:1}
  .dg-float{display:none}}
`;

export const CSS_LIGHTBOX = `
.lightbox{position:fixed;inset:0;z-index:50;display:none;background:rgba(233,235,239,.94);
  backdrop-filter:blur(8px);cursor:grab}
.lightbox.on{display:block}
.lightbox.drag{cursor:grabbing}
.lightbox-stage{position:absolute;top:50%;left:50%;transform-origin:center;will-change:transform}
.lightbox-stage svg{max-width:none}
.lightbox-bar{position:absolute;top:16px;right:18px;display:flex;gap:6px;align-items:center;
  font-size:11.5px;color:var(--muted)}
.lightbox-bar button{padding:4px 10px;font:inherit;font-size:12px;background:var(--surface);
  border:1px solid var(--line);border-radius:8px;color:var(--ink);cursor:pointer}
.lightbox-bar button:hover{background:var(--surface-2)}
`;

export const CSS_CMT = `
/* ---- comments: sidebar footer ---- */
.side-foot{display:flex;padding:10px 12px;border-top:1px solid var(--line)}
.cmt-tog{flex:1;display:flex;align-items:center;gap:8px;padding:6px 9px;border:1px solid transparent;
  border-radius:8px;background:none;color:var(--muted);font:inherit;font-size:12.5px;cursor:pointer;
  white-space:nowrap;overflow:hidden;transition:background .15s,color .15s,border-color .15s}
.cmt-tog:hover{background:var(--hover);color:var(--ink);border-color:var(--line)}
.cmt-tog .cmt-lbl{flex:1;text-align:left}
.cmt-tog.off{opacity:.45}
.cmt-n{padding:1px 7px;border-radius:20px;background:var(--surface-2);border:1px solid var(--line);
  font-size:11px;font-variant-numeric:tabular-nums;color:var(--muted)}

/* ---- comments: highlight + margin cards ----
   A highlight and its card are two views of one comment, so hovering either
   lights both (.hot); clicking either pins the pair (.on). */
.body-wrap{position:relative}
.cmt-hl{background:#fbeeb4;box-shadow:inset 0 -1px 0 #dcbf55;border-radius:3px;padding:0 1px;
  color:inherit;cursor:pointer;transition:background .12s,box-shadow .12s}
.cmt-hl.hot{background:#f7e496;box-shadow:inset 0 -1px 0 #c9a227}
.cmt-hl.on{background:#f3d977;box-shadow:inset 0 -1px 0 #b8931f}
.cmt-layer{position:absolute;inset:0;pointer-events:none;z-index:2}
.cmt-card{position:absolute;left:0;top:0;width:var(--cmt-w,264px);pointer-events:auto;padding:10px 12px;
  background:var(--surface);border:1px solid var(--line);border-radius:10px;cursor:pointer;
  font-size:12.5px;line-height:1.55;transition:border-color .15s ease,box-shadow .15s ease}
.cmt-card.hot{border-color:#dcbf55;box-shadow:0 3px 12px rgba(20,26,40,.10)}
.cmt-card.on{border-color:#c9a227;box-shadow:0 4px 16px rgba(20,26,40,.14)}
.cmt-card[hidden]{display:none!important}
.cmt-face{display:none}
.cmt-quote{margin:0 0 7px;padding-left:9px;border-left:2px solid #dcbf55;color:var(--muted);
  font-size:11.5px;line-height:1.45;overflow:hidden;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.cmt-text{white-space:pre-wrap;overflow-wrap:anywhere}
.cmt-foot{margin-top:9px;display:flex;align-items:center;gap:9px;font-size:11px;color:var(--faint)}
.cmt-when{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cmt-act{padding:0;border:0;background:none;color:var(--muted);font:inherit;font-size:11px;
  cursor:pointer;border-bottom:1px solid transparent}
.cmt-act:hover{color:var(--ink);border-bottom-color:var(--ink)}
.cmt-lost{margin:0 0 5px;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#a8791f}

/* tight gutters: the card shrinks to a numbered dot, opened as a popover */
.cmt-layer.dots .cmt-card{width:22px;height:22px;padding:0;border-radius:50%;
  background:#fbeeb4;border-color:#dcbf55;display:grid;place-items:center;overflow:hidden}
.cmt-layer.dots .cmt-card.hot,.cmt-layer.dots .cmt-card.on{background:#f3d977;border-color:#c9a227}
.cmt-layer.dots .cmt-full{display:none}
.cmt-layer.dots .cmt-face{display:block;font-size:11px;font-weight:var(--bold);color:#7d6316;
  font-variant-numeric:tabular-nums}

/* ---- comments: floating bits ---- */
.cmt-add{position:fixed;z-index:9;padding:5px 11px;background:var(--ink);color:#fff;border:0;
  border-radius:8px;font:inherit;font-size:12px;cursor:pointer;box-shadow:0 3px 12px rgba(20,26,40,.22)}
.cmt-add:hover{background:#2a3040}
.cmt-pop{position:fixed;z-index:9;width:290px;max-width:calc(100vw - 24px);padding:12px;
  background:var(--surface);border:1px solid var(--line);border-radius:12px;font-size:12.5px;
  line-height:1.55;box-shadow:0 10px 34px rgba(20,26,40,.18)}
.cmt-pop textarea{display:block;width:100%;min-height:80px;margin:0 0 9px;padding:8px 9px;
  border:1px solid var(--line);border-radius:8px;background:var(--surface-2);color:var(--ink);
  font:inherit;font-size:12.5px;line-height:1.55;resize:vertical;outline:none}
.cmt-pop textarea:focus{border-color:#b6bdc9;background:var(--surface)}
.cmt-row{display:flex;align-items:center;gap:8px}
.cmt-row .cmt-spacer{flex:1}
.cmt-btn{padding:5px 11px;border:1px solid var(--line);border-radius:8px;background:var(--surface-2);
  color:var(--ink);font:inherit;font-size:12px;cursor:pointer;transition:.15s}
.cmt-btn:hover{background:var(--hover);border-color:#c3c9d4}
.cmt-btn.go{background:var(--ink);border-color:var(--ink);color:#fff}
.cmt-btn.go:hover{background:#2a3040}
.cmt-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:10;padding:8px 14px;
  background:var(--ink);color:#fff;border-radius:9px;font-size:12.5px;
  box-shadow:0 6px 22px rgba(20,26,40,.25)}
@media print{.cmt-layer,.cmt-add,.cmt-pop,.cmt-toast,.side-foot{display:none}}
`;

/* ---- settings ----
   A panel, not a modal: it sits over the corner of the page and leaves the
   rest of it in view, so a change is seen on the documents as it is made. */
export const CSS_SETTINGS = `
.settings{position:fixed;z-index:40;top:14px;left:calc(var(--rail) + 14px);width:300px;
  max-width:calc(100vw - 28px);padding:12px 14px;background:var(--surface);border:1px solid var(--line);
  border-radius:12px;box-shadow:0 18px 48px -18px rgba(20,26,40,.35);font-size:13px;line-height:1.45}
.settings[hidden]{display:none}
.settings-head{display:flex;align-items:center;justify-content:space-between;margin:-4px -6px 8px 0}
.settings-head b{font-size:13.5px;font-weight:var(--bold);letter-spacing:-.012em}
.settings-row{padding:10px 0 12px;border-top:1px solid var(--line)}
.settings-label{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:6px}
.settings-label label{font-weight:var(--semi)}
.settings-val{font-variant-numeric:tabular-nums;color:var(--muted)}
.settings input[type=range]{display:block;width:100%;margin:0;accent-color:var(--ink);cursor:pointer}
.settings-hint{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-top:6px;
  font-size:11.5px;color:var(--faint)}
.settings-link{padding:0;border:0;border-bottom:1px solid var(--line);background:none;font:inherit;
  color:var(--muted);cursor:pointer}
.settings-link:hover{color:var(--ink);border-bottom-color:var(--ink)}
.settings-link:disabled{color:var(--faint);border-bottom-color:transparent;cursor:default}
.settings-foot{padding-top:9px;border-top:1px solid var(--line);font-size:11.5px;color:var(--muted)}
.settings-foot.bad{color:#9b2c2c}
.settings-foot code{font-family:var(--mono);font-size:.92em}
@media (max-width:820px){.settings{left:14px}}
@media print{.settings{display:none}}
`;

export const allCss = () => CSS + CSS_MAIN + CSS_BAR + CSS_DIAGRAM + CSS_LIGHTBOX + CSS_CMT + CSS_SETTINGS;
