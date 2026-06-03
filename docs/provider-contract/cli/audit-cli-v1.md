# CLI Provider Audit — v1 Primitive Extraction Source

> Status: Phase 0 deliverable · Last updated: 2026-06-03 · Companion to [`v1.md`](./v1.md) (contract) and [`provider-marketplace.md`](../../../../adhdev-cloud/docs/design/provider-marketplace.md) (design).

This audit examines the 4 **production-verified** CLI providers (codex-cli, claude-cli, hermes-cli, antigravity-cli) line-by-line to answer one question per script:

> **Which parts of this implementation can be expressed in declarative primitives, and which parts genuinely need a JS override?**

The answer drives Phase 1 — every "declarative" mark becomes an SDK primitive shape; every "override" mark stays as an extended-tier function call. Getting the cut right here saves rework downstream.

The 6 experimental providers (aider, cursor, gemini, github-copilot, goose, opencode) are catalogued in §6 with exports-only summaries — they are **not** ground truth for primitive extraction.

---

## Table of contents

1. [Methodology](#1-methodology)
2. [Summary scorecard](#2-summary-scorecard)
3. [Per-provider audit](#3-per-provider-audit)
   - [3.1 codex-cli](#31-codex-cli)
   - [3.2 claude-cli](#32-claude-cli)
   - [3.3 antigravity-cli](#33-antigravity-cli)
   - [3.4 hermes-cli](#34-hermes-cli)
4. [Cross-provider patterns](#4-cross-provider-patterns)
5. [Proposed v1 primitive set](#5-proposed-v1-primitive-set)
6. [Experimental providers (exports only)](#6-experimental-providers-exports-only)
7. [Implications for Phase 1](#7-implications-for-phase-1)

---

## 1. Methodology

For each production provider, the following scripts are reviewed at the function level:

- `parse_session.js` (usually a thin wrapper around `parse_output.js` — checked but rarely interesting)
- `parse_output.js` (the bulk of provider code; biggest target for declarative extraction)
- `detect_status.js` (status state machine — small but high-leverage)
- `parse_approval.js` (modal extraction — second-largest cluster after parse_output)
- `*_helpers.js`, `screen_helpers.js`, custom utilities (helper inventory; some become shared utilities, others become primitives)
- Capability handlers (`set_model.js`, `set_effort.js`, `list_models.js`, etc.) (low complexity; mostly declarative)

Each function or coherent code region is labelled:

- **D** = Declarative-friendly. Can be expressed by a primitive spec (regex, JSON path, marker pattern, etc.). The exact primitive id is named.
- **O** = Override-required. Imperative logic with branching state, complex parsing, or behaviour that no current primitive can express. The reason is stated.
- **H** = Helper. Generic utility (ANSI strip, line splitting, screen tokenisation). Becomes part of SDK runtime, not a per-provider primitive.

The summary scorecard in §2 aggregates lines-of-code per category. A high D% means the provider is mostly declarative; a low D% means it stays mostly extended-tier.

---

## 2. Summary scorecard

> Lines of code per category, per provider, per script. Totals exclude `scripts.js` glue. Numbers rounded for readability.

### 2.1 Across all 4 production providers

| Provider | Total LOC | Declarative (D) | Override (O) | Helper (H) | D% |
|---|---|---|---|---|---|
| antigravity-cli | 816 | ~540 | ~210 | ~66 | **66%** |
| codex-cli | 1584 | ~860 | ~520 | ~204 | **54%** |
| claude-cli | 2173 | ~1100 | ~620 | ~450 | **51%** |
| hermes-cli | 2983 | ~870 | ~1850 | ~260 | **29%** |
| **Aggregate** | **7556** | **~3370** | **~3200** | **~980** | **45%** |

Read: about 45% of current production CLI provider code can be replaced by declarative primitives. About 42% genuinely needs override JS (the extended tier). About 13% becomes generic SDK helpers (ANSI handling, terminal screen tokenisation, regex tooling).

### 2.2 Per-handler breakdown

| Handler | antigravity | codex | claude | hermes | Notes |
|---|---|---|---|---|---|
| `detect_status` | 130 (D 75%) | 284 (D 70%) | 385 (D 60%) | 213 (D 50%) | Spinner regex + footer chrome are declarative; CLI-specific phantom-modal guards stay override |
| `parse_approval` | 225 (D 65%) | 175 (D 80%) | 307 (D 35%) | 257 (D 45%) | Modal frame scoping declarative; assistant-prose false-positive guards stay override |
| `parse_output` | 429 (D 70%) | 754 (D 50%) | 932 (D 50%) | 1095 (D 25%) | Message extraction patterns declarative; per-CLI quirk handling stays override |
| Capability handlers | 0 | 206 | 281 | 1294 | Mostly mechanical; declarative except hermes (terminal_tokenizer 770 LOC override) |

### 2.3 Key takeaways

- **antigravity-cli has the highest D%** (66%). It's the smallest production provider and has the cleanest modal/spinner patterns.
- **hermes-cli has the lowest D%** (29%). Two reasons: (1) `terminal_tokenizer.js` (770 LOC) is genuinely a custom virtual-screen renderer that no primitive can express. (2) hermes has the most capability handlers (`retry_last`, `undo_last`, `rollback_list`, `set_yolo`, `show_providers`, etc.) — each one extra code without much declarative reuse.
- **claude-cli's `parse_approval` at only 35% D** is the worst handler-level score. The Claude TUI's frame redraw quirks (multi-paint approval menus, prose containing approval-like phrases) force three separate override guards. We accept this — claude is the highest-value provider and any improvement here will pay back across the marketplace.
- **codex-cli is the most balanced**. 54% D across the board, no single component standing out as outlier-bad. A good template for what a "well-behaved" Extended-tier provider looks like.

---

## 3. Per-provider audit

### 3.1 codex-cli

**Files**: 10 JS files, 1584 LOC total (excluding scripts.js glue).

#### 3.1.1 `detect_status.js` (284 LOC, D ~70%)

| Region | Lines | Category | Maps to primitive |
|---|---|---|---|
| Regex constants (APPROVAL_RE, APPROVAL_BUTTON_RE, GENERATING_SPINNER_RE, GENERATING_ESC_RE, GENERATING_BRAILLE_RE, IDLE_SEND_RE, IDLE_PROMPT_LINE_RE, IDLE_FOOTER_RE, IDLE_FOOTER_MODEL_TOKEN_RE, WELCOME_RE, STARTER_PROMPT_RE) | 60 | **D** | `tui/spinner`, `tui/settled-prompt`, `tui/footer-chrome`, `tui/welcome-screen` |
| `lastIdleFooterIndex`, `lastIdlePromptIndex`, `lastActiveToolActivityIndex`, `hasActiveToolActivityAfterIdle` | 50 | **D** | `tui/footer-chrome` + new primitive `tui/index-finder` (positional regex helper) |
| `hasApproval` (window-based modal cue scanning) | 20 | **D** | `tui/modal` primitive with `cueRegex` + `buttonRegex` + `footerRegex` + window size |
| `hasGenerating` — last-generating-vs-last-idle index ordering | 25 | **D** | New primitive `tui/cue-ordering` (which signal is newer wins) |
| `hasReadyFooter`, `hasReadyPrompt` | 30 | **D** | `tui/settled-prompt` + last-8-lines window scope |
| `hasRecentActiveGeneratingCue` | 10 | **D** | `tui/spinner` scope-window option |
| `hasIdle` (multi-condition idle test) | 25 | **D** | Combination of above |
| `hasStartupIdleScreen` | 25 | **D** | `tui/welcome-screen` |
| Top-level dispatch with cue-priority ordering | 30 | **O** | Order-of-checks logic is provider-specific. Override exists *only* to declare priority; ~20 lines after a `tui/dispatch-order` primitive |
| Compact approval-cue detection (codex specific UI) | 30 | **O** | Codex-only nested format; future primitive candidate |

Override scope after migration: ~50 LOC (down from 284).

#### 3.1.2 `parse_approval.js` (175 LOC, D ~80%)

| Region | Lines | Category | Notes |
|---|---|---|---|
| ANSI strip + line splitting | 20 | **H** | Shared SDK helper |
| Question-line and button-line regex | 25 | **D** | `tui/modal.questionPattern`, `tui/modal.buttonPattern` |
| Window-based modal extraction (find question → collect buttons + context) | 70 | **D** | `tui/modal.scope = "window-around-question"` primitive |
| Per-tier modal kinds (trust folder, approval prompt, MCP server) | 30 | **D** | `tui/modal.questionVariants[]` |
| Codex `Always approve this session` / `Approve and run now` specific patterns | 20 | **D** | Variant of questionPattern; declarative |
| Build-generic-approval fallback | 10 | **O** | Used when explicit cues fail; stays as override safety net |

Override scope after migration: ~10 LOC.

#### 3.1.3 `parse_output.js` (754 LOC, D ~50%)

| Region | Lines | Category | Notes |
|---|---|---|---|
| Initial input gathering, screen normalisation | 50 | **H** | SDK helper |
| ANSI / cursor / OSC handling | 60 | **H** | Already in SDK as `TerminalTranscriptAccumulator` |
| `detectAuthBlocker`, `detectHighTrafficError` | 40 | **D** | `tui/error-detection` primitive |
| Welcome / startup screen detection | 30 | **D** | `tui/welcome-screen` |
| Prompt scoping (find last user prompt, slice transcript after) | 80 | **D** | `tui/prompt-marker` + `tui/transcript-slice` primitive |
| Session ID extraction (when codex prints it) | 15 | **D** | `tui/session-id-extraction` |
| Native history integration | 100 | **O** | `readCodexNativeHistory` adapter — `native-history/codex-rollout` adapter primitive |
| Visible message extraction (assistant blocks, tool blocks, user echoes) | 200 | **D** | `tui/assistant-block`, `tui/tool-block`, `tui/user-echo` primitives |
| Control-value extraction (model picker state) | 60 | **D** | `cli/control-state` primitive |
| Final message assembly + trailing prompt cleanup | 80 | **O** | Codex-specific message reconciliation; small override |
| Approval modal stitching into messages | 40 | **D** | `tui/modal-as-message` |

Override scope after migration: ~120 LOC.

#### 3.1.4 Capability handlers + helpers (~370 LOC, D ~70%)

| File | Lines | Category | Notes |
|---|---|---|---|
| `control_helpers.js` | 127 | **D** | Largely template-able. Most providers' control flows are similar. |
| `list_models.js` | 27 | **D** | List of static strings from screen pattern. `cli/capability-list` primitive. |
| `open_model_picker.js` | 9 | **D** | Trivial `writeRaw` of `/model` + key sequence |
| `open_reasoning_picker.js` | 13 | **D** | Same pattern |
| `set_fast.js` | 30 | **D** | Toggle key sequence |

Override scope after migration: 0 LOC. All capability handlers can be declarative.

#### 3.1.5 codex-cli total

| | LOC | D | O |
|---|---|---|---|
| Total | 1584 | ~860 (54%) | ~520 |
| Override LOC after migration | — | — | **~180** |

A 65% LOC reduction in override surface. Very strong candidate for "good declarative provider example" in the marketplace docs.

---

### 3.2 claude-cli

**Files**: 12 JS files, 2173 LOC total.

#### 3.2.1 `detect_status.js` (385 LOC, D ~60%)

Largest detect_status of the four. Multiple state-machine layers because Claude TUI redraws aggressively.

| Region | Lines | Category | Notes |
|---|---|---|---|
| Regex/marker constants | 80 | **D** | `tui/spinner` (braille pattern), `tui/settled-prompt`, `tui/footer-chrome` |
| Trust / safety / quick check screen detection | 60 | **D** | `tui/welcome-screen.variants[]` |
| Idle detection (multi-mode: send prompt, model footer, "press enter") | 50 | **D** | Combination of `tui/settled-prompt` variants |
| Approval cue scanning (window-based) | 30 | **D** | `tui/modal.windowScan` |
| Generation cue scanning (spinner + braille + esc-to-interrupt) | 40 | **D** | `tui/spinner` with multiple alternative patterns |
| Cue priority + cooldown logic | 30 | **O** | Claude-specific: hold "waiting_approval" for N ms after modal disappears to absorb redraws |
| Frame-redraw hysteresis (single-frame absorbtion) | 35 | **O** | Sprint-2026-06 fix; stays override |
| MCP server install screen detection | 15 | **D** | `tui/welcome-screen.variant` |
| Settings warning screen detection | 15 | **D** | Same |
| Dispatch | 30 | **O** | Priority ordering, override |

Override scope after migration: ~100 LOC.

#### 3.2.2 `parse_approval.js` (307 LOC, D ~35%) — **lowest declarative score**

Three guards stack up to handle Claude's TUI:

| Region | Lines | Category | Notes |
|---|---|---|---|
| Modal frame scope detection (find approval prompt block) | 50 | **D** | `tui/modal.scope = "between-separators"` |
| Question + button extraction within frame | 60 | **D** | `tui/modal.questionPattern` + `buttonPattern` |
| Build modal kinds (trust folder, MCP server, approval, settings warning) | 70 | **D** | `tui/modal.questionVariants[]` |
| Phantom modal guard (prose containing approval-like phrases) | 80 | **O** | Sprint-2026-06 fix: scope strictly to modal frame, reject assistant prose. Stays override. |
| Single-frame redraw absorption | 30 | **O** | Same fix. Stays override. |
| Generic approval fallback | 20 | **O** | Last-resort heuristic |

Override scope after migration: ~150 LOC. This is the "hardest" production handler.

#### 3.2.3 `parse_output.js` (932 LOC, D ~50%)

Largest parse_output of the four.

| Region | Lines | Category | Notes |
|---|---|---|---|
| Input/screen normalisation | 60 | **H** | SDK helper |
| Visible region detection (active session vs scrollback) | 100 | **D** | `tui/visible-region` primitive |
| Assistant block parsing (⏺ marker + multi-line content + tool call boundary) | 200 | **D** | `tui/assistant-block` |
| Thinking block parsing | 60 | **D** | `tui/assistant-block.skipKinds.thinking` |
| Tool block parsing | 80 | **D** | `tui/tool-block` |
| User echo parsing (find last user prompt) | 50 | **D** | `tui/prompt-marker` + `tui/user-echo` |
| Image attachment handling (added 2026-06) | 50 | **D** | `tui/media-input` |
| Native history integration | 80 | **O** | `readClaudeNativeHistory` — `native-history/claude-jsonl` adapter |
| Approval-stitching (during waiting_approval, keep transcript + append modal) | 50 | **D** | `tui/approval-stitching` (added 2026-06 contract; declarative now) |
| Message merge + provenance | 100 | **O** | Claude-specific dedup + transcript-authority logic; override |
| Provider session ID extraction | 30 | **D** | `tui/session-id-extraction` (claude-cli emits it via specific marker) |
| Status downgrade (waiting_approval → generating when modal null) | 30 | **D** | `tui/status-downgrade` rule (sprint-2026-06 contract) |
| Final assembly + trailing prompt cleanup | 30 | **O** | Override |

Override scope after migration: ~210 LOC. Mostly native history + dedup logic.

#### 3.2.4 `screen_helpers.js` (247 LOC, all **H**)

Pure helpers: ANSI strip, cursor-forward expansion, line splitting, prompt-line index, separator scanning. All migrate into SDK as shared helpers.

#### 3.2.5 Capability handlers (~140 LOC, D ~95%)

| File | Lines | Category |
|---|---|---|
| `list_models.js` | 56 | **D** |
| `new_session.js` | 16 | **D** |
| `run_slash_command.js` | 41 | **D** |
| `set_compact.js` | 16 | **D** |
| `set_effort.js` | 31 | **D** |
| `set_model.js` | 37 | **D** |

Override scope: 0 LOC. All declarative.

#### 3.2.6 claude-cli total

| | LOC | D | O |
|---|---|---|---|
| Total | 2173 | ~1100 (51%) | ~620 |
| Override LOC after migration | — | — | **~460** |

A 25% LOC reduction in override surface — less aggressive than codex because of the redraw-absorption guards. Still substantial, and the override surface is now well-scoped: phantom modal handling, native history dedup, single-frame absorption — three clearly named patches instead of 2173 LOC of mixed logic.

---

### 3.3 antigravity-cli

**Files**: 5 JS files, 816 LOC total.

The smallest production provider. Cleanest patterns. Best candidate for "first declarative-only-ish provider".

#### 3.3.1 `detect_status.js` (130 LOC, D ~75%)

| Region | Lines | Category | Notes |
|---|---|---|---|
| Regex constants | 35 | **D** | `tui/spinner` (braille), `tui/settled-prompt`, `tui/footer-chrome` |
| Idle prompt detection (`gemini-cli` style footer) | 25 | **D** | `tui/settled-prompt` |
| Generation cue scanning (spinner, "esc to cancel") | 25 | **D** | `tui/spinner` |
| Live-frame-tail scoping (2026-06 fix) | 20 | **D** | `tui/spinner.scope = "live-frame-tail"` option |
| Welcome screen detection | 10 | **D** | `tui/welcome-screen` |
| Dispatch | 15 | **O** | Override priority logic |

Override scope after migration: ~15 LOC.

#### 3.3.2 `parse_approval.js` (225 LOC, D ~65%)

| Region | Lines | Category | Notes |
|---|---|---|---|
| Modal extraction (`Do you want to proceed?` style) | 80 | **D** | `tui/modal` |
| Tool-use header parsing (`agy wants to run: bash -c ...`) | 50 | **D** | `tui/modal.contextHeader` |
| Continuation-line handling (wrapped option labels) | 30 | **D** | `tui/modal.continuationLines = true` (sprint-2026-06 fix) |
| Welcome / settings approval variants | 30 | **D** | `tui/modal.variants[]` |
| MCP approval variant | 15 | **D** | Same |
| Generic fallback | 20 | **O** | Override |

Override scope after migration: ~20 LOC.

#### 3.3.3 `parse_output.js` (429 LOC, D ~70%)

| Region | Lines | Category | Notes |
|---|---|---|---|
| ANSI / cursor handling | 50 | **H** | SDK |
| PTY chrome stripping (header lines like `ANTIGRAVITY CLI (COORDINATOR)`) | 50 | **D** | `tui/footer-chrome.headerVariants[]` |
| Visible region detection | 60 | **D** | `tui/visible-region` |
| Assistant block parsing | 80 | **D** | `tui/assistant-block` (different markers than codex/claude) |
| User echo parsing | 40 | **D** | `tui/user-echo` |
| Image attachment handling | 30 | **D** | `tui/media-input` |
| Native history integration (transcript.jsonl vs transcript_full.jsonl) | 80 | **O** | `native-history/anthropic-cli-transcript` adapter — has specific dual-file behaviour (sprint-2026-06 fix), small override |
| Final assembly | 30 | **D** | Declarative |

Override scope after migration: ~80 LOC.

#### 3.3.4 antigravity-cli total

| | LOC | D | O |
|---|---|---|---|
| Total | 816 | ~540 (66%) | ~210 |
| Override LOC after migration | — | — | **~115** |

A 45% LOC reduction in override surface. Best D% of the four — and the override surface is narrowly scoped (native history dual-file logic). If we want a "showcase declarative migration", antigravity is it.

---

### 3.4 hermes-cli

**Files**: 20 JS files, 2983 LOC total. Largest of the four.

#### 3.4.1 `detect_status.js` (213 LOC, D ~50%)

| Region | Lines | Category | Notes |
|---|---|---|---|
| Regex constants | 50 | **D** | `tui/spinner`, `tui/settled-prompt`, `tui/footer-chrome` |
| Idle/generating detection | 50 | **D** | Standard |
| Hermes-specific footer (multiple model/provider chips) | 30 | **D** | `tui/footer-chrome.chipPattern` (hermes-specific variant) |
| Approval cue scanning | 30 | **D** | `tui/modal` |
| Source-classifier integration (calls source_classifier.js) | 20 | **O** | Tied to terminal_tokenizer; stays override |
| Frame-redraw absorption | 20 | **O** | Override |
| Dispatch | 15 | **O** | Override |

Override scope after migration: ~60 LOC.

#### 3.4.2 `parse_approval.js` (257 LOC, D ~45%)

| Region | Lines | Category | Notes |
|---|---|---|---|
| Modal frame detection | 60 | **D** | `tui/modal` |
| Yolo-mode and provider-switch modal variants | 60 | **D** | `tui/modal.variants[]` |
| Tool-use header parsing | 40 | **D** | `tui/modal.contextHeader` |
| Hermes wrap-redraw deduplication (modal labels arrive in two paints) | 50 | **O** | Hermes-specific terminal behaviour; override |
| Source-classifier influence (hermes treats certain rows as system-not-user) | 30 | **O** | Override (calls source_classifier.js) |
| Generic fallback | 15 | **O** | Override |

Override scope after migration: ~95 LOC.

#### 3.4.3 `parse_output.js` (1095 LOC, D ~25%) — **lowest D% of any handler**

Hermes's hallmark: it uses `terminal_tokenizer.js` (770 LOC) to maintain a virtual screen with full ANSI/redraw semantics, then runs `source_classifier.js` (153 LOC) over the tokens to classify each row as user / assistant / system / tool. This is genuinely custom and cannot be expressed in any current primitive.

| Region | Lines | Category | Notes |
|---|---|---|---|
| Input normalisation | 40 | **H** | SDK |
| Terminal tokenizer invocation | 30 | **O** | Wraps the 770-LOC tokenizer |
| Source classifier invocation | 30 | **O** | Wraps the 153-LOC classifier |
| Token → message conversion | 200 | **O** | Heavy custom logic |
| Standard assistant block parsing (fallback) | 100 | **D** | `tui/assistant-block` (used when tokenizer fails) |
| User echo parsing | 50 | **D** | `tui/user-echo` |
| Image attachment handling | 30 | **D** | `tui/media-input` |
| Native history integration (hermes session.json) | 80 | **O** | `native-history/hermes-session` adapter (recently changed) |
| Wrap-redraw dedup | 60 | **O** | Override |
| Provider-switch / yolo-mode tracking | 70 | **O** | Override |
| Slash-command output rendering | 100 | **O** | Override |
| Final assembly + dedup | 80 | **O** | Override |
| Provenance tracking | 40 | **D** | Declarative |
| Status + modal stitching | 40 | **D** | Declarative |
| Capability state extraction | 30 | **D** | Declarative |

Override scope after migration: ~810 LOC. Hermes stays heavily Extended-tier.

#### 3.4.4 `terminal_tokenizer.js` (770 LOC, all **O**)

Custom virtual-screen renderer. Maintains cursor position, dirty regions, scrollback. Treats individual cells. No primitive can express this. **Stays override permanently.**

#### 3.4.5 `source_classifier.js` (153 LOC, all **O**)

Custom classification of tokens into roles. Depends on tokenizer state. **Stays override permanently.**

#### 3.4.6 Capability handlers (~120 LOC across many files, D ~95%)

All small handlers (`retry_last`, `undo_last`, `rollback_list`, `set_yolo`, `set_provider`, `show_providers`, etc.) are pure `writeRaw` of slash commands. Trivially declarative.

#### 3.4.7 `screen_helpers.js` (183 LOC, all **H**)

Pure helpers, migrate into SDK.

#### 3.4.8 `helpers.js` (35 LOC, all **H**)

Pure helpers.

#### 3.4.9 hermes-cli total

| | LOC | D | O |
|---|---|---|---|
| Total | 2983 | ~870 (29%) | ~1850 |
| Override LOC after migration | — | — | **~1100** |

A 35% LOC reduction in override surface (1850 → 1100). The remaining override is concentrated in `terminal_tokenizer.js`, `source_classifier.js`, and `parse_output.js` token-to-message conversion. These are not "bugs" — they reflect hermes's unique design (it's the only production CLI that treats the terminal as a true virtual screen rather than an append-only log).

**Hermes is the showcase Extended-tier provider.** It demonstrates exactly why the marketplace needs an Extended tier at all: some agents have genuinely custom behaviour, and forcing them into declarative shapes would lose fidelity.

---

## 4. Cross-provider patterns

Common observations from the deep audit:

### 4.1 Helpers we should ship in SDK

These appear in 2+ providers in nearly identical form. Promote to SDK shared utilities so providers don't reimplement:

| Helper | Source | Used by |
|---|---|---|
| ANSI escape stripper (with CUF → space expansion, sprint-2026-06 fix) | claude/screen_helpers.js, codex inline, hermes/helpers.js | All 4 |
| Line splitter (handles `\r\n` carriage return cursor reset) | all 4 | All 4 |
| Cursor forward (ESC[n C) → spaces expansion | claude/screen_helpers.js, antigravity inline | claude, antigravity, codex (inline) |
| Separator-line detection (`────`, `═══`, `╔════`) | claude/parse_approval.js, antigravity/parse_approval.js | claude, antigravity |
| Last-N-lines window extraction | all 4 | All 4 |
| Last-index-of-pattern utility | codex/detect_status.js, claude/detect_status.js | claude, codex |
| Braille character ranges (`[⠀-⣿]` U+2800-U+28FF) | claude, antigravity, codex | claude, antigravity, codex (hermes uses tokenizer) |

About 980 LOC of helper code consolidates into ~400 LOC SDK utilities (with better tests).

### 4.2 Primitives we did not anticipate

The design doc Appendix A listed an initial primitive hypothesis. After this audit, the following are **new** (not in the original list) or **reshaped**:

| Primitive | Status | Reason |
|---|---|---|
| `tui/cue-ordering` | **new** | codex/detect_status compares `lastGenerating` vs `lastIdleFooter` indices to decide priority. Pattern recurs in claude. Should be a named primitive. |
| `tui/dispatch-order` | **new** | Each provider's `detect_status` has an order-of-cue-checks. Made declarative, eliminates ~30 LOC of override per provider. |
| `tui/visible-region` | **new** | Both codex and claude separate active-session from scrollback. Primitive. |
| `tui/footer-chrome` | **expanded** | Original spec was "footer noise filters". Audit shows it also covers Hermes-style multi-chip footer formats. Variant-aware. |
| `tui/welcome-screen.variants[]` | **expanded** | Original was single welcome detection. Each provider has 3-5 variants (trust folder, settings warning, MCP server install, etc.). |
| `tui/status-downgrade` rule | **new** | Sprint-2026-06: when status=waiting_approval and modal=null, downgrade to generating. Now a contract rule and primitive. |
| `tui/approval-stitching` | **new** | Sprint-2026-06: during waiting_approval, keep transcript + append modal. Contract rule, declarative primitive. |
| `tui/modal-as-message` | **new** | Daemon's read_chat treats approval as a visible chat bubble. Each provider stitches differently; primitive normalises. |
| `tui/media-input` | **new** | Image attachment handling pattern (file path materialization, structured input). 3 of 4 production providers have this. |
| `cli/capability-list` / `cli/control-state` | **new** | Lift capability handler patterns into primitives. Cuts capability handler LOC to ~zero. |
| `tui/index-finder` | **new** | Positional regex helper used in cue-ordering logic. |

Total: 11 new/reshaped primitives. Original hypothesis had 7 TUI primitives; audit identifies ~17. The Phase 1 SDK ships all 17.

### 4.3 Things we removed from the original primitive hypothesis

- `tui/separator@1` as a standalone primitive — instead it becomes a parameter to `tui/modal.scope` (the only consumer). Not lost; just inlined.

### 4.4 Override surface after migration

Aggregated:

| Provider | Override LOC before | Override LOC after | Reduction |
|---|---|---|---|
| antigravity-cli | 350 | 115 | **−67%** |
| codex-cli | 600 | 180 | **−70%** |
| claude-cli | 700 | 460 | **−34%** |
| hermes-cli | 1700 | 1100 | **−35%** |
| **Total** | **3350** | **1855** | **−45%** |

Marketplace v1 ships 4 production providers as Extended-tier. The audit shows that's the right call: even with the new primitives, none of them quite makes it to declarative-only. The override surface is **smaller and more focused** after migration, which is the actual goal — easier to audit, faster to fix when bugs hit.

---

## 5. Proposed v1 primitive set

Based on the audit, the SDK v1 primitive set is updated from the design-doc hypothesis. Identifiers shown are `adhdev:<id>@<version>`.

### 5.1 TUI parsing

```
tui/prompt-marker@1
tui/spinner@1
tui/settled-prompt@1
tui/assistant-block@1
tui/tool-block@1
tui/thinking-block@1
tui/user-echo@1
tui/modal@1
tui/modal-as-message@1
tui/footer-chrome@1
tui/welcome-screen@1
tui/visible-region@1
tui/cue-ordering@1
tui/dispatch-order@1
tui/index-finder@1
tui/status-downgrade@1
tui/approval-stitching@1
tui/media-input@1
tui/session-id-extraction@1
tui/error-detection@1
```

20 TUI primitives.

### 5.2 Native history

```
native-history/codex-rollout@1
native-history/claude-jsonl@1
native-history/anthropic-cli-transcript@1   (antigravity transcript_full.jsonl)
native-history/hermes-session@1
```

4 native-history adapters for production providers.

### 5.3 Capability handlers

```
cli/capability-list@1            (listModels / listModes / showProviders pattern)
cli/control-state@1              (model/effort/mode chip extraction)
cli/capability-action@1          (writeRaw of slash command + key sequence)
cli/control-toggle@1             (boolean state toggle)
cli/picker-open@1                (open a picker UI in the agent)
cli/picker-set@1                 (commit picker selection)
```

6 capability primitives. Lifts almost all capability handlers to declarative.

### 5.4 Common / cross-category

```
common/setting-boolean@1
common/setting-number@1
common/setting-string@1
common/setting-select@1
common/capability-input@1
common/capability-output@1
common/capability-controls@1
common/auth-env-var@1
common/auth-cli-command@1
common/spawn@1
common/timeouts@1
common/resume@1
common/mesh-coordinator@1
```

13 common primitives.

### 5.5 Override signatures

```
override/cli-parse-session@1
override/cli-detect-status@1
override/cli-parse-approval@1
override/cli-parse-output@1
override/cli-read-native-history@1
override/cli-list-native-history@1
override/cli-capability-handler@1
```

7 override signatures. Each defines exact input/output types so the SDK can dispatch + validate.

### 5.6 Aggregate

**50 primitives** in the v1 catalog at launch.

---

## 6. Experimental providers (exports only)

Surface-only summary. None are deep-audited; they exist in-repo but the marketplace v1 launch ships them either with an `experimental` flag or defers them to v1.1.

| Provider | LOC | Scripts.js exports | Notes |
|---|---|---|---|
| `aider-cli` | 282 | parseOutput, parseSession, detectStatus, parseApproval | Smallest CLI provider. Likely declarative-friendly once primitives exist. |
| `cursor-cli` | 826 | parseOutput, parseSession, detectStatus, parseApproval, listModels, setModel | Note: this is the CLI version of Cursor (not the IDE provider). Includes capability handlers. |
| `gemini-cli` | 599 | parseOutput, parseSession, detectStatus, parseApproval, createState | Reasonable footprint. |
| `github-copilot-cli` | 247 | parseOutput, parseSession, detectStatus, parseApproval | Small. Likely declarative-friendly. |
| `goose-cli` | 307 | parseOutput, parseSession, detectStatus, parseApproval | Small. Likely declarative-friendly. |
| `opencode-cli` | 433 | parseOutput, parseSession, detectStatus, parseApproval | Medium. Audit needed before shipping. |

P2 retrospective decides which of these are ready for marketplace. If primitives extracted from the 4 production providers cover their patterns, shipping under `experimental` is cheap. If they need new primitives, defer to v1.1.

---

## 7. Implications for Phase 1

The audit produces concrete inputs for Phase 1 SDK construction:

### 7.1 Primitive prioritisation order

Build primitives in the order they unblock the most provider migration work. From the per-handler tables:

1. **Week 2 (Phase 1 start)**: `tui/spinner`, `tui/settled-prompt`, `tui/welcome-screen`, `tui/prompt-marker`, `tui/footer-chrome` — these 5 cover detect_status across all 4 providers.
2. **Week 2 end**: `tui/modal`, `tui/modal-as-message`, `tui/modal.continuationLines`, `tui/modal.scope = "between-separators"` — covers parse_approval.
3. **Week 3 mid**: `tui/assistant-block`, `tui/tool-block`, `tui/thinking-block`, `tui/user-echo`, `tui/visible-region`, `tui/cue-ordering` — covers most of parse_output.
4. **Week 3 end**: `native-history/*` adapters — covers the native history layer.
5. **Week 4**: capability + common primitives — fills out remaining holes.

### 7.2 SDK helper consolidation

980 LOC of duplicated helpers across the 4 providers becomes ~400 LOC SDK shared utilities. Phase 1 Week 2 work item.

### 7.3 Migration order (Phase 2)

Per the plan doc, P2 migrates providers in this order: claude → codex → antigravity → hermes. The audit confirms this is the right order:

- **claude first** because its primitive needs (frame redraw hysteresis, approval-stitching rule, status-downgrade rule) are the most-likely-to-be-missing primitives. Validating against claude exercises the SDK most thoroughly.
- **codex second** because its primitive needs are most balanced — good validation of the SDK breadth.
- **antigravity third** because it should be the easiest (66% D%) and benefits from primitives matured during claude+codex.
- **hermes last** because its override surface is largest and its primitives are essentially "the same as antigravity + custom tokenizer override". Migration is mostly mechanical.

### 7.4 Risk update

The audit reduces R2.2 (Phase 1 primitives wrong shape) from H/M to M/M: we have evidence-based input. R2.1 (hermes terminal_tokenizer un-primitive-able) confirmed as **expected outcome**, not a risk — hermes stays Extended.

R0.1 (audit reveals missing primitives) is now resolved with a specific list of 11 new/reshaped primitives (§4.2). Phase 1 plan should add 1 week for the expanded primitive count (5 → 7 weeks total).

Updated risk matrix maintained in the plan doc on the next plan revision.
