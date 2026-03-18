# ADHDev Provider Compatibility Matrix

> **Last updated:** 2026-03-18  
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
| `vscode-insiders` | VS Code Insiders | ❓ | ❓ | ❓ | | Detection only (no scripts) |
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
| `vscode-insiders` | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ |
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
| `roo-code` | Roo Code | ❓ | ❓ | ❓ | | |

### Script Methods — Extension

| Provider | readChat | sendMessage | openPanel | listSessions | switchSession | newSession | listModels | setModel | listModes | setMode | resolveAction | focusEditor |
|----------|----------|-------------|-----------|--------------|---------------|------------|------------|----------|-----------|---------|---------------|-------------|
| `cline` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `roo-code` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## CLI Providers

> Terminal-based agents spawned as child processes, controlled via PTY.

### OS Compatibility

| Provider | Display Name | macOS | Windows | Linux | Tested Versions | Notes |
|----------|-------------|-------|---------|-------|-----------------|-------|
| `claude-cli` | Claude Code | ❓ | ❓ | ❓ | | |
| `codex-cli` | Codex CLI | ❓ | ❓ | ❓ | | |
| `gemini-cli` | Gemini CLI | ❓ | ❓ | ❓ | | |

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

| Operation | ACP Method | Description |
|-----------|-----------|-------------|
| `initialize` | `initialize` | Handshake and capability negotiation |
| `new_session` | `sessions/new` | Create a new agent session |
| `prompt` | `sessions/prompt` | Send a prompt and stream response |
| `list_sessions` | `sessions/list` | List active sessions |
| `cancel` | `sessions/cancel` | Cancel an in-progress prompt |

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
