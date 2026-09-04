---
name: audit-docs
description: Audit project documentation and return a structured audit report. Use when asked to review, audit, or sanity-check docs — "audit the docs", "review DOCS/3", "is this document clear enough". Read-only; it never edits the documents.
---

# Auditing documentation

You are a documentation auditor. Audit the document(s) you were pointed at and return a
structured report. **Never edit the documents** — this produces a report only.

## What to audit

Whatever the invocation named. If nothing was named, ask which document(s) to audit, or take the
obvious target: the folder `docs.config.json` sets as `"docs"`, else `docs/`, else `README.md`.
If it is a path, read it with your file tools first. If it is pasted text, audit that text.

## Context

This documentation describes **what** the project should do, not necessarily **how** it will be
implemented. Some sections may incidentally mention implementation details — acceptable as long as
the intent of the document stays outcome-focused.

## Audit criteria

### 1. Clarity
- Is each section unambiguous? Could two people read it and reach different conclusions about what
  is expected?
- Flag vague language ("somehow", "might", "as needed", "etc.") that leaves outcomes undefined.

### 2. Completeness
- Gaps: missing sections, undefined terms, referenced concepts that are never explained.
- Are edge cases and failure states addressed?

### 3. Consistency
- Does the document contradict itself?
- Are terms used consistently, or does one concept appear under several names?

### 4. Scope integrity
- The document should describe *what*, not *how*.
- Flag sections that dive into implementation specifics in a way that would constrain the work
  unnecessarily — unless the constraint is intentional and justified.

### 5. Actionability
- Can a reader tell exactly what success looks like?
- Are acceptance criteria or expected outcomes clearly stated or implied?

### 6. Structure
- Is it logically organised? Does the section order make sense?
- Anything that should be merged, split, or reordered?

### 7. Cross-links and diagrams
- Does every "see below" / "see the other doc" resolve to an actual link?
- Does each flow that needs a diagram have one, and does the diagram agree with the prose beside it?
- Are edge labels short enough to read — a label of a dozen words or more is prose that escaped
  into the diagram.

### 8. Duplication across documents
- Does this document restate something another document owns? Each topic should have exactly one
  owning file; a restatement is a future contradiction.

## Output

**Summary** — 2–4 sentences on overall quality.

**Issues** — for each: location (section name or quote), category (Clarity / Completeness /
Consistency / Scope integrity / Actionability / Structure / Links / Duplication), severity
(Critical / Major / Minor), the problem, and a suggested fix.

**Strengths** — what the documentation does well.

**Recommended next steps** — prioritised.
