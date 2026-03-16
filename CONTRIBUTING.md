# Contributing to ADHDev Providers

> How to add new providers or improve existing ones for ADHDev.

## Quick Start

### 1. Fork & Clone

```bash
git clone https://github.com/YOUR_USERNAME/adhdev-providers.git
cd adhdev-providers
```

### 2. Create a Provider

Create a `provider.js` in the appropriate category directory:

```bash
# IDE provider
mkdir -p ide/my-ide && touch ide/my-ide/provider.js

# CLI agent
mkdir -p cli/my-cli && touch cli/my-cli/provider.js

# ACP agent
mkdir -p acp/my-agent && touch acp/my-agent/provider.js

# VS Code extension
mkdir -p extension/my-ext && touch extension/my-ext/provider.js
```

### 3. Provider Structure

```javascript
module.exports = {
  type: 'my-ide',           // unique identifier (must not conflict)
  name: 'My IDE',           // display name
  category: 'ide',          // 'ide' | 'extension' | 'cli' | 'acp'
  displayName: 'My IDE',
  icon: '🔧',

  // IDE: CDP configuration
  cdpPorts: [9357, 9358],   // use next available ports (see table below)
  cli: 'my-ide',
  paths: { darwin: ['/Applications/My IDE.app'] },

  // CDP scripts
  scripts: {
    readChat() { return `(() => { /* ... */ })()`; },
    sendMessage(text) { return `(() => { /* ... */ })()`; },
  },
};
```

> 📖 Full guide: [PROVIDER_GUIDE.md](https://github.com/vilmire/adhdev/blob/main/docs/PROVIDER_GUIDE.md)

### 4. Validate

```bash
# Syntax check
node -c ide/my-ide/provider.js

# Schema validation (required fields, port conflicts, etc.)
node validate.js ide/my-ide/provider.js

# Validate all providers
node validate.js
```

### 5. Local Testing

```bash
# If ADHDev is installed:
# Copy your provider to the user directory for instant loading
mkdir -p ~/.adhdev/providers/ide/my-ide
cp ide/my-ide/provider.js ~/.adhdev/providers/ide/my-ide/

# Restart daemon to pick up changes
adhdev daemon:restart

# Test scripts via DevConsole
# Open http://127.0.0.1:19280 → IDE tab → Scripts → Run
```

### 6. Submit PR

```bash
git checkout -b feat/add-my-ide
git add -A
git commit -m "feat: add My IDE provider"
git push origin feat/add-my-ide
# Open a Pull Request on GitHub
```

---

## PR Checklist

- [ ] `node validate.js` passes with no errors
- [ ] `type` does not conflict with existing providers
- [ ] CDP ports do not overlap with existing ones (for IDE providers)
- [ ] At least `readChat` + `sendMessage` scripts implemented
- [ ] Tested via DevConsole (if ADHDev is available)

---

## Reference Implementations

| Category | Reference | Key Features |
|----------|-----------|-------------|
| **IDE (mainframe)** | `ide/cursor/provider.js` | CDP evaluate, `inputMethod` |
| **IDE (webview)** | `ide/kiro/provider.js` | `webviewMatchText`, `webview*` scripts |
| **CLI** | `cli/gemini-cli/provider.js` | `aliases`, spawn config |
| **ACP** | `acp/gemini-cli/provider.js` | `auth`, `spawn`, `settings` |
| **Extension** | `extension/cline/provider.js` | `extensionIdPattern`, webview |

---

## CDP Port Registry

| Port | Provider |
|------|----------|
| 9333–9334 | Cursor |
| 9335–9336 | Antigravity |
| 9337–9338 | Windsurf |
| 9339–9340 | VS Code |
| 9341–9342 | VS Code Insiders |
| 9343–9344 | VSCodium |
| 9351–9352 | Kiro |
| 9353–9354 | Trae |
| 9355–9356 | PearAI |

**Next available: 9357+**

---

## Need Help?

- Full provider guide: [PROVIDER_GUIDE.md](https://github.com/vilmire/adhdev/blob/main/docs/PROVIDER_GUIDE.md)
- DOM exploration tips: PROVIDER_GUIDE.md §6
- DevConsole usage: PROVIDER_GUIDE.md §4
