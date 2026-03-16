# ADHDev Providers

> IDE, CLI, Extension, ACP provider definitions for [ADHDev](https://github.com/vilmire/adhdev)

## Structure

```
├── ide/            — IDE providers (Cursor, Windsurf, Antigravity, etc.)
├── cli/            — CLI agent providers (Gemini CLI, Claude Code, Codex CLI)
├── extension/      — VS Code extension providers (Cline, Roo Code)
├── acp/            — ACP agent providers (40+ agents)
└── _helpers/       — Shared utility functions
```

## Adding a New Provider

Create a `provider.js` file in the appropriate category directory:

```
ide/my-ide/provider.js
cli/my-cli/provider.js
acp/my-agent/provider.js
```

See [PROVIDER_GUIDE.md](https://github.com/vilmire/adhdev/blob/main/docs/PROVIDER_GUIDE.md) for the full guide.

## Usage

This repository is used by ADHDev in two ways:

1. **Git Submodule** — included in the main ADHDev repo during development
2. **Runtime Download** — daemon fetches the latest tarball to `~/.adhdev/providers/`

## License

MIT
