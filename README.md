# DocuCane

Render a folder of Markdown into **one self-contained HTML page** you can open by
double-clicking it — and get flowcharts that stay readable when they get dense.

No server. No dependencies. No build pipeline. One file you can email.

```bash
npx docucane ./docs          # render a folder, no configuration
npx docucane init            # or wire a project up properly, once
```

---

## Why

A folder of Markdown is the cheapest place to keep documentation. It is not a pleasant place to
*read* it: you land in a file tree, open files one at a time, lose the thread between them, and get
a static picture where you wanted a diagram you could actually inspect.

DocuCane is the reading half. It changes nothing in your folder and writes one page next to it.

### The diagram problem, specifically

Mermaid is an excellent way to *write* a diagram and a poor way to *read* a dense one. Its default
layout routes edges as free curves and drops each edge label at the middle of its edge with nothing
reserving space for it. Past a dozen or so transitions, labels land on top of each other and on top
of other arcs — and **you can no longer tell which text belongs to which arrow.** At that point the
diagram has stopped working.

DocuCane sends flowcharts — and only flowcharts — down a different path:

| | Mermaid's default | DocuCane |
|---|---|---|
| Edge routing | free curves | **orthogonal** — straight runs, right-angle bends, shared lanes |
| Edge labels | placed afterwards at the midpoint | **reserved space in the layout** — nothing lands on a label, no label lands on a stranger's arc |
| Crossings | a side effect | a minimisation objective |
| Ambiguity | yours to squint at | each label **tied to its arc** by a hairline ending in a dot on that arc |
| Dense charts | unreadable | **hover to isolate** an arrow or a box, click to pin |

Mermaid still does the parsing, so every bit of flowchart syntax it understands keeps working and
there is no second dialect to learn. [ELK](https://eclipse.dev/elk/)'s layered algorithm does the
layout; DocuCane draws the result and makes it interrogable.

Everything that is not a flowchart — sequence, ER, state, class, gantt, pie — renders through
mermaid as before, and mermaid is also the fallback if anything goes wrong. Every diagram carries a
button to switch between the two, so the comparison is always one click away.

## What you get

- **One file.** `index.html` plus a `vendor/` folder. The font travels inside the page; the diagram
  engines sit beside it. Works from `file://`, offline, on a plane.
- **A sidebar** of every document, grouped, ordered by the number in the filename (`10.` after `9.`,
  as you meant it).
- **Foldable sections.** Every heading owns what follows it. What you fold is remembered.
- **Links that work in both places.** `[Diagrams](./2.%20DIAGRAMS.md#why-elk)` becomes in-page
  navigation here and still resolves on GitHub — the anchors are GitHub's.
- **Diagrams you can inspect.** Hover to isolate, click to pin, expand to full size, drag and zoom.
- **Margin comments** for reading a draft (stored in your browser, not in the repo).
- **Search**, a section rail, previous/next, a top bar, and print styles that drop the interface.

## Configuration

None is required. When you want it, `docs.config.json` at the project root:

```json
{
  "title": "Acme Docs",
  "docs": "documentation",
  "out": ".docucane",
  "diagrams": { "engine": "clean" }
}
```

Every setting, and the full command line, is in [docs/3. CONFIGURATION.md](./docs/3.%20CONFIGURATION.md).

## For agents

`npx docucane init` also installs, into the project's `.claude/`:

| | |
|---|---|
| `commands/docs.md` | `/docs` — render the dashboard and open it |
| `skills/write-doc/` | how to write a document in this house style, including what makes a good diagram |
| `skills/audit-docs/` | a read-only structured audit of the documents |

So an agent working in that repository knows both how to write a document and how to render the
result.

## Documentation

The `docs/` folder is DocuCane's own documentation, and rendering it is the quickest way to see
what the tool does:

```bash
git clone git@github.com:lorebalbo/DocuCane.git
cd DocuCane
node bin/docucane.mjs
```

- [0. ABOUT](./docs/0.%20ABOUT.md) — what it is for, and what it is not for
- [1. WRITING](./docs/1.%20WRITING.md) — what the builder does with a file
- [2. DIAGRAMS](./docs/2.%20DIAGRAMS.md) — the diagram problem and the fix, with a dense example
- [3. CONFIGURATION](./docs/3.%20CONFIGURATION.md) — every setting and flag
- [4. READING](./docs/4.%20READING.md) — everything the page does for the reader

## Requirements

Node 18 or newer, and a network connection **once** — the first build caches mermaid, ELK and the
Inter font under the output folder. Every build after that is offline.

## Tests

```bash
npm run check
```

Builds a throwaway folder and asserts the page came out whole. No test framework.

## License

MIT
