# ADHDev Providers

> IDE, CLI, Extension, and ACP provider definitions for [ADHDev](https://github.com/vilmire/adhdev).

## Structure

```
├── ide/            — IDE providers (Cursor, Windsurf, Kiro, PearAI, etc.)
├── cli/            — CLI agent providers (Gemini CLI, Claude Code, Codex CLI)
├── extension/      — VS Code extension providers (Cline, Roo Code)
├── acp/            — ACP agent providers (40+ agents)
├── _helpers/       — Shared utility functions
├── validate.js     — Provider schema validator
└── CONTRIBUTING.md — How to add a new provider
```

## Adding a New Provider

1. Create `provider.js` in the appropriate category:

```bash
mkdir -p ide/my-ide
# Edit ide/my-ide/provider.js
```

2. Validate:

```bash
node validate.js ide/my-ide/provider.js
```

3. Submit a PR.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full workflow, and  
[PROVIDER_GUIDE.md](https://github.com/vilmire/adhdev/blob/main/docs/PROVIDER_GUIDE.md) for the complete specification.

## How It Works

This repository is consumed by ADHDev in three ways:

| Method | When | Directory |
|--------|------|-----------|
| **Bundled** | `npm install -g adhdev` | `_builtin/` (offline fallback) |
| **Auto-updated** | Every daemon start | `~/.adhdev/providers/.upstream/` |
| **User custom** | Manual | `~/.adhdev/providers/` (never overwritten) |

Loading priority: **User custom > Auto-updated > Bundled**

## License

MIT
