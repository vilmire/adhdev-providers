# Hermes CLI provider tuning notes

This provider is more sensitive than average to small TUI changes because Hermes can keep the prompt marker visible while a turn is still actively generating.

## What was fixed

The current `scripts/1.0/detect_status.js` now treats these as stronger generating signals than the bare `❯` prompt:

- `Initializing agent`
- `reasoning`
- `Enter to interrupt, Ctrl+C to cancel`

This matters because a visible `❯` does not always mean the turn is actually idle.

## User-facing alert controls

These controls already exist in `provider.json` and can be changed from ADHDev settings:

- `approvalAlert`
  - enable/disable approval-needed notifications
- `longGeneratingAlert`
  - enable/disable long-running generation notifications
- `longGeneratingThresholdSec`
  - how long a turn can appear stuck before the long-generation alert fires

If Hermes is noisy but status detection is otherwise correct, lower noise here first before editing parser code.

## When to customize detection

Customize the status scripts only when the dashboard is clearly misreading Hermes runtime state, for example:

- generation is still happening but ADHDev reports `idle`
- completion notifications fire before the answer is actually done
- approval prompts are visible but ADHDev does not enter `waiting_approval`

## Recommended local override workflow

Do not edit the downloaded upstream copy directly.

Use a user override so your changes survive upstream refreshes:

```bash
mkdir -p ~/.adhdev/providers/cli/hermes-cli
rsync -a /Users/vilmire/Work/adhdev_public/adhdev-providers/cli/hermes-cli/ ~/.adhdev/providers/cli/hermes-cli/
```

Then edit the local override files, usually:

- `~/.adhdev/providers/cli/hermes-cli/scripts/1.0/detect_status.js`
- `~/.adhdev/providers/cli/hermes-cli/scripts/1.0/parse_approval.js`
- `~/.adhdev/providers/cli/hermes-cli/scripts/1.0/parse_output.js`

After editing, reload/restart the daemon so the provider is reloaded.

## Practical tuning guidance

### If you get false completion notifications

Check whether the live screen still contains generating markers such as:

- `reasoning`
- `Enter to interrupt, Ctrl+C to cancel`
- any other spinner/progress text added by newer Hermes builds

If yes, add that marker to `detect_status.js` as a generating signal.

### If Hermes changed its approval UI

Update `parse_approval.js` so the current button labels and prompt text are recognized.

### If transcript content is wrong but status is right

Leave `detect_status.js` alone and adjust `parse_output.js` instead.

## Minimal verification loop

From the provider repo:

```bash
node --test tests/hermes-cli-detect-status.test.js
node validate.js cli/hermes-cli/provider.json
```

For a live runtime check from the main repo:

```bash
python3 scripts/verify_cli_provider.py hermes-cli --timeout 120
```

## Scope reminder

- `detect_status.js` controls state transitions and notifications
- `parse_output.js` controls transcript extraction
- `parse_approval.js` controls approval modal detection

Change the smallest layer that matches the symptom.
