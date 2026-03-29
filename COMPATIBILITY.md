# ADHDev Provider Compatibility Matrix

> **Last updated:** 2026-03-22  
> **How to contribute:** Submit a PR updating the status for your OS/version. See [Status Legend](#status-legend) below.

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
| `antigravity` | Antigravity | ❓ | ❓ | ❓ | | |
| `cursor` | Cursor | ❓ | ❓ | ❓ | | |
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
| `codex` | Codex | ❓ | ❓ | ❓ | | |
| `roo-code` | Roo Code | ❓ | ❓ | ❓ | | |

### Script Methods — Extension

| Provider | readChat | sendMessage | openPanel | listSessions | switchSession | newSession | listModels | setModel | listModes | setMode | resolveAction | focusEditor |
|----------|----------|-------------|-----------|--------------|---------------|------------|------------|----------|-----------|---------|---------------|-------------|
| `cline` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `codex` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `roo-code` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## CLI Providers

> Terminal-based agents spawned as child processes, controlled via PTY.

### OS Compatibility

| Provider | Display Name | macOS | Windows | Linux | Tested Versions | Notes |
|----------|-------------|-------|---------|-------|-----------------|-------|
| `aider-cli` | Aider | ❓ | ❓ | ❓ | | |
| `claude-cli` | Claude Code | ❓ | ❓ | ❓ | | |
| `codex-cli` | Codex CLI | ❓ | ❓ | ❓ | | |
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
| `blackbox-ai` | Blackbox AI | ❓ | ❓ | ❓ | | |
| `claude-agent` | Claude Code (ACP) | ❓ | ❓ | ❓ | | |
| `cline-acp` | Cline (ACP) | ❓ | ❓ | ❓ | | |
| `codex-cli` | Codex CLI (ACP) | ❓ | ❓ | ❓ | | |
| `corust-agent` | Corust Agent | ❓ | ❓ | ❓ | | |
| `cursor-acp` | Cursor (ACP) | ❓ | ❓ | ❓ | | |
| `deepagents` | Deep Agents | ❓ | ❓ | ❓ | | |
| `docker-cagent` | Docker cagent | ❓ | ❓ | ❓ | | |
| `factory-droid` | Factory AI Droids | ❓ | ❓ | ❓ | | |
| `fast-agent` | fast-agent | ❓ | ❓ | ❓ | | |
| `gemini-cli` | Gemini CLI (ACP) | ❓ | ❓ | ❓ | | |
| `github-copilot` | GitHub Copilot | ❓ | ❓ | ❓ | | |
| `goose` | Goose | ❓ | ❓ | ❓ | | |
| `junie` | Junie (JetBrains) | ❓ | ❓ | ❓ | | |
| `kilo` | Kilo Code | ❓ | ❓ | ❓ | | |
| `kimi-cli` | Kimi Code CLI | ❓ | ❓ | ❓ | | |
| `mistral-vibe` | Mistral Vibe CLI | ❓ | ❓ | ❓ | | |
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
# Start the daemon
adhdev daemon

# Or standalone mode
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
