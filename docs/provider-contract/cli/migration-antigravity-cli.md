# antigravity-cli → declarative migration audit

**Source manifest:** `cli/antigravity-cli/provider.json`
**Source scripts:** `cli/antigravity-cli/scripts/1.0/` (816 LOC across 5 files)
**Target tier:** `extended` (one residual override for live-frame separator scoping; see §5)
**Audit baseline:** v1.0.0 primitive catalog as of 2026-06-03.

Antigravity is the cheapest of the four production migrations: it has the smallest script footprint, and most behaviours are already covered by primitives shipped in Weeks 5–8.

## 1. detect_status.js (130 LOC)

| Behaviour | LOC | Primitive |
|-----------|-----|-----------|
| Settled idle prompt (`>` + `? for shortcuts`, but NOT `esc to cancel`) | ~10 | `tui/settled-prompt@1` (with negative `excludeWhenFooter`) |
| `How's the CLI experience so far?` feedback-survey → idle | ~5 | `tui/welcome-screen@1` (extended to suppress survey screens) |
| `servers are experiencing high traffic` → error | ~3 | `tui/error-detection@1` |
| Live-frame braille spinner (last 8 lines only) | ~5 | `tui/spinner@1` (scope=live-frame-tail, windowLines=8) |
| `Thinking / Running / Using Tool / Prioritizing Tool` cues | ~7 | `tui/spinner@1` (text variants) |
| Modal cue → `waiting_approval` (delegates to parse_approval) | ~1 | `tui/dispatch-order@1` (modal before spinner) |
| **Live-frame separator scope** (`─{40,}\n>\n─{40,}` cuts off scrollback) | ~15 | **`tui/visible-region@1` (between-anchors)** — NEW USAGE |
| Default to `generating` on ambiguous (no spinner, no settled prompt) | ~2 | `dispatchOrder.onNoMatch: "preserve-last"` or override |

The "default to generating on ambiguous" rule is unusual. claude/codex defaults to `idle`. Antigravity intentionally biases the other way because coordinator false-completion is worse than delayed idle. This is expressible by setting `dispatchOrder.onNoMatch: "preserve-last"` and letting the daemon's outer policy carry the last verdict — OR by retaining the 1-line return in the override.

## 2. parse_approval.js (225 LOC)

| Behaviour | LOC | Primitive |
|-----------|-----|-----------|
| Numbered options (`1. label`) | ~5 | `tui/modal@1` (optionMatchers) |
| Yes/No fallback | ~3 | `tui/modal@1` (questionVariants) |
| Inline bracket options (`[0] skip [1] x [2] y`) | ~12 | **NEW: `tui/modal-inline-options@1`** (proposed) OR extend `tui/modal@1` with a `inlineButtonPattern` field |
| Wrapped continuation lines (indented label rest) | ~12 | `tui/modal@1` (continuationLines: true) |
| Footer / prompt suppression in scoping | ~10 | `tui/modal@1` (built-in chrome skip) |
| Trust-folder header | ~8 | `tui/modal@1` (headerMatchers) |
| Trust-project header | ~8 | `tui/modal@1` (headerMatchers) |
| `Do you want to proceed?` with `agy wants to run:` context block | ~25 | `tui/modal@1` (contextHeader) |
| Reject generic `?` lines (anti-false-positive: assistant numbered lists ending in `?` look like modals) | ~10 | covered by requiring `headerMatchers` to match — no generic fallback |

**One genuine new requirement: inline-bracket options.** Antigravity's CLI-experience survey renders `[0] skip [1] yes [2] no [3] still using` all on one line. The Week 7 modal primitive matches per-line numbered options, not inline. Options:

- **Option A (preferred):** add `inlineButtonPattern` (regex with global flag) to `tui/modal@1` so the builder can also walk inline matches. Schema bump is back-compatible (new optional field). One-line implementation in the builder.
- Option B: ship `tui/modal-inline-options@1` as a sibling primitive. Strictly more flexible but more API surface for nothing concrete to gain — claude/codex don't render inline modals.

Going with Option A.

## 3. parse_output.js (429 LOC)

| Behaviour | LOC | Primitive |
|-----------|-----|-----------|
| Assistant block extraction (`> ` prompt, paragraph reassembly) | ~80 | `tui/assistant-block@1` |
| User echo / prompt-start detection | ~20 | `tui/user-echo@1` |
| Tool block (Antigravity formats vary by tool) | ~50 | `tui/tool-block@1` |
| Separator / footer / chrome suppression | ~40 | `tui/footer-chrome@1` + `tui/visible-region@1` |
| High-traffic error → retry message | ~40 | `tui/error-detection@1` + manifest `retryStrategy` (NEW field, optional) |
| Native history dispatch (antigravity-cli-transcript-jsonl) | ~70 | `nativeHistory.format = "antigravity-cli-transcript-jsonl"` (existing manifest; daemon-side adapter is Phase 3+) |
| Hybrid merge (sealed turns from JSONL, in-flight from PTY) | ~60 | built-in merge semantics, daemon side |
| Message dedupe + length-prefer | ~30 | covered by daemon `normalizeProviderNativeHistoryRecords` |
| Helpers (ANSI strip, split, normalize) | ~40 | runtime helpers (SDK) — go away |

## 4. parse_session.js (20 LOC) + scripts.js (12 LOC)

Trivial wrappers. Both disappear after parse_output is replaced.

## 5. Residual JS

Antigravity has ONE production behaviour that doesn't fit a primitive cleanly: the `liveFrameTail()` separator-bounded scope in detect_status. It finds the **last** `─{40,}\n>\n─{40,}` separator pair and slices everything after it as "the live frame." `tui/visible-region@1` with `scope: between-anchors` covers most of this, but the antigravity rule cares about the *most-recent* pair, not the first.

Two choices:

- **Choice A:** extend `tui/visible-region@1`'s `between-anchors` mode with a `selectAnchor: "last"` option (default `"first"`). This is one line in the builder and is genuinely reusable — codex uses a similar "most-recent separator" rule. **Recommended.**
- Choice B: ship a 40-LOC override that overrides `getVisibleRegion` for antigravity. Wasteful; the rule is general.

Going with Choice A. With it, antigravity needs **zero residual JS** — it becomes the first **declarative-only** production provider.

## 6. Totals

- **Expressible via primitives:** ~720 LOC (88%)
- **Residual JS budget:** **0 LOC** if we land `visible-region.selectAnchor: "last"` + `modal.inlineButtonPattern`.
- **End-state LOC after migration:** 0 (no override file at all)
- **Tier:** **`declarative-only`** — first production provider to land that tier.

## 7. New / extended primitives needed

1. **`tui/modal@1` schema bump** — add optional `inlineButtonPattern` + `inlineButtonFlags`. Builder gains an extra pass that walks all global matches on one line when no per-line buttons collect enough buttons.
2. **`tui/visible-region@1` schema bump** — add optional `selectAnchor: "first" | "last"` (default `"first"`). Builder picks the chosen instance when there are multiple.

Both are minor, back-compatible field additions. No new $id primitives required.

## 8. Fixture set (Week 9 capture target)

1. `cold-start.pty` — welcome → trust-folder modal → settled prompt
2. `feedback-survey.pty` — `How's the CLI experience so far?` + inline `[0] skip [1] yes [2] no` options → idle (NOT waiting_approval)
3. `do-you-want-to-proceed.pty` — `agy wants to run: <command>` + numbered options + continuation lines
4. `trust-project.pty` — alternate trust modal variant
5. `tool-running-spinner.pty` — `Using Tool` + braille spinner in live frame; spinner in scrollback must NOT pin generating
6. `high-traffic-error.pty` — error footer + auto-retry payload
7. `assistant-numbered-list.pty` — assistant reply ending in `1. item` `2. item` `?` — must NOT misclassify as approval modal

## 9. Risk / gotcha

**The default-to-generating-on-ambiguous rule.** Antigravity prefers a stuck-generating UI over a stuck-idle UI because the latter makes the coordinator commit prematurely. claude/codex prefer the opposite. We MUST express this as `dispatchOrder.onNoMatch: "preserve-last"` (the daemon's outer policy then holds the previous verdict) rather than re-introducing a literal `return 'generating'` line in an override. If the daemon currently maps `null` → `idle` unconditionally, that mapping needs to honour the manifest's `onNoMatch` field; otherwise antigravity will regress.

## 10. Schedule

- **Week 9 (this week)**: ship the two primitive schema bumps, draft `provider.v1.json`, no override file, run integration tests against synthesised screens.
- **Week 9 also**: hermes-cli decision pending tokenizer audit — keep `extended-legacy` or attempt migration.
- **Week 10**: capture all 7 fixtures, run replay, drive any builder bugs to zero.
