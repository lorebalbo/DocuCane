---
description: Render this project's documents into a dashboard and open it in the browser
argument-hint: "[--no-open] [--refresh] [--out <dir>] [--engine clean|mermaid]"
allowed-tools: Bash(npx docucane:*), Bash(node:*)
---

Run the documentation dashboard builder:

```bash
npx docucane $ARGUMENTS
```

It reads the documents folder named in `docs.config.json` (or `docs/`) and writes a single
self-contained page to `.docucane/index.html`, then opens it in the default browser.

Report back briefly:

- how many documents were rendered, and how many carry diagrams
- the output path
- anything the script printed that looks wrong: a document that failed to parse,
  `mermaid: CDN fallback` (the diagram engine could not be cached locally, so the page will need a
  network connection), `elk: unavailable` (flowcharts and ER diagrams will fall back to mermaid's
  layout), or
  `font: system fallback` (Inter could not be fetched, so the page falls back to a system typeface)

Do not edit any document as part of this command — it only renders.

Flags, if asked for:

- `--no-open` build without launching the browser
- `--refresh` re-download the pinned mermaid bundle, the ELK bundle and the Inter woff2
- `--out <dir>` write the dashboard somewhere else
- `--engine mermaid` fall back to mermaid's own layout everywhere
