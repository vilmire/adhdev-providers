# ADHDev Provider Compatibility Matrix

> **Last updated:** 2026-04-09  
> **How to contribute:** Submit a PR updating the status for your OS/version. See [Status Legend](#status-legend) below.

This file is the evidence layer. Built-in registry presence alone is not enough to claim support.

- Default assumption: every provider is `unverified`
- Promotion to `partial` or `verified` requires explicit evidence here
- When in doubt, stay conservative and record caveats rather than upgrading a provider prematurely

## Promotion Record Checklist

Every promotion should include the same evidence fields:

- tested OS
- tested provider version
- validated flows
- last validation date
- caveats or setup requirements
- evidence source such as a PR, issue, or test log

Promote to `⚠️ Partial` first when only a narrower slice is verified.

## Suggested First Promotion Queue

If you want to help widen support methodically, start here:

1. `cursor`
2. `codex-cli`
3. `cursor-acp`

These three cover the main runtime shapes that ADHDev needs to prove out first.

### Candidate Checklist: `cursor`

- OS tested
- Cursor app version
- `detect`
- `launch`
- `read_chat`
- `send_chat`
- `list_sessions`
- `switch_session`
- `new_session`
- `list_models`
- `set_model`
- `list_modes`
- `set_mode`
- `resolve_action`
- caveats recorded
- evidence source linked

### Candidate Checklist: `codex-cli`

- OS tested
- Codex CLI version
- `launch`
- `send_chat`
- `read_chat`
- `resume`
- `reconnect`
- `stop`
- saved-session behavior recorded
- caveats recorded
- evidence source linked

### Candidate Checklist: `cursor-acp`

- OS tested
- Cursor ACP version
- `launch`
- `send_chat`
- `read_chat`
- `resolve_action`
- `list_models`
- `set_model`
- `list_modes`
- `set_mode`
- `stop`
- approval behavior recorded
- caveats recorded
- evidence source linked

## Status Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Tested & working |
| ⚠️ | Partial — works with known issues (add note) |
| ❌ | Tested & not working |
| ➖ | Not applicable (tool doesn't exist on this OS) |
| ❓ | Untested — **needs volunteer** |

---

## IDE Providers

> Detected via process scanning + controlled via CDP (Chrome DevTools Protocol).

### OS Compatibility

| Provider | Display Name | macOS | Windows | Linux | Tested Versions | Notes |
|----------|-------------|-------|---------|-------|-----------------|-------|
| `antigravity` | Antigravity | ❓ | ❓ | ❓ | Antigravity `1.22.2` | Local smoke check validated read/list only; fresh new-session send/read still inconclusive |
| `cursor` | Cursor | ⚠️ | ❓ | ❓ | Cursor `3.0.13` | macOS partial: detect, launch, fresh new-session send/read, list/switch session, model listing, and mode listing validated; the tested build currently exposes only Auto and approvals remain unverified |
| `kiro` | Kiro | ❓ | ❓ | ❓ | | |
| `pearai` | PearAI | ❓ | ❓ | ❓ | | |
| `trae` | Trae | ❓ | ❓ | ❓ | | |
| `vscode` | Visual Studio Code | ❓ | ❓ | ❓ | | Detection only (no scripts) |
| `vscodium` | VSCodium | ❓ | ❓ | ❓ | | Detection only (no scripts) |
| `windsurf` | Windsurf | ❓ | ❓ | ❓ | | |

### Script Methods — IDE

| Provider | readChat | sendMessage | openPanel | listSessions | switchSession | newSession | listModels | setModel | listModes | setMode | resolveAction | focusEditor |
|----------|----------|-------------|-----------|--------------|---------------|------------|------------|----------|-----------|---------|---------------|-------------|
| `antigravity` | ✅ | ✅ | ➖ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `cursor` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `kiro` | webview | webview | ✅ | webview | webview¹ | webview | webview | webview | webview | webview | ✅ | ✅ |
| `pearai` | webview | webview | ✅ | ✅/webview | webview¹ | ✅ | webview | webview | webview | webview | webview | ✅ |
| `trae` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `vscode` | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ |
| `vscodium` | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ |
| `windsurf` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

> ¹ `webview` = method operates via webview bridge (internal iframe communication), not direct DOM.  
> `➖` = detection only, no AI chat integration scripts.

---

## Extension Providers

> VS Code extensions detected inside IDE instances, controlled via CDP within the host IDE.

### OS Compatibility

| Provider | Display Name | macOS | Windows | Linux | Tested Versions | Notes |
|----------|-------------|-------|---------|-------|-----------------|-------|
| `cline` | Cline | ❓ | ❓ | ❓ | | |
| `codex` | Codex | ⚠️ | ❓ | ❓ | openai.chatgpt `26.406.31014` | macOS partial: Cursor-hosted Codex now has locale-agnostic read/list/switch handling, approve-path resolve_action, and transcript cleanup for localized timestamps plus stale replay turns; recent-task history can still collapse to the current chat and some send attempts still fail to materialize as a real turn |
| `roo-code` | Roo Code | ❓ | ❓ | ❓ | | |

### Script Methods — Extension

| Provider | readChat | sendMessage | openPanel | listSessions | switchSession | newSession | listModels | setModel | listModes | setMode | resolveAction | focusEditor |
|----------|----------|-------------|-----------|--------------|---------------|------------|------------|----------|-----------|---------|---------------|-------------|
| `cline` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `codex` | ✅ | ✅ | ➖ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ➖ |
| `roo-code` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## CLI Providers

> Terminal-based agents spawned as child processes, controlled via PTY.

### OS Compatibility

| Provider | Display Name | macOS | Windows | Linux | Tested Versions | Notes |
|----------|-------------|-------|---------|-------|-----------------|-------|
| `aider-cli` | Aider | ❓ | ❓ | ❓ | | |
| `claude-cli` | Claude Code | ⚠️ | ❓ | ❓ | Claude Code `2.1.84` | macOS partial: launch, saved-session listing, resume launch, daemon-restart reconnect, stop, and live readback validated; short exact-answer prompt-echo trimming was fixed during validation |
| `codex-cli` | Codex CLI | ⚠️ | ❓ | ❓ | Codex CLI `0.118.0` | macOS partial: fresh launch, live send/read, saved-session resume, daemon-restart reconnect, and stop validated after tightening onboarding-screen parsing, provider-session recovery, and history replay dedupe; older polluted transcripts may need one-time compaction |
| `cursor-cli` | Cursor CLI | ❓ | ❓ | ❓ | | |
| `gemini-cli` | Gemini CLI | ❓ | ❓ | ❓ | | |
| `github-copilot-cli` | GitHub Copilot CLI | ❓ | ❓ | ❓ | | |
| `goose-cli` | Goose | ❓ | ❓ | ❓ | | |
| `opencode-cli` | OpenCode CLI | ❓ | ❓ | ❓ | | |

### Supported Operations — CLI

| Operation | Description | All CLI Providers |
|-----------|-------------|-------------------|
| `spawn` | Start agent process in PTY | ✅ |
| `input` | Send text/command to stdin | ✅ |
| `output` | Read stdout/stderr stream | ✅ |
| `resize` | Resize terminal (cols/rows) | ✅ |
| `kill` | Terminate process | ✅ |

### Saved Session / Resume Support — CLI

> Scope: whether the CLI itself supports resuming a specific saved conversation, and whether ADHDev can recover the provider session ID automatically for dashboard resume/history.

| Provider | CLI resume by explicit session ID | New session ID strategy | When session ID becomes available | ADHDev extraction status | Tested On | Notes |
|----------|-----------------------------------|--------------------------|-----------------------------------|--------------------------|-----------|-------|
| `claude-cli` | ✅ | CLI accepts caller-supplied ID via `--session-id <uuid>` | Immediately at launch | ✅ Full | macOS, Claude Code `v2.1.84` | Best-case path: start with explicit ID, resume with `--resume <uuid>` |
| `goose-cli` | ✅ | CLI generates ID internally | Immediately after TUI startup | ✅ Full | macOS, Goose `v1.28.0` | `--session-id` is valid only with `--resume`; ADHDev extracts generated ID from Goose UI / local session DB |
| `codex-cli` | ✅ | CLI generates ID internally | After first user turn creates thread | ✅ Partial-immediate | macOS, Codex CLI `v0.118.0` | TUI launch alone may not create a saved thread; ADHDev promotes ID after first message via `~/.codex/state_5.sqlite` |
| `opencode-cli` | ✅ | CLI generates ID internally | After first user turn creates session | ✅ Partial-immediate | macOS, OpenCode `v1.3.14` | TUI launch alone does not create `ses_...`; ADHDev promotes ID after first message via `~/.local/share/opencode/opencode.db` |
| `gemini-cli` | ⚠️ Limited | No explicit saved-session ID flow verified | Unverified | ❌ Not supported | macOS, Gemini CLI `v0.35.3` | `--resume latest|index` exists, but specific saved-session resume was not verified and testing was blocked by `429 Too Many Requests` |
| `aider-cli` | ❌ | N/A | N/A | ❌ Not supported | macOS, Aider `v0.86.2` | History-file continuation exists, but not CLI-native saved-session resume by provider session ID |

#### Notes

- `Full` means ADHDev can preserve one provider conversation across restarts and re-open it from saved-session history without waiting for a first turn.
- `Partial-immediate` means the provider session ID is not available at bare TUI startup, but ADHDev promotes it automatically as soon as the provider creates a real saved conversation.
- On macOS, some CLIs normalize `/tmp/...` to `/private/tmp/...`; ADHDev now resolves both paths when probing provider-local session stores.

---

## ACP Providers

> Agent Client Protocol agents spawned as subprocesses, communicating via JSON-RPC over stdio.

### OS Compatibility

| Provider | Display Name | macOS | Windows | Linux | Tested Versions | Notes |
|----------|-------------|-------|---------|-------|-----------------|-------|
| `agentpool` | AgentPool | ❓ | ❓ | ❓ | | |
| `amp` | Amp (Sourcegraph) | ❓ | ❓ | ❓ | | |
| `auggie` | Auggie (Augment Code) | ❓ | ❓ | ❓ | | |
| `autodev` | AutoDev | ❓ | ❓ | ❓ | | |
| `autohand` | Autohand Code | ❓ | ❓ | ❓ | | |
| `blackbox-ai` | Blackbox AI | ❓ | ❓ | ❓ | | |
| `claude-agent` | Claude Code (ACP) | ❓ | ❓ | ❓ | | |
| `cline-acp` | Cline (ACP) | ❓ | ❓ | ❓ | | |
| `codebuddy` | Codebuddy Code | ❓ | ❓ | ❓ | | |
| `codex-cli` | Codex CLI (ACP) | ❓ | ❓ | ❓ | | |
| `corust-agent` | Corust Agent | ❓ | ❓ | ❓ | | |
| `crow-cli` | crow-cli | ❓ | ❓ | ❓ | | |
| `cursor-acp` | Cursor (ACP) | ⚠️ | ❓ | ❓ | cursor-agent `2026.03.25-933d5a6` | macOS partial: launch, send/read chat, approval, model/mode changes, and stop validated; reconnect and resume still unverified |
| `deepagents` | Deep Agents | ❓ | ❓ | ❓ | | |
| `dimcode` | DimCode | ❓ | ❓ | ❓ | | |
| `docker-cagent` | Docker cagent | ❓ | ❓ | ❓ | | |
| `factory-droid` | Factory AI Droids | ❓ | ❓ | ❓ | | |
| `fast-agent` | fast-agent | ❓ | ❓ | ❓ | | |
| `gemini-cli` | Gemini CLI (ACP) | ❓ | ❓ | ❓ | | |
| `github-copilot` | GitHub Copilot | ❓ | ❓ | ❓ | | |
| `goose` | Goose | ❓ | ❓ | ❓ | | |
| `junie` | Junie (JetBrains) | ❓ | ❓ | ❓ | | |
| `kilo` | Kilo Code | ❓ | ❓ | ❓ | | |
| `kimi-cli` | Kimi Code CLI | ❓ | ❓ | ❓ | | |
| `minion-code` | Minion Code | ❓ | ❓ | ❓ | | |
| `mistral-vibe` | Mistral Vibe CLI | ❓ | ❓ | ❓ | | |
| `nova` | Nova | ❓ | ❓ | ❓ | | |
| `openclaw` | OpenClaw | ❓ | ❓ | ❓ | | Requires running Gateway |
| `opencode` | OpenCode | ❓ | ❓ | ❓ | | |
| `openhands` | OpenHands | ❓ | ❓ | ❓ | | |
| `pi-acp` | pi | ❓ | ❓ | ❓ | | |
| `qoder` | Qoder CLI | ❓ | ❓ | ❓ | | |
| `qwen-code` | Qwen Code | ❓ | ❓ | ❓ | | |
| `stakpak` | Stakpak | ❓ | ❓ | ❓ | | |
| `vtcode` | VT Code | ❓ | ❓ | ❓ | | |

### Supported Operations — ACP

**Client → Agent (Editor sends to Agent)**

| Method | Description | Required |
|--------|-------------|----------|
| `initialize` | Handshake, version negotiation, capability exchange | ✅ Required |
| `authenticate` | Token/password auth if agent requires it | Optional |
| `session/new` | Create a new conversation session | ✅ Required |
| `session/prompt` | Send user message with context (files, images) | ✅ Required |
| `session/load` | Resume an existing session | Optional |
| `session/set_mode` | Switch agent operating mode | Optional |
| `session/cancel` | Abort an in-progress prompt (notification) | ✅ Required |

**Agent → Client (Agent requests from Editor)**

| Method | Description | Required |
|--------|-------------|----------|
| `session/update` | Stream progress, messages, tool calls (notification) | ✅ Required |
| `session/request_permission` | Ask user approval for an action | Optional |
| `fs/read_text_file` | Read file content including unsaved edits | Optional |
| `fs/write_text_file` | Write or create a file | Optional |
| `terminal/create` | Start a shell command | Optional |
| `terminal/output` | Provide command output | Optional |
| `terminal/wait_for_exit` | Wait for command completion | Optional |
| `terminal/kill` | Terminate a running command | Optional |
| `terminal/release` | Clean up a terminal | Optional |

---

## How to Test & Report

### 1. Run the test

```bash
# Start the installed daemon directly
adhdev-standalone

# Or run from source
node packages/daemon-standalone/dist/index.js
```

### 2. Verify in the dashboard
- Open `http://localhost:3847`
- Check if the provider is detected
- Test: read_chat, send_chat, screenshot (IDE/Extension)
- Test: spawn, input, output (CLI/ACP)

### 3. Submit your result
Fork this repo, update the table above with your result, and submit a PR with:

```
Provider: <provider-id>
OS: <macOS 15.x / Windows 11 / Ubuntu 24.04 / etc>
Provider Version: <e.g. Cursor 0.48>
Status: ✅ / ⚠️ / ❌
Notes: <any issues encountered>
```

Also include the exact flows you validated, for example:

```
Flows tested:
- launch
- send/read chat
- approval handling
- model switch
- mode switch
- reconnect
Known gaps:
- set_mode fails after layout change in v1.2.x
```

### PR Title Format
```
compat: <provider-id> <os> <status>
```
Example: `compat: cursor macOS ✅`

---

## Version-Specific Notes

<!--
Add version-specific compatibility notes here as they are discovered.
Example:

### Cursor
| Version | macOS | Windows | Linux | Notes |
|---------|-------|---------|-------|-------|
| 0.48.x | ✅ | ❓ | ❓ | |
| 0.47.x | ⚠️ | ❓ | ❓ | CDP port changed |
-->

_No version-specific notes yet. Submit a PR to add yours!_
