# claude-cli → declarative migration audit

**Source manifest:** `cli/claude-cli/provider.json`
**Source scripts:** `cli/claude-cli/scripts/1.0/` (2173 LOC across 12 files)
**Target tier:** `extended` (cannot be reduced to `declarative-only` due to two
specific stateful behaviours documented under "Residual JS" below).
**Audit baseline:** v1.0.0 primitive catalog as of 2026-06-03.

This document is the **migration map** Phase 2 Week 5–6 follows. It lists every
production behaviour in the current claude-cli scripts and points each one at
either a v1 primitive expressible in JSON, or at the JS override that must
remain. The end state is a manifest with:

- a populated `tui` block (replaces 80%+ of `detect_status.js` and most of
  `parse_approval.js`),
- a populated `nativeHistory` block (replaces `parse_session.js`,
  `parse_output.js`, and the JSONL ingest path),
- a 2-file `overrides/` directory (~250 LOC, down from 2173).

## 1. detect_status.js (385 LOC) — primitive mapping

| Behaviour | LOC | Primitive |
|-----------|-----|-----------|
| Idle prompt detection (`❯ ` / `› ` / `> ` at line start) | ~10 | `tui/settled-prompt@1` |
| `Type your message` / `for shortcuts` / `Press enter` cues | ~20 | `tui/settled-prompt@1` (additional matchers) |
| Braille spinner `[⠂⠐⠒⠓⠦⠴⠶⠷⠿]` recognition | ~6 | `tui/spinner@1` |
| `esc to (interrupt\|stop)` footer = generating | ~5 | `tui/spinner@1` (text spinner variant) |
| Status verbs: `Claude is (thinking\|processing\|working)`, `Flummoxing`, `Finagling`, etc. | ~15 | `tui/spinner@1` (text spinner variant) |
| Spinner-with-metric line `… (1.2s ↑ 42 tokens)` | ~12 | `tui/spinner@1` + new `tui/spinner-metrics@1` (PROPOSED) |
| Tool block detection (`Bash(`, `Read(`, `⎿ Running`) | ~15 | `tui/tool-block@1` |
| Shell chrome detection (`➜ host`, `Update available!`, `Sonnet/Opus/Haiku`) | ~12 | `tui/footer-chrome@1` |
| Approval cue lines (`requires approval`, `(y/n)`, `Allow once`, `Settings Warning`) | ~22 | `tui/modal@1` (headerMatchers) |
| Approval button lines (numbered + `Yes/No/Allow/Deny`) | ~18 | `tui/modal@1` (optionMatchers) |
| Startup trust dialog (`Quick safety check`, `Is this a project you trust`) | ~15 | `tui/modal@1` (variant scope) |
| Choice menu (`What do you want to do?` + numbered options + `Enter to confirm`) | ~20 | `tui/modal@1` (variant scope) |
| Dispatch order: approval → interrupt → prompt-adjacent generating → completed reply → generating → idle | ~30 | `tui/dispatch-order@1` |
| Visible-region scoping (use last 18 lines for approval, 12 for generating, 6 for shell chrome) | ~12 | `tui/visible-region@1` per-rule |
| Index-finder: "last occurrence of X above/below Y" | ~30 | `tui/cue-ordering@1` + `tui/index-finder@1` |
| **Stateful generating-hold (`GENERATING_HOLD_MS = 3000`)** | ~40 | **NOT EXPRESSIBLE** — see Residual JS |
| **Idle-confirmation frame counter (`IDLE_CONFIRMATION_FRAMES = 3`)** | ~25 | **NOT EXPRESSIBLE** — see Residual JS |

**Expressible in JSON:** ~250 LOC of behaviour, plus ~80 LOC of helpers that
go away because the runtime owns them.

**Residual JS (must stay):** the generating-hold state machine. It needs a
`prevTimestamp` carried between invocations, which the declarative
detect-status builder does not give callers (handlers are pure (input) →
verdict). This is the right call: making the builder stateful would force
*every* declarative manifest to opt into "do I care about per-frame
confirmation?" — too much for the common case. Claude is the only production
provider that needs this hold.

## 2. parse_approval.js (307 LOC) — primitive mapping

| Behaviour | LOC | Primitive |
|-----------|-----|-----------|
| Button line recognition + label cleanup | ~35 | `tui/modal@1` (optionMatchers + continuationLines) |
| Noise filtering (separators, chrome) | ~20 | `tui/modal@1` (handled by between-separators scope) |
| Header matcher families (startup trust / MCP / settings / generic approval) | ~30 | `tui/modal@1` (headerMatchers — multiple groups) |
| `(y/n)` / `[Y/n]` fallback question | ~10 | `tui/modal@1` (yesNoFallback variant) |
| Modal title extraction (the human-readable prompt) | ~50 | `tui/modal@1` (titleMatchers) |
| Cross-frame stitching (button label appears on next frame than header) | ~40 | `tui/approval-stitching@1` (catalog entry already exists, schema TBD) |
| `approvalPositiveHints` auto-approve mapping | ~30 | `common/capability-input@1` (existing manifest field) |
| Numbered-confirm-menu detection (`Enter to confirm` + 2+ options) | ~40 | `tui/modal@1` (confirmFooter variant) |
| Tail-fallback when accumulator empty | ~30 | `tui/visible-region@1` (scope: tail) |

**Expressible in JSON:** ~275 LOC. Residual: stitching across stale frames
when the modal header has scrolled off-screen but buttons are still visible —
this is `tui/approval-stitching@1`, which we have catalogued but not yet
shipped a schema for. **Phase 2 Week 6 will design that schema** using the
claude-cli stitching code as the empirical reference.

## 3. parse_session.js (6 LOC) — trivial passthrough

```js
module.exports = function parseSession(state, input) {
  return parseOutput(state, input); // delegates entirely to parse_output.js
};
```

No primitive needed. Once parse_output is replaced, this file disappears.

## 4. parse_output.js (932 LOC) — primitive mapping

This is the heaviest script. Most of it reconstructs chat history from PTY
text **as a fallback** for when the JSONL native source is unavailable.

| Behaviour | LOC | Primitive |
|-----------|-----|-----------|
| Assistant block extraction (`⏺ ` prefix, paragraph reassembly) | ~120 | `tui/assistant-block@1` |
| Thinking block (`✻ Thinking`) | ~40 | `tui/thinking-block@1` |
| Tool block (`Bash(...)`, `⎿ output`) | ~140 | `tui/tool-block@1` |
| User echo line recognition | ~60 | `tui/user-echo@1` |
| Session ID extraction from header | ~30 | `tui/session-id-extraction@1` |
| Modal-as-message conversion ("Claude asked you to approve X, you chose Y") | ~80 | `tui/modal-as-message@1` |
| Media-input mention (`[Image]`, `[Pasted text]`) | ~40 | `tui/media-input@1` |
| Welcome screen suppression | ~30 | `tui/welcome-screen@1` |
| Footer chrome suppression | ~25 | `tui/footer-chrome@1` |
| Error-line detection (`Error:`, `failed to`, traceback) | ~40 | `tui/error-detection@1` |
| Status-downgrade ("don't promote idle if there's a pending tool") | ~30 | `tui/status-downgrade@1` |
| **JSONL native-history dispatch (when claude.jsonl is fresh)** | ~250 | `nativeHistory.format: claude-jsonl` (already declared) → daemon-side reader |
| **Hybrid merging (JSONL is authoritative for completed turns, PTY for in-flight)** | ~50 | `nativeHistory.mode: native-source` semantics (already declared) |

**Expressible via primitives:** ~635 LOC, replaced by `tui` block matchers +
the daemon's built-in native-history reader for `claude-jsonl`.

**Residual JS:** the JSONL reader for `~/.claude/projects/**/*.jsonl` is
already covered by `nativeHistory.format = "claude-jsonl"`. The current script
implements it inline; Phase 2 Week 6 moves it to a daemon-side built-in
adapter (already catalogued as `native-history/claude-jsonl@1`). After that,
the only remaining JS for chat-history is the hybrid-merging policy, which is
~50 LOC.

## 5. screen_helpers.js (247 LOC)

Pure helper library. After the migration, the runtime exposes these helpers
to overrides as `sdk.helpers.*`, so this file disappears entirely from the
provider.

## 6. Capability scripts — settings/effort/model/compact (236 LOC across 6 files)

| File | Behaviour | Primitive |
|------|-----------|-----------|
| `list_models.js` | Parses model picker output | `cli/picker-open@1` + `cli/picker-set@1` |
| `set_model.js` | Sends `/model` then types selection | `cli/picker-set@1` |
| `set_effort.js` | Sends `/effort` then types selection | `cli/picker-set@1` |
| `set_compact.js` | Sends `/compact` | `cli/capability-action@1` |
| `run_slash_command.js` | Sends arbitrary `/command` | `cli/capability-action@1` |
| `new_session.js` | Sends `/clear` | `cli/capability-action@1` |
| `scripts.js` | Glue (dispatch table) | Replaced by manifest controls[] |

All expressible. ~236 LOC → 0 LOC of JS once primitives ship.

## Residual JS budget — what stays after migration

1. **Generating-hold state machine** (detect_status) — ~70 LOC.
2. **Modal stitching** edge case when buffer is large enough that the header
   has fallen out of the visible region — ~40 LOC. *(May go to zero if the
   `tui/approval-stitching@1` primitive schema can describe it; deferred.)*
3. **JSONL hybrid merge policy** (parse_output) — ~50 LOC. *(May also go to
   zero once the built-in `native-history/claude-jsonl@1` adapter implements
   the "JSONL is authoritative for sealed turns, PTY for in-flight" policy.)*

**Best case:** 70 LOC residual override JS (clean tier, all flagged APIs are
0).

**Expected case:** ~160 LOC residual, well under the ~500 LOC threshold the
taint analyzer treats as "still review-able".

## Fixture set (Phase 2 Week 5 deliverable)

Capture these production PTY scenarios into
`cli/claude-cli/fixtures/<scenario>.pty` + `.expected.json`:

| Scenario | Catches |
|----------|---------|
| `cold-start.pty` | welcome-screen suppression, first prompt-ready transition |
| `simple-reply.pty` | spinner → assistant block → settled prompt |
| `tool-call.pty` | spinner + tool block + post-tool spinner + reply |
| `approval-bash.pty` | approval modal with `Yes / No / Always allow` buttons |
| `approval-mcp.pty` | "New MCP server found" trust modal |
| `idle-while-working-visible.pty` | the sprint-2026-06 regression — spinner visible but settled-prompt below it must NOT flip to idle |
| `multi-turn-jsonl.pty` | JSONL native-history takes precedence over PTY reconstruction for sealed turns |

The replay runner from Week 4 will assert every anchor passes against the new
declarative builder output. Migration is "done" when all 7 fixtures pass with
**only the 70-LOC override stub** providing the generating-hold; remove the
hold temporarily and at least `idle-while-working-visible` must fail, proving
the hold is load-bearing.

## Schedule

- **Week 5 (this week)**: capture all 7 fixtures from a running claude session,
  draft the new declarative `tui` block, ship the hold-only override.
- **Week 6**: replace `parse_output.js` with the daemon-side
  `native-history/claude-jsonl@1` built-in adapter; design + ship the
  `tui/approval-stitching@1` schema if claude's stitching fits a general
  shape, otherwise leave that as documented residual JS.
- **Week 7**: codex-cli migration (uses Week 6 primitives), then antigravity
  (uses the same set), then hermes (which intentionally stays Extended due to
  `terminal_tokenizer`).
