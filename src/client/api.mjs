// api.mjs - the API call blocks, inlined into the page.
//
// A call is a box whose header - verb and url - is always shown. A click on
// the header opens the body, which says what each part of the url is.
//
// Folded, the box still answers questions: holding Ctrl - Option on a Mac,
// the same key the ER diagrams use - with the pointer on a described part of
// the url shows that part's description, without opening anything. Open, the
// descriptions are already on screen, so the key does nothing.

export const API_JS = String.raw`
(function(){
  var IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  var TIP_KEY = IS_MAC ? 'Alt' : 'Control';
  function keyHeld(e){ return IS_MAC ? e.altKey : e.ctrlKey; }

  function setOpen(box, open){
    box.classList.toggle('is-open', open);
    var head = box.querySelector('.api-head');
    if (head && head.hasAttribute('aria-expanded')) head.setAttribute('aria-expanded', open ? 'true' : 'false');
    hideTip();
  }

  document.addEventListener('click', function(e){
    var head = e.target.closest && e.target.closest('.api-head[role=button]');
    if (!head) return;
    // a selection being made for a comment is not a click on the header
    var sel = window.getSelection && window.getSelection();
    if (sel && !sel.isCollapsed && head.contains(sel.anchorNode)) return;
    var box = head.closest('.api');
    setOpen(box, !box.classList.contains('is-open'));
  });
  document.addEventListener('keydown', function(e){
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var head = e.target.closest && e.target.closest('.api-head[role=button]');
    if (!head) return;
    e.preventDefault();
    var box = head.closest('.api');
    setOpen(box, !box.classList.contains('is-open'));
  });

  /* ------------------------------------------------- a part's row */

  function rowOf(part){
    var box = part.closest('.api');
    return box && box.querySelector('.api-row[data-part="' + part.getAttribute('data-part') + '"]');
  }

  /* ------------------------------------------ what a part is, on request */

  var tip = null, tipFor = null, lastPointer = null;

  function target(el){
    var part = el && el.closest && el.closest('.api-part');
    return part && !part.closest('.api').classList.contains('is-open') ? part : null;
  }

  function showTip(part){
    if (tipFor === part) return;
    hideTip();
    var row = rowOf(part);
    if (!row) return;
    tipFor = part;
    part.classList.add('is-asked');
    tip = document.createElement('div');
    tip.className = 'dg-tip api-tip';
    tip.innerHTML = '<div class="api-tip-key">' + row.querySelector('dt').innerHTML + '</div>' +
      row.querySelector('dd').innerHTML;
    document.body.appendChild(tip);
    var box = part.getBoundingClientRect();
    var vw = document.documentElement.clientWidth, w = tip.offsetWidth, h = tip.offsetHeight;
    var top = box.top - h - 8;
    if (top < 8) top = box.bottom + 8;
    tip.style.left = Math.round(Math.min(Math.max(8, box.left - 12), vw - w - 8)) + 'px';
    tip.style.top = Math.round(top) + 'px';
  }
  function hideTip(){
    if (tipFor) tipFor.classList.remove('is-asked');
    tipFor = null;
    if (tip){ tip.remove(); tip = null; }
  }

  document.addEventListener('mousemove', function(e){
    lastPointer = { x: e.clientX, y: e.clientY };
    var t = keyHeld(e) ? target(e.target) : null;
    if (t) showTip(t); else if (tip) hideTip();
  }, { passive: true });

  document.addEventListener('keydown', function(e){
    if (e.key === TIP_KEY) document.documentElement.classList.add('api-asking');
    if (e.key !== TIP_KEY || e.repeat || !lastPointer) return;
    var t = target(document.elementFromPoint(lastPointer.x, lastPointer.y));
    if (t) showTip(t);
  });
  function letGo(){ document.documentElement.classList.remove('api-asking'); hideTip(); }
  document.addEventListener('keyup', function(e){ if (e.key === TIP_KEY) letGo(); });
  addEventListener('blur', letGo);
  addEventListener('scroll', hideTip, { passive: true });
  document.addEventListener('wheel', hideTip, { passive: true });
  document.addEventListener('mousedown', hideTip, true);
})();
`;
