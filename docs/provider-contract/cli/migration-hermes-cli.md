# hermes-cli → declarative migration audit

**Source manifest:** `cli/hermes-cli/provider.json`
**Source scripts:** `cli/hermes-cli/scripts/1.0/` (~3K LOC, including the 600-LOC `terminal_tokenizer.js`)
**Target tier:** **`extended-legacy`** — intentional. Hermes is **not** migrating to declarative in Phase 2. The manifest stays as-is; the existing scripts/1.0 path remains the canonical implementation.

This document records the decision so future contributors don't waste a sprint re-litigating it.

## Decision: do not migrate. Keep extended-legacy.

Audit performed 2026-06-03 against the v1.0.0 primitive catalog.

### What terminal_tokenizer does

`scripts/1.0/terminal_tokenizer.js` (600 LOC) implements a stateful per-frame normaliser that:

1. Recognises **box-drawing structural boundaries** (`╭─…╮`, `╰─`, `┊`) and the assistant prose nested inside them (`parse_output.js:546-659` `inAssistantBox` state machine).
2. Detects **soft-wrapped activity rows** whose label exceeds the terminal width and is continued on the next physical line (`terminal_tokenizer.js:416-424` — uses `ACTIVITY_SOFT_WRAP_MIN_COLUMNS = 64` to decide whether the next line is a continuation).
3. Reconstructs **flattened terminal snapshots**: when the PTY serialises a full-screen render, structural box characters can collapse into spaces (`╭─ Assistant ╮ ┊ 📖 file.js ╰─` as one line); `expandFlattenedTerminalSnapshot` (lines 525-544) re-introduces semantic newlines so the parser can find boundaries again.
4. **Collapses repeated redraw artefacts** (`collapseRepeatedSkillActivity`, lines 215-238) where identical activity labels are emitted N times due to UI refresh cycles.
5. Strips **transient prompt suffixes** (lines 180-213) that change frame-to-frame and would otherwise produce spurious message diffs.
6. Filters **protocol artefact lines** (line 35-39: `isProtocolArtifactLine`).

### What the v1 primitives cover

The shipped v1 primitives (`spinner`, `settled-prompt`, `modal`, `approval-squash`, `footer-chrome`, `welcome-screen`, `visible-region`, `dispatch-order`, `error-detection`) handle:

- ✅ Spinner / footer / settled-prompt classification — line-based regex.
- ✅ Approval modals — both framed and squashed forms.
- ✅ Visible-region scoping by anchor-pair separators.

They **do not** cover:

- ❌ Box-drawing nesting. No v1 primitive recognises that content inside `╭─…╰─` is one semantic unit.
- ❌ Width-aware soft-wrap continuation. v1 has no `terminalColumns` concept; the soft-wrap heuristic in hermes is `prevLine.length >= 64`.
- ❌ Snapshot flattening recovery — reintroducing newlines into a PTY blob that lost them.
- ❌ Repeated-redraw deduplication of identical activity rows.

### Why not generalise as `tui/terminal-tokenizer@1`?

A subagent audit (2026-06-03) compared hermes's TUI to the other three production providers:

- **claude-cli** uses line-role classifiers (`isSpinnerLine`, `isShellChrome`) and `⏺` lead prefixes on every assistant continuation. No box nesting, no soft-wrap logic needed.
- **codex-cli** uses simple lead-prefix parsing (`> ` for assistant, `•` for tools). Flat linear output.
- **antigravity-cli** uses role-based chrome filtering. No box boundaries, tool output marked with `⎿`, no soft-wrap concerns. Migrated to **declarative-only** in Week 9.

None of these would adopt a generalised `tui/terminal-tokenizer@1`. Hermes's tokenizer is shaped specifically for a TUI that nests prose in box-drawing borders, soft-wraps activity rows at terminal width, and can flatten boundaries during PTY capture. **Generalising it would add 700 LOC to the shared library with one consumer.**

### Cost of forcing the migration anyway

To make hermes declarative-only would require:

- 3–4 new primitives (`tui/box-nesting@1`, `tui/soft-wrap-continuation@1`, `tui/snapshot-expansion@1`, `tui/activity-row-dedupe@1`)
- ~800 LOC of builder code
- Per-primitive schema files + tests
- No adoption from any other provider — paid maintenance cost forever

Versus: leave terminal_tokenizer.js where it is. The 60-system-message flood bug we fixed earlier this sprint was tokenizer-resident behaviour; the file is currently load-bearing for hermes's correct operation, and it works.

## What we DO ship for hermes in v1

- **No manifest changes.** The existing `cli/hermes-cli/provider.json` already passes the v1 schema (confirmed in `validate-cli-schema.mjs` 10/10 sweep).
- **No script changes.** `scripts/1.0/` stays canonical.
- **Tier classification:** `extended-legacy`. The `adhdev provider validate` command reports this when a manifest has no `tui` block but does have script overrides via `compatibility[].scriptDir` (Week 4 wiring).
- **Documentation only:** this file, so future contributors don't try to migrate.

## Revisit conditions

Revisit the decision **only if**:

1. A **second** provider adopts a TUI with box-drawing nesting + soft-wrap activity rows + snapshot flattening. (Aider? Gemini-cli? unknown.) Then generalising becomes worth it.
2. Hermes's TUI changes to a simpler line-based output (unlikely; the chrome is part of the product).
3. The Phase 5 sandboxed-JS execution lands and hermes's extended scripts can run inside an isolated-vm with hard memory/CPU limits — at which point "extended-legacy" stops being a marketplace differentiator.

Until any of those, hermes stays `extended-legacy` and the tokenizer stays where it is.

## Schedule impact

Week 9 closes out Phase 2's CLI migrations as follows:

| Provider | LOC v0 | LOC v1 | Tier | Status |
|----------|--------|--------|------|--------|
| claude-cli | 2173 | 70 | `extended` | v1 manifest drafted Week 5; builder integration test green |
| codex-cli | 1584 | 75 | `extended` | v1 manifest drafted Week 8; builder integration test green |
| antigravity-cli | 816 | **0** | **`declarative-only`** | v1 manifest drafted Week 9; first production declarative-only |
| hermes-cli | ~3000 | ~3000 | `extended-legacy` | **No migration**, by design |
