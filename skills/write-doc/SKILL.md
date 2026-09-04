---
name: write-doc
description: Write a new high-level product document for this project's documentation folder. Use when asked to document a feature, flow, or area for a non-technical reader — "write a doc about X", "document the checkout flow", "add a docs page for onboarding".
---

# Writing a document

These are **high-level product documents**: plain-language guides to what a person
experiences, with diagrams anyone can follow. They are not architecture or implementation docs.

Read an existing document in the same folder before writing — match its voice and shape. The
folder is whatever `docs.config.json` sets as `"docs"` (`docs/` if there is no config).

## Rules

1. **Describe the experience, not the code.** What the user sees, taps, and gets back. No file
   names, function names, table names, or libraries in the body. If a technical decision must be
   recorded, put it in an appendix at the very end, clearly marked as direction, not detail.
2. **Plain language.** Short sentences. Define any term the reader might not know; add a
   **Quick glossary** at the end if the doc uses more than a couple.
3. **Diagrams.** Include a Mermaid diagram for every flow, state machine, or set of relationships
   a diagram would make clearer — not just one per doc. See [Diagrams](#diagrams) below.
4. **Tables** for "what exists where" / availability comparisons.
5. **Link every mention.** Any reference to another section, another document, or an open point is
   a link — never a bare "see below" or "see the other doc". Same-doc:
   `[the pipeline](#the-shape-of-the-flow)`. Other doc: `[CATALOG](./2.%20CATALOG.md)`. Open point:
   `[open point](#op-1)`.
6. **Open points, only if there are any.** A `## Points to evaluate (open considerations)` section
   at the very bottom, before any appendix. Numbered list, each item anchored with
   `<a id="op-N"></a>` and starting with a bold one-line title, then what's undecided and the
   arguments each way. State the baseline behaviour until it's settled. These are questions, not
   decisions — anything settled belongs in the body.

## Diagrams

Prefer `flowchart TD`; use whatever Mermaid type fits (sequence, state, ER). Label nodes with what
the *user* does or sees, quote every label, and use `<br/>` for line breaks. A reader with no
technical background must be able to follow it.

The dashboard re-lays flowcharts out with ELK, which routes edges at right angles and reserves
space for every edge label, so a dense chart stays readable without hand-tuning. Two things still
help it:

- **Name the transition, not the mechanism.** `-->|"tap Save"|` reads; `-->|"POST /songs"|` does not.
- **Keep an edge label short.** One short phrase, or two lines split with `<br/>`. A label longer
  than a dozen words is prose that escaped into the diagram — move it to the paragraph above.

Do not hand-place nodes, add `linkStyle`, or otherwise fight the layout: the dashboard lays the
chart out itself, and those directives only affect the mermaid fallback.

## Shape

```markdown
# TITLE IN CAPS

> A plain-language guide to <what this covers>. It describes *what the user experiences*
> at each step, not how the code works. Each flow includes a diagram you can follow
> without any technical background.

---

## <Orienting section — the mental model, the two or three ideas to keep separate>

## <What exists where — a comparison table, if relevant>

## 1. <First flow>
   Prose, then a ```mermaid block.

## 2. <Next flow>
...

## Quick glossary   (if needed)

## Points to evaluate (open considerations)   (if any)

## Appendix — implementation direction   (only if a decision must be recorded)
```

## Filing

- Name: `<n>. TITLE-IN-CAPS.md` in the documents folder, `<n>` being the next free number.
  The number drives the order in the sidebar; a document without one sorts after the numbered ones.
- Sub-folders become their own group in the sidebar, named after the folder — put audits, reviews,
  and other second-class material in one rather than in the main run.
- Sections separated by `---`. Wrap prose at ~100 columns.
- After writing, check whether the document settled anything about the product; if so update the
  project's context document (usually `0. CONTEXT.md` or `0. ABOUT.md`).
