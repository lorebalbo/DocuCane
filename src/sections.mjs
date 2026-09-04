// sections.mjs
// ------------------------------------------------------------------
// Every heading takes ownership of the blocks that follow it, so the page can
// fold a whole section away and space two of them apart with one rule instead
// of a stack of heading margins. Numbers come from the nesting, not the level:
// a document whose top level is ## still starts at 1.
// ------------------------------------------------------------------

const FOLD_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 6L8 10.5 12.5 6"/></svg>';

const HEAD_RE = /^<h([1-6]) id="([^"]+)">([\s\S]*)<\/h[1-6]>$/;
const ANCHOR_RE = /^<a class="h-anchor"[^>]*>#<\/a>/;
export const SECNUM_RE = /^(\d+(?:\.\d+)*)[.)]?\s+(?=\S)/;

export function nestSections(blocks, ctx) {
  // A --- written just above a heading is the author drawing the section break
  // by hand. The section itself draws that rule now, so drop the duplicate.
  blocks = blocks.filter((html, n) =>
    html !== '<hr>' || !(blocks[n + 1] || '').match(HEAD_RE));

  const root = { level: 0, kids: [] };
  const stack = [root];
  for (const html of blocks) {
    const m = html.match(HEAD_RE);
    if (!m) { stack[stack.length - 1].kids.push(html); continue; }
    const level = +m[1];
    while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop();
    const node = { level, id: m[2], inner: m[3], kids: [] };
    stack[stack.length - 1].kids.push(node);
    stack.push(node);
  }
  return emitSections(root, [], ctx);
}

function emitSections(node, prefix, ctx) {
  let n = 0;
  return node.kids.map((kid) => {
    if (typeof kid === 'string') return kid;
    n++;
    const anchor = (kid.inner.match(ANCHOR_RE) || [''])[0];
    let text = kid.inner.slice(anchor.length);

    // A heading that numbers itself keeps its own number: the prose around it
    // says things like "the diagram in 1.2", and a second number invented here
    // would both duplicate it and contradict the cross-reference.
    const own = text.match(SECNUM_RE);
    const num = own ? own[1].split('.') : prefix.concat(n);
    const label = num.join('.');
    if (own) text = text.slice(own[0].length);
    ctx.numbers.set(kid.id, label);

    const head = '<h' + kid.level + ' id="' + kid.id + '" class="sec-head">' +
      '<span class="sec-gut">' +
        '<button class="sec-tog" type="button" tabindex="-1" aria-label="Fold section">' + FOLD_SVG + '</button>' +
        '<span class="sec-num">' + label + '</span>' +
      '</span>' +
      '<span class="sec-txt">' + text + '</span>' + anchor +
      '</h' + kid.level + '>';
    return '<section class="sec" data-sec="' + kid.id + '">' + head +
      '<div class="sec-body">' + emitSections(kid, num, ctx) + '</div></section>';
  }).join('\n');
}
