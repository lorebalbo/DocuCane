// page.mjs - the HTML shell the built dashboard lives in.

import { allCss } from './client/css.mjs';
import { APP_JS } from './client/app.mjs';
import { DIAGRAMS_JS } from './client/diagrams.mjs';

const escAttr = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderPage({ cfg, docs, fontCss, mermaidTag, elkTag, stamp }) {
  const runtime = {
    title: cfg.title,
    ns: cfg.ns,
    engine: cfg.diagrams.engine,
    nodeTextWidth: cfg.diagrams.nodeTextWidth,
    edgeTextWidth: cfg.diagrams.edgeTextWidth,
    comments: cfg.comments !== false,
  };

  const data = JSON.stringify({ docs }).replace(/</g, '\\u003c');
  const count = docs.length + (docs.length === 1 ? ' document' : ' documents') + '  ·  ' + stamp;

  const script = (src) => src ? '<script src="' + escAttr(src) + '"><\/script>' : '';

  const searchBox = cfg.search === false ? '' : `
    <div class="search">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/>
      </svg>
      <input id="search" type="search" placeholder="Search documents" spellcheck="false" autocomplete="off">
    </div>`;

  const commentFoot = cfg.comments === false ? '' : `
    <div class="side-foot">
      <button class="cmt-tog" id="cmt-tog" type="button" title="Show or hide comments">
        <span class="cmt-lbl">Comments</span><span class="cmt-n" id="cmt-n">0</span>
      </button>
    </div>`;

  const commentBits = cfg.comments === false ? '' : `
<button class="cmt-add" id="cmt-add" type="button" hidden>Comment</button>
<div class="cmt-pop" id="cmt-pop" hidden></div>
<div class="cmt-toast" id="cmt-toast" hidden></div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escAttr(cfg.title)}</title>
<style>${fontCss}${allCss()}</style>
</head>
<body>
<div class="layout" id="layout">
  <aside class="side">
    <div class="side-top">
      <div class="brand">
        <div class="brand-row">
          <span class="brand-name">${escAttr(cfg.title)}</span>
          <button class="icon-btn" id="toggle" type="button" title="Toggle sidebar  [">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
              <rect x="1.5" y="2.5" width="13" height="11" rx="2.5"/><path d="M6 2.5v11"/>
            </svg>
          </button>
        </div>
        <small>${escAttr(count)}</small>
      </div>
    </div>${searchBox}
    <nav class="nav" id="nav"></nav>${commentFoot}
  </aside>
  <div class="main">
    <div class="topbar" id="topbar"><div class="topbar-in"><b id="topbar-title"></b></div></div>
    <div id="main"></div>
  </div>
</div>
${commentBits}
<div class="lightbox" id="lightbox">
  <div class="lightbox-stage" id="lightbox-stage"></div>
  <div class="lightbox-bar">
    <button id="zoom-out" type="button">&minus;</button>
    <span id="zoom-label">100%</span>
    <button id="zoom-in" type="button">+</button>
    <button id="zoom-close" type="button">Close</button>
  </div>
</div>

<script id="doc-data" type="application/json">${data}</script>
<script>window.__DOCUCANE__=${JSON.stringify(runtime).replace(/</g, '\\u003c')};<\/script>
${script(mermaidTag)}
${script(elkTag)}
<script>${DIAGRAMS_JS}<\/script>
<script>${APP_JS}<\/script>
</body>
</html>
`;
}
