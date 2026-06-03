# codex-cli → declarative migration audit

**Source manifest:** `cli/codex-cli/provider.json`
**Source scripts:** `cli/codex-cli/scripts/1.0/` (1,584 LOC across 10 files)
**Target tier:** `extended` (requires residual JS for idle-settle state machine + codex-specific native history adapter)
**Audit baseline:** v1.0.0 primitive catalog as of 2026-06-03.

Companion to `migration-claude-cli.md`. Together they cover ~3.8K LOC of the 4 production CLI providers.

## 1. detect_status.js (284 LOC) — primitive mapping

| Behaviour | LOC | Primitive |
|-----------|-----|-----------|
| Idle model footer (`› gpt-…`, `› o1-…`, `› codex-…`) | ~12 | `tui/settled-prompt@1` |
| Idle "tab to queue message" cue | ~8 | `tui/settled-prompt@1` |
| Prompt-line detection (`› ` / `❯ `) | ~10 | `tui/settled-prompt@1` |
| MCP startup spinner (`Starting MCP servers (8s`) | ~8 | `tui/spinner@1` |
| Working status + elapsed-time variants (`12s` / `8m 56s` / `1h 2m 3s`) | ~15 | `tui/spinner@1` |
| Braille spinner | ~6 | `tui/spinner@1` |
| `Esc to interrupt` footer | ~5 | `tui/spinner@1` (text variant) |
| Active-tool tracking (`exec_command`, `apply_patch`, `1 background terminal running`) | ~35 | `tui/status-downgrade@1` |
| Trust-directory approval cues | ~8 | `tui/modal@1` (headerMatchers) |
| Rate-limit / usage approval modals | ~5 | `tui/modal@1` (headerMatchers) |
| Numbered approval buttons | ~12 | `tui/modal@1` (optionMatchers) |
| Approval footer (`Press Enter to…`) | ~8 | `tui/modal@1` |
| Visible-region scoping (18 / 12 / 8 line windows) | ~15 | `tui/visible-region@1` |
| Index-finder: last idle prompt vs last generating | ~15 | `tui/index-finder@1` + `tui/cue-ordering@1` |
| **Idle-settle state machine** (`idleCandidate` + `settledIdleSignature`, 2s hold) | ~40 | **NOT EXPRESSIBLE** — see Residual JS |

## 2. parse_approval.js (175 LOC)

| Behaviour | LOC | Primitive |
|-----------|-----|-----------|
| Button extraction (numbered `1. Label`) | ~20 | `tui/modal@1` (optionMatchers + continuationLines) |
| Header cues (trust, approval, rate limit) | ~15 | `tui/modal@1` (headerMatchers) |
| Approval footer | ~8 | `tui/modal@1` |
| Chrome filtering | ~12 | `tui/modal@1` (between-separators scope) |
| **Trust-button squashing** (`1yescontinue2noquit` → `["Yes, continue", "No, quit"]`) | ~12 | **NEW: `tui/approval-squash@1`** (PROPOSED) |
| Message assembly (last 3 lines, max 240 chars) | ~10 | `tui/modal@1` (titleMatchers) |

## 3. parse_session.js (6 LOC)

Trivial passthrough. Goes away once parse_output is replaced.

## 4. parse_output.js (754 LOC)

| Behaviour | LOC | Primitive |
|-----------|-----|-----------|
| Assistant block (`> ` prefix, `• ` bullet) | ~60 | `tui/assistant-block@1` |
| Tool/terminal message classification (`Ran`, `Explored`, `Read`) | ~25 | `tui/modal-as-message@1` + classification |
| Welcome / startup screen | ~20 | `tui/welcome-screen@1` |
| Session-ID extraction (v7 UUID) | ~10 | `tui/session-id-extraction@1` |
| User-echo cleanup | ~20 | `tui/user-echo@1` |
| ANSI strip / normalize helpers | ~40 | runtime helpers (SDK) |
| **Codex native-history lookup (rollout file discovery)** | ~95 | **NEW: `native-history/codex-rollout@1`** (already catalogued) |
| Native-history fallback / hybrid merge | ~50 | `native-history/codex-rollout@1` semantics |
| Hybrid message merge (dedupe, prefer richer) | ~75 | built-in merge semantics, daemon side |
| Orphan assistant-tail collection | ~25 | `tui/assistant-block@1` (tail variant) |
| Status-downgrade guard | ~15 | `tui/status-downgrade@1` |
| Error-line detection | ~20 | `tui/error-detection@1` |

## 5. control_helpers.js (127 LOC), list_models.js, set_fast.js, open_model_picker.js, open_reasoning_picker.js, scripts.js

| File | Behaviour | Primitive |
|------|-----------|-----------|
| `control_helpers.js` | Footer parse (model/reasoning/fast) | `cli/control-state@1` |
| `control_helpers.js` | Model-list JSON extract | `cli/capability-list@1` |
| `control_helpers.js` | Reasoning-level normalise | `cli/control-state@1` |
| `list_models.js` | `codex debug models` | `cli/capability-list@1` |
| `set_fast.js` | Boolean toggle + PTY write | `cli/control-toggle@1` + `cli/capability-action@1` |
| `open_model_picker.js` | `/model` slash | `cli/picker-open@1` |
| `open_reasoning_picker.js` | `/reasoning` slash | `cli/picker-open@1` |
| `scripts.js` | createState factory | manifest control-flow |
| `scripts.js` | **Idle-settle gate (2s hold + 3 frames)** | **NOT EXPRESSIBLE** — Residual JS |
| `scripts.js` | Module dispatch glue | replaced by `controls[]` |

## 6. Totals

- **Expressible via primitives:** ~1,050 LOC (66%)
- **Residual JS:**
  - Idle-settle state machine: ~70 LOC
  - Module dispatch glue (deletes): ~50 LOC
  - Helper inlining (deletes): ~80 LOC
- **End-state LOC after migration:** ~300 LOC (~80% reduction)
- **Tier:** `extended` (single override file)

## 7. New primitives required

1. **`adhdev:native-history/codex-rollout@1`** — already catalogued in `V1_PRIMITIVE_CATALOG.nativeHistory`. Schema + daemon-side adapter still TBD. Reads `~/.codex/sessions/**/*.jsonl` keyed by rollout UUID; supports workspace-scoped discovery + spawnAt timestamp filtering.
2. **`adhdev:tui/approval-squash@1`** — NEW. Handles compacted button text without delimiters (e.g. `1yescontinue2noquit`). Catalog rule:
   - Detect via regex `^\d+\w+\d+\w+$` (multiple numeric markers, no separators).
   - Extract via mapped rule table (`pattern → labels[]`).
   - Codex is first user; reusable for any provider with similar terminal-side collapsing.
3. **`adhdev:cli/picker-open@1`** (schema finalisation only) — codex `/model` and `/reasoning` are first users.

## 8. Fixture set (Week 8 capture target)

1. `startup-trust.pty` — trust directory approval, squashed buttons
2. `simple-reply.pty` — idle footer → Working spinner → assistant reply → settled
3. `tool-call-codex.pty` — `Ran` / `Explored`, background terminal tracking, status downgrade
4. `mcp-servers.pty` — `Starting MCP servers (8s`, MCP spinner → ready footer
5. `native-history-codex.pty` — JSONL rollout takeover for sealed turns + PTY fallback for in-flight
6. `idle-settle-hold.pty` — flickering idle-during-work; 2s hold must hold
7. `approval-rate-limit.pty` — `Approaching rate limits` modal with numbered buttons

## 9. Risk / gotcha

**The idle-settle state machine is load-bearing and must remain as JS override.** Codex shows the model footer (`› gpt-4o · /…`) while background tools run (`exec_command(...&)` + `1 background terminal running`). The footer is legitimate idle UI, but the user is still working. Without the 2-second / 3-frame settle gate, early frames flip status to `idle` prematurely.

`tui/status-downgrade@1` can answer "*is there a tool activity line after the idle prompt?*" in a single frame, but cannot carry temporal state ("did we see idle 2 seconds ago?"). The 70 LOC override stays — same justification as claude-cli's `GENERATING_HOLD_MS`. Document it as a production requirement, not a hack.

## 10. Schedule

- **Week 7 (this week)**: schema design for the two new primitives + the codex `provider.v1.json` draft with `dispatchOrder` and `tui` block.
- **Week 8**: capture all 7 codex fixtures, run through replay runner, drive builder bugs to zero, ship `tui/approval-squash@1` schema.
- **Week 9**: antigravity-cli migration (uses every primitive from claude + codex; should be cheap), hermes-cli stays `extended-legacy` due to `terminal_tokenizer`.
