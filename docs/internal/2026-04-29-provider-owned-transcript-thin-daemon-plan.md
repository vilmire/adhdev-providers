# Provider-Owned Transcript / Thin Daemon Plan

Goal: move CLI chat transcript authority out of daemon heuristics and into provider-owned canonical units, while keeping daemon-core as the thin runtime/storage/sync shell.

Architecture:
- Provider owns transcript semantics: parsing, current-turn scoping, replay collapse, stable unit identity, and whether the returned transcript is authoritative.
- Daemon owns process lifecycle, buffers, validation, persistence, and transport sync. Daemon should not override a provider-authoritative transcript with longer adapter history or generic content heuristics.
- Legacy providers keep the existing tail-context and daemon stitching path until they explicitly opt in.

Phase A: opt-in provider authority, no global behavior change
1. Add provider.json opt-in fields:
   - `transcriptAuthority: "provider"`
   - `transcriptContext: "full" | "tail"`
2. For opt-in providers with full context, pass the full committed transcript to parser input instead of `PARSE_MESSAGE_TAIL_LIMIT` tail only.
3. Mark adapter parsed status with `transcriptAuthority: "provider"` and `coverage: "full" | "tail"`.
4. In `read_chat`, never replace provider-authoritative parsed messages with longer adapter status messages just because adapter history has a bigger count.
5. Hermes CLI opts in first with `transcriptContext: "tail"` as the safe live default. `full` context remains supported by daemon-core but should only be enabled after bounded parser performance is proven on very long sessions.

Phase B: provider patch/snapshot contract
1. Extend `parse_session` output with explicit coverage and replacement semantics:
   - `coverage: full | tail | current-turn`
   - `revision`
   - `replaces` / `supersedes`
   - diagnostics for dropped replay/current-turn scoping.
2. Daemon applies provider transcript as snapshot/patch by coverage instead of content-count guessing.

Phase C: shrink daemon transcript heuristics
1. Remove or demote generic adapter-vs-parsed count preference for opted-in providers.
2. Keep schema validation and safety guards.
3. Retain legacy fallback only for providers without transcript authority opt-in.

Phase D: old history cleanup
1. Only canonicalize old retained duplicates when provider returns full coverage with stable identity.
2. Avoid content-only global dedupe of old history.
3. Prefer provider identity/replacement semantics over daemon fuzzy comparisons.

Current Phase A files:
- ADHDev OSS daemon-core:
  - `oss/packages/daemon-core/src/cli-adapters/provider-cli-shared.ts`
  - `oss/packages/daemon-core/src/cli-adapters/provider-cli-adapter.ts`
  - `oss/packages/daemon-core/src/commands/chat-commands.ts`
  - daemon-core tests under `oss/packages/daemon-core/test/...`
- Providers:
  - `cli/hermes-cli/provider.json`
  - `cli/hermes-cli/scripts/1.0/parse_session.js`

Validation:
- `npm run test -w oss/packages/daemon-core -- --run test/commands/read-chat-cli-live-parser.test.ts -t "provider-authoritative"`
- `npm run test -w oss/packages/daemon-core -- --run test/cli-adapters/provider-cli-adapter-message-builders.test.ts -t "provider parse context|legacy provider parse context"`
- `node --test tests/hermes-cli-parse-output.test.js`
- Before finalizing: full focused daemon-core files, tracked provider tests, and diff checks.
