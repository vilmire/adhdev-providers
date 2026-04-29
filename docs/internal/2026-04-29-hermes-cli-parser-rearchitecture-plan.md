# Hermes CLI Parser Rearchitecture Plan

> For Hermes: implement this plan in small, test-backed steps. Do not add more string-similarity heuristics unless a test proves it is the last-resort fallback. Keep the daemon thin: Hermes CLI transcript semantics belong in the provider, but the provider must expose a structured canonical transcript instead of relying on fuzzy replay cleanup.

Last updated: 2026-04-29

Goal: Replace the current Hermes CLI parser's accumulated string/replay heuristics with a source-aware, current-turn-scoped, provider-owned canonical transcript pipeline.

Architecture: Split parsing into four explicit layers: raw terminal tokenizer, source/provenance classifier, canonical reconciler, and identity assigner. The key change is to decide which source is authoritative before merging, so viewport scrollback artifacts do not become chat bubbles that later require fuzzy dedupe.

Tech Stack: JavaScript provider scripts in `cli/hermes-cli/scripts/1.0/`, Node test runner under `tests/`, ADHDev daemon-core CLI provider adapter contracts.

---

## 1. Why this document exists

The current `cli/hermes-cli/scripts/1.0/parse_output.js` works, but it has grown into a heuristic-heavy parser. Recent duplicate-final-bubble fixes added more duplicate/replay detection around small terminal residue and previous-final replay after a follow-up prompt. Those guards are useful as regression protection, but they should not become the long-term architecture.

Current measured shape:

| Provider | Parser | Lines | Bytes | Functions | Replay/collapse/dedupe emphasis |
| --- | --- | ---: | ---: | ---: | --- |
| Hermes CLI | `cli/hermes-cli/scripts/1.0/parse_output.js` | 1471 | 52603 | 60 | high |
| Claude CLI | `cli/claude-cli/scripts/1.0/parse_output.js` | 1110 | 46116 | 54 | medium/low |
| Codex CLI | `cli/codex-cli/scripts/1.0/parse_output.js` | 619 | 24315 | 43 | low |

The important smell is not only file size. It is that Hermes currently lets multiple sources produce overlapping message candidates and then tries to repair the result with content similarity:

- committed `input.messages`
- terminal `buffer` / raw transcript
- visible `screenText`

This makes duplicate bubbles a predictable failure mode. If the same assistant answer appears once in committed history and again in viewport scrollback with a tiny terminal artifact, the parser has to guess whether two strings are the same bubble.

## 2. Non-goals

- Do not move Hermes-specific transcript semantics into daemon-core `read_chat` unless there is a provider-contract gap that cannot be solved provider-side.
- Do not hide useful tool/activity rows just to reduce complexity.
- Do not add server/web fallback logic for cloud dashboard commands.
- Do not claim success when the parser cannot classify a source boundary; surface parser uncertainty in tests/log-only debug output rather than silently approving a bad merge.
- Do not kill or restart the user's global daemon as part of this provider-only refactor. Use `adhdev provider reload` for live validation.

## 3. Current problem map

### 3.1 Existing flow

`parseOutput(input)` currently performs this high-level sequence:

1. Read `input.messages` as base messages.
2. Parse `input.buffer` into `transcriptMessages`.
3. Parse `input.screenText` into `screenMessages`.
4. Collapse replayed assistant history in each source.
5. Choose a primary raw source by length.
6. Merge raw sources.
7. Decide whether raw messages should replace or merge with base messages.
8. Collapse replayed assistant history again.
9. Assign `id`, `bubbleId`, `providerUnitKey`, `_turnKey`, and `bubbleState`.

### 3.2 Risky behaviors

- Source authority is decided late and indirectly.
- `parseMessages()` returns canonical-looking messages even when parsing viewport artifacts.
- `dedupeMessages()`, `collapseReplayedAssistantHistory()`, `collapseRepeatedTurnReplays()`, and `mergeMessageHistories()` can all remove or merge messages using overlapping content heuristics.
- Provider identity is assigned after dedupe/replay cleanup, so identity stability depends on the prior heuristic result.
- A repeated prompt with an intentionally repeated answer can look similar to a stale replay unless the current turn boundary is known.

## 4. Target principles

1. Source first, similarity last.
   - Classify `input.messages`, `buffer`, and `screenText` before merging.
   - Do not treat all parsed text as equally authoritative.

2. Current-turn scoping before message reconciliation.
   - A visible assistant box from an older turn should not enter the current turn candidate set.
   - Prefer prompt/session boundaries over post-hoc replay cleanup.

3. Canonical unit keys before bubble updates.
   - Decide `turnKey` and `unitKey` as part of reconciliation.
   - Treat partial/final redraws as updates to the same unit, not as separate messages later collapsed by content.

4. Explicit reason codes.
   - Every drop/replace decision should have a reason such as `committed-prefix`, `same-turn-update`, `viewport-replay`, `terminal-residue`, or `stale-history-replay`.
   - Tests should assert reason behavior through internal helpers where practical.

5. Bounded heuristics.
   - Fuzzy content matching remains only as last-resort compatibility, behind narrow conditions and regression tests.

## 5. Target data model inside the provider

Introduce internal candidate records. These are not returned directly to daemon-core.

```js
{
  source: 'committed' | 'buffer' | 'screen',
  provenance: 'history' | 'current-turn' | 'viewport' | 'modal' | 'unknown',
  role: 'user' | 'assistant',
  kind: 'standard' | 'tool' | 'terminal' | 'system',
  senderName: undefined | 'Tool' | 'Terminal' | 'Plan' | 'System',
  content: string,
  sourceRange: { startLine: number, endLine: number } | null,
  promptFingerprint: string,
  turnBoundary: 'before-current-user' | 'current-user' | 'after-current-user' | 'orphan',
  confidence: 'canonical' | 'candidate' | 'artifact',
}
```

Introduce reconciled canonical records:

```js
{
  role: 'user' | 'assistant',
  kind: 'standard' | 'tool' | 'terminal' | 'system',
  senderName: string | undefined,
  content: string,
  turnKey: string,
  unitKey: string,
  state: 'streaming' | 'final',
  mergeReason: 'committed' | 'same-turn-update' | 'new-current-unit' | 'modal',
}
```

Only canonical records become returned `messages` with provider-owned identity.

## 6. Proposed module boundaries

Keep the runtime entrypoint path stable, but split helpers into local files under `cli/hermes-cli/scripts/1.0/`.

- `parse_output.js`
  - Thin entrypoint; calls the new pipeline.
  - Maintains the exported function contract.

- `terminal_tokenizer.js`
  - ANSI cleanup, line splitting, Hermes box/activity/prompt tokenization.
  - No dedupe. No history merge.

- `source_classifier.js`
  - Converts tokens plus source name into candidate records.
  - Labels candidates as committed/history/current-turn/viewport/artifact.

- `turn_scope.js`
  - Determines session/new/undo boundaries and current user prompt boundary.
  - Provides `scopeVisibleCandidates(...)` so prior assistant boxes do not become current-turn output.

- `transcript_reconciler.js`
  - Merges committed canonical history with current candidates.
  - Uses deterministic source priority first.
  - Emits reason codes for replace/drop decisions.

- `identity.js`
  - Builds stable `turnKey`, `unitKey`, `providerUnitKey`, `id`, `bubbleId`, `_turnKey`, and `bubbleState`.

- `legacy_similarity.js`
  - Existing content similarity helpers moved behind a clearly marked fallback boundary.
  - Long-term target is to shrink this file, not grow it.

This split can be done gradually; the first tasks should extract without behavior changes.

## 7. Incremental implementation plan

### Phase 0: Freeze the current hotfix as guardrail

Objective: Keep the live duplicate fix available while preventing it from becoming the architecture.

Files:
- Modify: `tests/hermes-cli-parse-output.test.js`
- Modify: `cli/hermes-cli/scripts/1.0/parse_output.js`

Steps:
1. Keep the two new regression tests for tiny terminal residue and previous-final replay after a follow-up prompt.
2. Add comments marking `isLikelySmallResidueDuplicate()` and `stableAssistantBeforeCurrentUser` logic as compatibility fallback, not primary transcript authority.
3. Run: `node --test tests/hermes-cli-parse-output.test.js`
4. Run: `node --test tests/*.test.js`

Acceptance criteria:
- Current duplicate regression remains fixed.
- Comments clearly state the fallback boundary.
- No new behavior beyond comments.

### Phase 1: Extract parser/tokenizer without behavior changes

Objective: Make structure observable before changing semantics.

Files:
- Create: `cli/hermes-cli/scripts/1.0/terminal_tokenizer.js`
- Modify: `cli/hermes-cli/scripts/1.0/parse_output.js`
- Test: `tests/hermes-cli-parse-output.test.js`

Steps:
1. Move pure ANSI/line/token helpers that do not depend on merge state into `terminal_tokenizer.js`.
2. Export functions needed by `parse_output.js`.
3. Keep existing output byte-for-byte compatible for all tests.
4. Add a small tokenizer-focused test only if an exported helper needs direct coverage.
5. Run targeted and full provider tests.

Acceptance criteria:
- `parseOutput()` output is unchanged for existing tests.
- `parse_output.js` loses line count and responsibility without semantic changes.

### Phase 2: Introduce candidate records with provenance

Objective: Stop treating parsed viewport text as canonical messages too early.

Files:
- Create: `cli/hermes-cli/scripts/1.0/source_classifier.js`
- Modify: `cli/hermes-cli/scripts/1.0/parse_output.js`
- Test: `tests/hermes-cli-parse-output.test.js`

Steps:
1. Add an internal `toCandidates(source, tokensOrMessages, context)` helper.
2. Wrap committed `input.messages` as `source: 'committed', confidence: 'canonical'`.
3. Wrap `buffer` candidates as `source: 'buffer'`.
4. Wrap `screenText` candidates as `source: 'screen', confidence: 'candidate'` or `artifact` depending on boundaries.
5. Keep the old merge path behind an adapter that converts candidates back to legacy messages.
6. Add tests that assert prior final assistant box from `screenText` is classified as viewport/history artifact when it appears before the current user prompt.

Acceptance criteria:
- Classification exists before merge.
- Existing parse output remains compatible.
- New tests demonstrate the distinction between committed and viewport candidates.

### Phase 3: Current-turn scoping before merge

Objective: Prevent stale visible history from entering the current assistant candidate set.

Files:
- Create: `cli/hermes-cli/scripts/1.0/turn_scope.js`
- Modify: `cli/hermes-cli/scripts/1.0/source_classifier.js`
- Modify: `cli/hermes-cli/scripts/1.0/parse_output.js`
- Test: `tests/hermes-cli-parse-output.test.js`

Steps:
1. Implement boundary detection for:
   - latest `● user prompt`
   - structural `> prompt` blocks
   - assistant box after current prompt
   - idle prompt/footer
   - new-session/undo state
2. Make `parseOutput()` classify screen/buffer candidate ranges as before/current/after current user.
3. Drop or ignore prior-turn assistant candidates before they enter `mergeMessageHistories()`.
4. Add a regression where the same final answer appears above a follow-up prompt and must not become a new assistant bubble.
5. Add a regression where the user intentionally asks for a repeated answer and the new answer after the current prompt is preserved.

Acceptance criteria:
- The parser distinguishes stale replay from intentional repeated answer by turn boundary, not by content similarity alone.
- The compatibility fallback from Phase 0 is still present but should no longer be the reason the common replay case passes.

### Phase 4: Replace merge heuristics with a reconciler

Objective: Make message selection deterministic and explainable.

Files:
- Create: `cli/hermes-cli/scripts/1.0/transcript_reconciler.js`
- Modify: `cli/hermes-cli/scripts/1.0/parse_output.js`
- Test: `tests/hermes-cli-parse-output.test.js`

Steps:
1. Implement `reconcileTranscript({ committed, bufferCandidates, screenCandidates, status, activeModal })`.
2. Rules in priority order:
   - committed canonical history is preserved unless historyState says new/undo.
   - current user candidate updates/extends the last user only when it matches the current prompt boundary.
   - assistant current-turn standard output updates the current assistant unit.
   - tool/terminal activity rows are keyed by source turn + normalized activity head, not fuzzy whole-content matching.
   - modal/system output is appended through explicit modal path.
3. Return canonical records plus optional debug reason list in non-returned internal state.
4. Keep legacy fuzzy merge only as fallback when no source boundary can be determined.
5. Add tests for reason-coded scenarios.

Acceptance criteria:
- `collapseReplayedAssistantHistory()` is no longer called multiple times in the main path.
- Common duplicate/replay tests pass because of source/turn rules, not because of broad content matching.
- Existing activity/tool preservation tests still pass.

### Phase 5: Move identity assignment earlier and make it stable

Objective: Ensure bubble identity is stable across redraws and independent from incidental dedupe order.

Files:
- Create: `cli/hermes-cli/scripts/1.0/identity.js`
- Modify: `cli/hermes-cli/scripts/1.0/transcript_reconciler.js`
- Modify: `cli/hermes-cli/scripts/1.0/parse_output.js`
- Test: `tests/hermes-cli-parse-output.test.js`

Steps:
1. Build `turnKey` from explicit current user boundary plus occurrence count only when necessary.
2. Build assistant standard unit key from canonical current-turn unit, not from post-dedupe ordinal alone.
3. Build tool/terminal unit keys from activity type + source range + normalized command/tool label where available.
4. Keep `providerUnitKey`, `id`, `bubbleId`, `_turnKey`, and `bubbleState` compatible with daemon/web expectations.
5. Add tests that the same streaming assistant bubble keeps the same provider identity across partial/final redraws.
6. Add tests that a dropped viewport replay does not shift later bubble identities.

Acceptance criteria:
- Identity is assigned as part of canonical record creation.
- Tests prove stability across redraw/replay cases.

### Phase 6: Shrink legacy similarity and enforce source-boundary tests

Objective: Prevent future heuristic creep.

Files:
- Create: `tests/hermes-cli-source-boundary.test.js` or extend `tests/hermes-cli-parse-output.test.js`
- Modify: `cli/hermes-cli/scripts/1.0/legacy_similarity.js`
- Modify: `cli/hermes-cli/scripts/1.0/parse_output.js`

Steps:
1. Move old fuzzy helpers into `legacy_similarity.js` if not already done.
2. Add a top-level comment: new cases must prefer source/turn tests before adding similarity rules.
3. Remove redundant calls to `dedupeMessages()` and `collapseReplayedAssistantHistory()` from the main path.
4. Keep a small compatibility suite for terminal truncation/line elision/residue.
5. Run full provider tests.

Acceptance criteria:
- Main parser path is readable as tokenize -> classify -> scope -> reconcile -> identify.
- Legacy similarity is visibly a fallback, not the primary architecture.
- Duplicate bugs have source-boundary regressions, not only string-similarity regressions.

## 8. Validation strategy

Provider repo checks:

```bash
cd /Users/moltbot/.openclaw/workspace/projects/adhdev-providers
node --test tests/hermes-cli-parse-output.test.js
node --test tests/hermes-cli-detect-status.test.js tests/hermes-cli-approval.test.js tests/hermes-cli-new-session.test.js
node --test tests/*.test.js
node validate.js cli/hermes-cli/provider.json
node validate.js
```

Live reload check after provider-only changes:

```bash
adhdev provider reload
```

Live read_chat spot check:

- Use the active Hermes CLI runtime session.
- Confirm standard assistant duplicate groups are empty.
- Confirm tool/terminal activity rows are preserved.
- Confirm provider identity fields exist: `id`, `bubbleId`, `providerUnitKey`, `_turnKey`, `bubbleState`.

## 9. MVP cut line

MVP is complete when:

- Current duplicate-final regressions pass without relying primarily on the new small-residue fallback.
- The main entrypoint reads as tokenize -> classify -> scope -> reconcile -> identify.
- Existing Hermes CLI parser tests pass.
- Full provider tests pass.
- `adhdev provider reload` works without daemon restart.

Not required for MVP:

- Full TypeScript rewrite of provider scripts.
- Daemon-core protocol changes.
- Web UI changes.
- Removing every old similarity helper.

## 10. Open decisions

1. Should internal debug reason codes be returned under a private `debug` key during provider verification only, or kept test-only?
2. Should source classifier helpers be exported for direct unit tests, or tested through `parseOutput()` fixtures only?
3. How much of current identity shape is relied on by web clients versus daemon-core only?
4. Is Hermes CLI raw terminal format stable enough to key tool/terminal rows by source range, or should source range only be a tie-breaker?

## 11. Recommended execution order

1. Land or keep the current hotfix only as a guarded regression fix.
2. Do Phase 1 extraction in a no-behavior-change PR/commit.
3. Do Phase 2 and Phase 3 together only if tests are small; otherwise split.
4. Do Phase 4 reconciler as the main semantic change.
5. Do Phase 5 identity stabilization.
6. Do Phase 6 cleanup only after live validation.

Avoid parallel agents touching the same file during Phases 1-4. If parallelizing, split as:

- Agent A: tokenizer extraction only.
- Agent B: fixture/test design for source-boundary cases, no implementation.
- Agent C: identity contract audit, no implementation.

Then integrate sequentially.

## 12. Summary

The right fix is not another parser string heuristic. The parser should first know whether a candidate came from committed history, buffer transcript, or viewport screen, then scope candidates to the current turn, then reconcile into canonical units, then assign stable provider-owned identity. String similarity should remain only a narrow compatibility fallback for terminal truncation and residue.
