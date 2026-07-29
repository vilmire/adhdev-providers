# Stub CLI provider — worked example

A minimal CLI provider, intended as the starting point for new provider
authors. Copy this directory, rename `stub-cli` to your agent's slug, edit
`provider.json`, and run:

```bash
adhdev provider validate examples/stub-cli
adhdev provider test examples/stub-cli
```

## What this example covers

- `tui.spinner` — recognises Braille spinners and dotted "working" prompts as
  the "generating" cue (drives the synthesized `detectStatus`).
- `tui.settledPrompt` — recognises the `stub>` prompt as the "idle" cue.
- `tui.modal` — recognises a "Approve this action?" modal with numbered
  options, scoped to the area between the last two `─` separator lines so
  numbered lists inside assistant prose are not mistaken for modals (drives
  the synthesized `parseApproval`).
- `tui.dispatchOrder` — fixes evaluation order to `spinner → modal →
  settled-prompt`, which is the order that fixed the sprint-2026-06 regression
  where Codex flipped to idle while "Working" was still on screen.
- `scripts/v1/scripts.js` + `scripts/v1/parse_session.js` — the script entry
  the daemon probes via `compatibility[].scriptDir` / `defaultScriptDir`. The
  declarative `tui` block lets the daemon synthesize `detectStatus` and
  `parseApproval`, but **not** `parseSession` (that requires a
  `tui.transcriptPty` block, which this example deliberately omits). The
  shipped `parse_session.js` is a minimal, deterministic implementation of
  the contract in `docs/provider-contract/cli/v1.md` §5.1 — pure function of
  the PTY buffer, no timestamps, no I/O — so the example works out-of-box.
  It is self-contained (zero requires outside the provider root) so it keeps
  working after you copy the directory elsewhere.

## What this example does NOT cover

- No `nativeHistory` — the stub agent has no rollout file, so chat history
  comes purely from PTY parsing.
- No `overrides` — adding any `overrides.*` entry promotes the provider to
  extended-tier and triggers the install-time trust prompt.
- No `meshCoordinator` — this agent does not participate in Hermes mesh.

## Fixtures

`fixtures/cold-start.pty` and `fixtures/cold-start.expected.json` show the
record/replay format. The replay runner builds a TerminalTranscriptAccumulator
from the .pty bytes, snapshots at each declared anchor, and asserts the
handler outputs match the expected shapes. The shipped `parseSession`
reproduces the same anchors — see `tests/stub-cli-example.test.js`.

```bash
adhdev provider test ./fixtures/cold-start.expected.json
```
