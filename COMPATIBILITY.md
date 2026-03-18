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

| Provider | Display Name | macOS | Windows | Linux | Tested Versions | Notes |
|----------|-------------|-------|---------|-------|-----------------|-------|
| `antigravity` | Antigravity | ❓ | ❓ | ❓ | | |
| `cursor` | Cursor | ❓ | ❓ | ❓ | | |
| `kiro` | Kiro | ❓ | ❓ | ❓ | | |
| `pearai` | PearAI | ❓ | ❓ | ❓ | | |
| `trae` | Trae | ❓ | ❓ | ❓ | | |
| `vscode` | Visual Studio Code | ❓ | ❓ | ❓ | | |
| `vscode-insiders` | VS Code Insiders | ❓ | ❓ | ❓ | | |
| `vscodium` | VSCodium | ❓ | ❓ | ❓ | | |
| `windsurf` | Windsurf | ❓ | ❓ | ❓ | | |

---

## Extension Providers

> VS Code extensions detected inside IDE instances, controlled via CDP within the host IDE.

| Provider | Display Name | macOS | Windows | Linux | Tested Versions | Notes |
|----------|-------------|-------|---------|-------|-----------------|-------|
| `cline` | Cline | ❓ | ❓ | ❓ | | |
| `roo-code` | Roo Code | ❓ | ❓ | ❓ | | |

---

## CLI Providers

> Terminal-based agents spawned as child processes, controlled via PTY.

| Provider | Display Name | macOS | Windows | Linux | Tested Versions | Notes |
|----------|-------------|-------|---------|-------|-----------------|-------|
| `claude-cli` | Claude Code | ❓ | ❓ | ❓ | | |
| `codex-cli` | Codex CLI | ❓ | ❓ | ❓ | | |
| `gemini-cli` | Gemini CLI | ❓ | ❓ | ❓ | | |

---

## ACP Providers

> Agent Client Protocol agents spawned as subprocesses, communicating via JSON-RPC over stdio.

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
