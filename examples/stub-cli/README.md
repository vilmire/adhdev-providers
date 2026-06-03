# Stub CLI provider — worked example

A minimal **declarative-only** CLI provider, intended as the starting point
for new provider authors. Copy this directory, rename `stub-cli` to your
agent's slug, edit `provider.json`, and run:

```bash
adhdev provider validate examples/stub-cli
adhdev provider test examples/stub-cli
```

## What this example covers

- `tui.spinner` — recognises Braille spinners and dotted "working" prompts as
  the "generating" cue.
- `tui.settledPrompt` — recognises the `stub>` prompt as the "idle" cue.
- `tui.modal` — recognises a "Approve this action?" modal with numbered
  options, scoped to the area between the last two `─` separator lines so
  numbered lists inside assistant prose are not mistaken for modals.
- `tui.dispatchOrder` — fixes evaluation order to `spinner → modal →
  settled-prompt`, which is the order that fixed the sprint-2026-06 regression
  where Codex flipped to idle while "Working" was still on screen.

## What this example does NOT cover

- No `nativeHistory` — the stub agent has no rollout file, so chat history
  comes purely from PTY parsing.
- No `overrides` — declarative-only providers are **verified-tier** as long
  as no JS file is referenced. Adding any `overrides.*` entry promotes the
  provider to extended-tier and triggers the install-time trust prompt.
- No `meshCoordinator` — this agent does not participate in Hermes mesh.

## Fixtures

`fixtures/cold-start.pty` and `fixtures/cold-start.expected.json` show the
record/replay format. The replay runner builds a TerminalTranscriptAccumulator
from the .pty bytes, snapshots at each declared anchor, and asserts the
handler outputs match the expected shapes.

```bash
adhdev provider test ./fixtures/cold-start.expected.json
```
