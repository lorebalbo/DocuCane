// live.mjs - the part of the page only `docucane --watch` serves.
// Listens for rebuilds, fetches the new documents and hands them to the page,
// which patches itself (applyUpdate() in app.mjs). A small pill in the corner says
// what happened: what changed and where, a build that failed and why, or a
// watcher that has gone away. None of this is in the built index.html.

export const LIVE_CSS = `
.live{position:fixed;right:16px;bottom:16px;z-index:12;display:flex;align-items:center;gap:7px;
  max-width:min(520px,calc(100vw - 32px));padding:5px 11px 5px 9px;border:1px solid var(--line);
  border-radius:999px;background:var(--surface);color:var(--muted);font-size:12px;line-height:1.4;
  box-shadow:0 4px 16px rgba(20,26,40,.08);opacity:.72;transition:opacity .2s,border-color .2s,color .2s}
.live:hover,.live.news,.live.bad,.live.off{opacity:1}
.live-dot{flex:none;width:7px;height:7px;border-radius:50%;background:#2f9e62}
.live.off .live-dot{background:var(--faint)}
.live-msg{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.live.go{cursor:pointer}
.live.go:hover{color:var(--ink);border-color:#c3c9d4}
.live.news{color:var(--ink)}
.live.bad{align-items:flex-start;border-color:#e3b3b3;border-radius:11px;color:#7d2626}
.live.bad .live-dot{margin-top:5px;background:#d04545}
.live.bad .live-msg{white-space:pre-wrap;font-family:var(--mono);font-size:11.5px}
.dc-changed{animation:dc-changed 2.6s ease-out 1}
@keyframes dc-changed{
  0%,30%{background-color:rgba(255,196,56,.28);box-shadow:0 0 0 4px rgba(255,196,56,.28)}
  100%{background-color:rgba(255,196,56,0);box-shadow:0 0 0 4px rgba(255,196,56,0)}}
.diagram.dc-redraw .diagram-out{opacity:.45;transition:opacity .2s}
@media print{.live{display:none}}
`;

export const LIVE_JS = String.raw`
(function(){
  var LIVE = window.__DOCUCANE_LIVE__ || {};
  var app = window.__docucane;
  var version = LIVE.version, shell = LIVE.shell;

  /* ---------------- the pill ---------------- */

  var pill = document.createElement('div');
  pill.className = 'live';
  pill.innerHTML = '<span class="live-dot"></span><span class="live-msg"></span>';
  document.body.appendChild(pill);
  var msg = pill.querySelector('.live-msg');
  var action = null, calm = 0, failing = false, down = false;

  function say(text, cls, onClick, ms){
    pill.className = 'live' + (cls ? ' ' + cls : '') + (onClick ? ' go' : '');
    msg.textContent = text;
    pill.title = onClick ? 'Show me' : (cls === 'bad' ? '' : 'Rebuilt on every save');
    action = onClick || null;
    clearTimeout(calm);
    if (ms) calm = setTimeout(idle, ms);
  }
  function idle(){ say('Live', '', null, 0); }
  idle();

  pill.addEventListener('click', function(){
    if (!action) return;
    var go = action;
    idle();
    go();
  });

  // a block marked as changed loses the mark once it has faded, so the next
  // edit to the same block can flash again
  document.addEventListener('animationend', function(e){
    if (e.animationName === 'dc-changed') e.target.classList.remove('dc-changed');
  });

  /* ---------------- pulling ---------------- */

  var pulling = false, again = false;

  function pull(){
    if (pulling){ again = true; return; }
    pulling = true;
    fetch('/__docucane/data.json', { cache: 'no-store' }).then(function(r){
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function(data){
      if (!app) return location.reload();
      version = data.version;
      tell(app.apply(data.docs, data.count));
    }).catch(function(err){
      say('Could not load the update: ' + (err && err.message || err), 'bad', null, 0);
    }).then(function(){
      pulling = false;
      if (again){ again = false; pull(); }
    });
  }

  function plural(n, one){ return n + ' ' + one + (n === 1 ? '' : 's'); }

  function tell(r){
    if (!r || failing) return;
    if (r.moved) return say('Renamed or removed — now showing ' + titleOf(r.current), 'news', null, 5000);
    var here = r.changed.indexOf(r.current) >= 0;
    var others = r.changed.filter(function(id){ return id !== r.current; });
    if (here && r.first){
      var first = r.first;
      return say('Updated · ' + plural(r.count, 'change') + ' ↓', 'news', function(){ app.bring(first); }, 6000);
    }
    if (others.length === 1){
      var id = others[0];
      return say('Updated: ' + titleOf(id) + ' →', 'news', function(){ location.hash = '#/' + id; }, 6000);
    }
    if (others.length) return say(plural(others.length, 'document') + ' updated', 'news', null, 4000);
    if (r.removed.length) return say(plural(r.removed.length, 'document') + ' removed', 'news', null, 4000);
    if (here) return say('Updated', 'news', null, 2500);
  }

  function titleOf(id){ var d = app && app.doc(id); return d ? d.title : id; }

  /* ---------------- listening ---------------- */

  if (!window.EventSource) return say('Live updates need a newer browser', 'off', null, 0);

  var es = new EventSource('/__docucane/events');
  es.addEventListener('state', function(e){
    var s;
    try { s = JSON.parse(e.data); } catch (x) { return; }
    if (s.shell !== shell) return location.reload();
    if (s.error){
      failing = true;
      say('Build failed — the page shows the last good version.\n' + s.error, 'bad', null, 0);
    } else if (failing || down){
      failing = false;
      idle();
    }
    down = false;
    if (s.version !== version) pull();
  });
  es.onerror = function(){
    if (es.readyState === EventSource.CLOSED) return say('Live updates stopped — reload the page', 'off', null, 0);
    down = true;
    say('Disconnected — is docucane --watch still running?', 'off', null, 0);
  };
})();
`;
