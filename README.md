# ADHDev Providers

> IDE, CLI, Extension, and ACP provider definitions for [ADHDev](https://github.com/vilmire/adhdev).

## Structure

```
├── ide/            — IDE providers (Cursor, Antigravity, Windsurf, Kiro, etc.)
├── cli/            — CLI agent providers (Gemini CLI, Claude Code, Codex CLI)
├── extension/      — VS Code extension providers (Cline, Roo Code)
├── acp/            — ACP agent providers (35 agents)
├── registry.json   — Auto-generated provider index (used by daemon)
├── validate.js     — Provider schema validator
├── CONTRIBUTING.md — How to add a new provider
└── COMPATIBILITY.md — OS/version compatibility matrix
```

## Provider Format

Each provider consists of:

```
ide/my-ide/
  provider.json              ← Metadata + version compatibility
  scripts/
    1.0/                     ← Scripts for IDE version 1.0.x
      scripts.js             ← Main scripts entry point
      set_model.js           ← Individual script files
      set_mode.js
    0.9/                     ← Scripts for IDE version 0.9.x
      scripts.js
```

### provider.json

```json
{
  "type": "my-ide",
  "name": "My IDE",
  "category": "ide",
  "providerVersion": "1.0.0",
  "versionCommand": "my-ide --version",
  "compatibility": [
    { "ideVersion": ">=1.0.0", "scriptDir": "scripts/1.0" },
    { "ideVersion": ">=0.9.0", "scriptDir": "scripts/0.9" }
  ],
  "defaultScriptDir": "scripts/1.0",
  "cdpPorts": [9357, 9358],
  "processNames": { "darwin": "My IDE" }
}
```

### Version Resolution

When the daemon starts:
1. Detects installed IDE version (`versionCommand`)
2. Matches against `compatibility` array (first match wins)
3. Loads scripts from the matched `scriptDir`
4. If no match → uses `defaultScriptDir` + shows warning

## Adding a New Provider

1. Create `provider.json` in the appropriate category
2. Create version-specific script directories
3. Validate: `node validate.js ide/my-ide/provider.json`
4. Submit a PR

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full workflow.

## How It Works

This repository is consumed by ADHDev in three ways:

| Method | When | Directory |
|--------|------|-----------|
| **Bundled** | `npm install -g adhdev` | `_builtin/` (offline fallback) |
| **Auto-updated** | Every daemon start | `~/.adhdev/providers/.upstream/` |
| **User custom** | Manual | `~/.adhdev/providers/` (never overwritten) |

Loading priority: **User custom > Auto-updated > Bundled**

### registry.json

Auto-generated index of all providers. Contains:
- Provider type, name, category
- `providerVersion` (for incremental update checks)
- `compatibility` matrix (which IDE versions → which scripts)

Updated automatically by GitHub Actions on every push.

## Supporting a New IDE Version

When an IDE releases a new version with DOM changes:

1. Create a new script directory:
   ```bash
   mkdir -p ide/my-ide/scripts/1.1
   ```

2. Copy from the previous version and modify:
   ```bash
   cp -r ide/my-ide/scripts/1.0/* ide/my-ide/scripts/1.1/
   # Edit scripts to match new DOM structure
   ```

3. Update `provider.json`:
   ```json
   "compatibility": [
     { "ideVersion": ">=1.1.0", "scriptDir": "scripts/1.1" },
     { "ideVersion": ">=1.0.0", "scriptDir": "scripts/1.0" }
   ],
   "defaultScriptDir": "scripts/1.1"
   ```

4. Submit a PR. `registry.json` is auto-regenerated.

## License

MIT
