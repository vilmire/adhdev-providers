# ADHDev Provider Creation Guide

> Complete guide for adding new IDE, Extension, CLI, and ACP providers to ADHDev.
> **Just create `provider.json` + `scripts.js` — no TypeScript modifications needed.**

---

## 🏗️ Provider Architecture

```
provider.js created (ide/cli/extension/acp)
    │
    ▼
ProviderLoader.loadAll()  ← 3-tier priority loading
    │
    ├─ 1. _builtin/           (npm bundle — offline fallback)
    ├─ 2. .upstream/           (GitHub auto-download — checked every 30min)
    └─ 3. ~/.adhdev/providers/ (user custom — highest priority, never auto-updated)
    │
    ├─ registerToDetector()  ← IDE: installation detection (paths, cli)
    ├─ getCdpPortMap()       ← IDE: CDP port auto-assignment
    ├─ getCliDetectionList() ← CLI/ACP: installation detection (spawn.command)
    ├─ resolveAlias()        ← alias resolution ('claude' → 'claude-cli')
    └─ fetchLatest()         ← GitHub tarball auto-download
```

### Loading Priority (later overrides earlier)

| Priority | Directory | Auto-update | Purpose |
|----------|-----------|-------------|---------|
| 1 (lowest) | `packages/daemon-core/providers/_builtin/` | npm update only | Offline fallback |
| 2 | `~/.adhdev/providers/.upstream/` | ✅ On daemon start | Latest GitHub providers |
| 3 (highest) | `~/.adhdev/providers/` (excl. _upstream) | ❌ **Never** | User custom |

### Auto-update Flow

```
adhdev daemon start
  ├─ loadAll() → builtin + .upstream + user custom loaded immediately
  └─ background: fetchLatest()
      ├─ HEAD request → ETag comparison
      ├─ no change → skip (zero network cost)
      └─ changed → download tarball → replace .upstream/ → reload()
```

> [!IMPORTANT]
> **User custom protection**: provider.js files you create directly in `~/.adhdev/providers/`
> are never auto-updated under any circumstances. Only `.upstream/` is auto-replaced,
> and user custom always takes priority.

---

## 📁 Directory Structure

```
providers/_builtin/ide/
├── cursor/              ← reference implementation
│   ├── provider.json    ← metadata (type, name, cdpPorts, etc.)
│   └── scripts.js       ← CDP scripts (readChat, sendMessage, etc.)
├── windsurf/            ← file-split script pattern
│   ├── provider.json
│   ├── scripts.js       ← loads from scripts/ folder
│   └── scripts/
│       ├── read_chat.js
│       ├── send_message.js
│       └── ...
├── antigravity/
│   ├── provider.json
│   └── scripts.js
├── vscode/
│   └── provider.json    ← infrastructure only (scripts not yet implemented)
└── [your-ide]/          ← new provider location
    ├── provider.json    ← required
    └── scripts.js       ← required for IDE/Extension, not needed for CLI/ACP
```

---

## 1️⃣ provider.js Basic Structure

> [!IMPORTANT]
> `provider.json` contains static metadata. `scripts.js` exports CDP script functions.
> Type definitions: see `contracts.ts` in the daemon-core source (`src/providers/contracts.ts`)

**provider.json:**
```json
{
  "type": "my-ide",
  "name": "My IDE",
  "category": "ide",
  "displayName": "My IDE",
  "icon": "🔧",
  "cli": "my-ide",
  "cdpPorts": [9357, 9358],
  "processNames": { "darwin": "My IDE" },
  "paths": { "darwin": ["/Applications/My IDE.app"] },
  "inputMethod": "cdp-type-and-send",
  "inputSelector": "[contenteditable=\"true\"][role=\"textbox\"]",
  "versionCommand": "my-ide --version",
  "testedVersions": ["1.0.0", "1.1.0"]
}
```

**scripts.js:**
```javascript
module.exports.readChat = function readChat(params) {
  return `(() => {
    // CDP JS code to extract chat messages
    return JSON.stringify({ id: 'active', status: 'idle', messages: [], inputContent: '' });
  })()`;
};

module.exports.sendMessage = function sendMessage(params) {
  const text = typeof params === 'string' ? params : params?.message;
  return `(() => {
    return JSON.stringify({ sent: false, needsTypeAndSend: true, selector: '[contenteditable]' });
  })()`;
};
// ... more scripts
```

### CDP Ports Already In Use

| Port | Provider |
|------|----------|
| 9333-9334 | Cursor |
| 9335-9336 | Antigravity |
| 9337-9338 | Windsurf |
| 9339-9340 | VS Code |
| 9343-9344 | VSCodium |
| 9351-9352 | Kiro |
| 9353-9354 | Trae |
| 9355-9356 | PearAI |

> [!WARNING]
> When adding a new provider, **avoid overlapping with existing ports** — use 9357 and above.

### aliases Field

Defining `aliases` enables usage in `adhdev launch <alias>` etc.
No need to add alias maps in TypeScript code — just declare in provider.js.

```javascript
// CLI example
module.exports = {
  type: 'claude-cli',
  aliases: ['claude', 'claude-code'],  // adhdev launch claude → resolves to claude-cli
  // ...
};

// IDE example (optional)
module.exports = {
  type: 'vscode',
  aliases: ['code', 'vs'],  // adhdev launch code → resolves to vscode
  // ...
};
```

---

## 2️⃣ Script Implementation — Two Patterns

### Pattern A: Inline (Cursor style)

Write directly inside `provider.js` using template literals.

```javascript
scripts: {
  readChat(params) {
    return `(() => {
  try {
    // ... CDP JS code ...
    return JSON.stringify({ id, status, messages, inputContent, activeModal });
  } catch(e) {
    return JSON.stringify({ id: '', status: 'error', messages: [] });
  }
})()`;
  },
}
```

**Pros:** Self-contained in one file, natural parameter substitution (`${JSON.stringify(text)}`)
**Cons:** Hard to manage when code grows long, no syntax highlighting

### Pattern B: File Separation (Windsurf style)

Place individual `.js` files in `scripts/` folder and load with `loadScript()`.

```javascript
const fs = require('fs');
const path = require('path');
const SCRIPTS_DIR = path.join(__dirname, 'scripts');

function loadScript(name) {
  try { return fs.readFileSync(path.join(SCRIPTS_DIR, name), 'utf8'); }
  catch { return null; }
}

// scripts object
scripts: {
  readChat() { return loadScript('read_chat.js'); },
  sendMessage(params) {
    const text = typeof params === 'string' ? params : params?.message;
    const s = loadScript('send_message.js');
    return s ? s.replace(/\$\{\s*MESSAGE\s*\}/g, JSON.stringify(text)) : null;
  },
}
```

**Pros:** Syntax highlighting, easy to edit/test individually in DevConsole
**Cons:** Requires file management, needs `${MESSAGE}` placeholder for parameter substitution

> [!TIP]
> For scripts under 30 lines, use **inline**; for longer scripts, use **file separation**.

---

## 3️⃣ Script Output Contract

All scripts **must return a JSON string**.
See `contracts.ts` (`src/providers/contracts.ts` in daemon-core) for reference.

### Core Scripts

#### readChat(params?) → `ReadChatResult`
```typescript
{
  id: string;              // session ID
  status: AgentStatus;     // 'idle' | 'generating' | 'waiting_approval' | 'error'
  messages: ChatMessage[]; // { role, content, index }
  title?: string;
  inputContent?: string;   // current input field text
  activeModal?: {          // pending approval modal
    message: string;
    buttons: string[];
  } | null;
}
```

#### sendMessage(params) → `SendMessageResult`
```typescript
{
  sent: boolean;
  error?: string;
  needsTypeAndSend?: boolean;  // true → daemon types via CDP Input API
  selector?: string;           // target selector when needsTypeAndSend
}
```

#### listSessions(params?) → `ListSessionsResult`
```typescript
{ sessions: [{ id: string, title: string, active?: boolean, index?: number }] }
```

#### switchSession(params) → `SwitchSessionResult`
```typescript
{ switched: boolean, error?: string, title?: string }
```

#### newSession(params?) → `{ created: boolean, error?: string }`

### UI Control Scripts

#### focusEditor(params?) → `string` (e.g., `'focused'`, `'not_found'`)
#### openPanel(params?) → `string` (e.g., `'visible'`, `'opened'`, `'not_found'`)

### Modal/Approval Scripts

#### resolveAction(params) — Two return methods

```typescript
// params: { action: 'approve'|'reject'|'custom', button?: string, buttonText?: string }
```

**Method 1: Script-Click** — script calls `el.click()` directly (Cursor etc.)

```js
// Cursor uses div.cursor-pointer elements, so direct click works
return JSON.stringify({ resolved: true, clicked: "Run⏎" });
return JSON.stringify({ resolved: false, available: ["Send", "Cancel"] });
```

**Method 2: Coordinate-Click** — return coordinates → daemon performs CDP mouse click (Antigravity etc.)

```js
// When el.click() doesn't propagate events properly, return coordinates
return JSON.stringify({ found: true, text: "Accept", x: 800, y: 450, w: 120, h: 32 });
return JSON.stringify({ found: false });
```

> [!IMPORTANT]
> Daemon processing order: `resolved: true` → success / `found: true` + `x,y` → CDP click / neither → fail

#### Approval Detection (waiting_approval in readChat)

Each IDE has different approval UI, so each provider's readChat must detect appropriately:

| IDE | Detection method |
|-----|-----------------|
| Cursor | `.run-command-review-active` CSS class + `div.cursor-pointer` buttons (`Run⏎`, `SkipEsc`) |
| Antigravity | `<button>` text matching (`Allow This Conversation`, `Deny` etc.) |
| Windsurf | Fiber props or button text |

> [!TIP]
> In Cursor 2.6.19+, approval buttons are `<div class="cursor-pointer">` not `<button>`,
> and button text includes keyboard shortcuts (e.g., `"Run⏎"`, `"SkipEsc"`).

#### listNotifications(params?) → `Array<{ index, message, severity, buttons }>`
#### dismissNotification(params) → `{ dismissed: boolean, error?: string }`

### Model / Mode Scripts

#### listModels(params?) → `{ models: string[], current: string }`
#### setModel(params) → `{ success: boolean, model?: string, error?: string }`
#### listModes(params?) → `{ modes: string[], current: string }`
#### setMode(params) → `{ success: boolean, mode?: string, error?: string }`

> [!NOTE]
> Webview-based IDEs (Kiro, PearAI) use `webviewListModels`, `webviewSetModel` etc. with webview prefix scripts.
> `handleExtensionScript` automatically prioritizes webview variants when they exist.


---

## 3½. Daemon Routing Logic — What provider.js Controls

> [!IMPORTANT]
> The daemon (daemon-commands.ts) **does not branch by IDE name.**
> All routing is determined by **properties and script return values** defined in provider.js.

### Automatic Routing by IDE Type

```
daemon receives command (readChat, sendMessage, etc.)
  │
  ├─ provider.category === 'cli' or 'acp'?
  │   └─ CLI/ACP adapter (stdin/stdout JSON-RPC)
  │
  ├─ provider.category === 'extension'?
  │   └─ AgentStream → webview iframe execution
  │
  └─ provider.category === 'ide'?
      │
      ├─ scripts.webviewReadChat exists?  (★ webview IDE)
      │   └─ evaluateInWebviewFrame() → JS runs inside webview iframe
      │   └─ provider.webviewMatchText matches correct iframe
      │
      └─ scripts.readChat only?  (★ mainframe IDE)
          └─ cdp.evaluate() → JS runs in mainframe
          └─ provider.inputMethod determines input method
```

### Mainframe IDE vs Webview IDE Differences

| Property | Mainframe (Cursor, Windsurf, Trae) | Webview (Kiro, PearAI) |
|----------|-------------------------------------|------------------------|
| `inputMethod` | `'cdp-type-and-send'` | none (handled in webview script) |
| `inputSelector` | `'[contenteditable="true"]...'` | none |
| `webviewMatchText` | none | `'Kiro'` etc. (iframe body match text) |
| Script names | `readChat`, `sendMessage` | `webviewReadChat`, `webviewSendMessage` |
| Execution context | IDE main frame DOM | webview iframe internal DOM |

### Creating a Mainframe IDE

```javascript
module.exports = {
  type: 'my-ide',
  category: 'ide',
  inputMethod: 'cdp-type-and-send',       // ← this determines mainframe mode
  inputSelector: '[contenteditable="true"][role="textbox"]',
  scripts: {
    readChat() { return `(() => { ... })()`; },
    sendMessage(text) {
      // needsTypeAndSend: true → daemon types via CDP into inputSelector
      return `(() => JSON.stringify({ sent: false, needsTypeAndSend: true }))()`;
    },
  },
};
```

### Creating a Webview IDE

```javascript
module.exports = {
  type: 'my-webview-ide',
  category: 'ide',
  webviewMatchText: 'MyWebviewApp',        // ← matches if iframe body contains this text
  // no inputMethod! handled directly inside webview
  scripts: {
    // webview prefix → auto-routed to evaluateInWebviewFrame()
    webviewReadChat() { return `(() => { ... })()`; },
    webviewSendMessage(text) { return `(() => { ... })()`; },
    webviewListSessions() { return `(() => { ... })()`; },

    // scripts to run in mainframe (open panel etc.)
    openPanel() { return `(() => { ... })()`; },
    focusEditor() { return `(() => { ... })()`; },
  },
};
```

### Daemon Behavior Based on sendMessage Return Values

| Return value | Daemon action |
|-------------|---------------|
| `{ sent: true }` | Done (script sent directly) |
| `{ sent: false, needsTypeAndSend: true }` | CDP type + Enter into `inputSelector` |
| `{ sent: false, needsTypeAndSend: true, selector: '...' }` | Type into specified selector |
| `{ sent: false, needsTypeAndSend: true, clickCoords: {x,y} }` | Click coordinates then type |

### Daemon Behavior Based on resolveAction Return Values

| Return value | Daemon action |
|-------------|---------------|
| `{ resolved: true }` | Done (script clicked directly) |
| `{ found: true, x, y, w, h }` | CDP mouse click (coordinate-based) |
| `{ resolved: false }` / `{ found: false }` | Failed |

> [!TIP]
> When adding a new IDE, **you don't need to read TS code.**
> Just set the correct properties in provider.js and the daemon automatically picks the right path.

---

## 4️⃣ Development Workflow (Using DevConsole)

### Step 1: Launch IDE in CDP Mode

```bash
# Example: Cursor
adhdev launch cursor --cdp

# Or re-launch existing IDE with CDP port
/Applications/MyIDE.app/Contents/MacOS/MyIDE --remote-debugging-port=9350
```

### Step 2: Open DevConsole

```bash
adhdev daemon --dev
# Open http://127.0.0.1:19280 in browser
```

### Step 3: DOM Exploration and Script Writing

1. **📸 Screenshot** button to capture current IDE screen
2. **CSS selector** input field to explore elements (`Query` button)
3. **🖥 Editor** tab to write CDP JS code → **▶ Run** for immediate testing
4. Copy tested code to `provider.js`

### Step 4: Using Script Edit Mode

1. **📜 Scripts ▾** dropdown → click script name → enter edit mode
2. Modify code → **▶ Run** to test directly and check Output
3. When satisfied → **💾 Save Script** button to save to `provider.js`

### Step 5: Scripts Requiring Parameters

- **⚙ params** button → enter JSON parameters → run
- Example: `sendMessage` with `{"text": "Hello"}`

---

## 5️⃣ Using _helpers (Optional)

`_helpers/index.js` (in the providers directory) provides common utilities you can use.

| Helper | Purpose |
|--------|---------|
| `getWebviewDoc(selector)` | Access Extension webview iframe document |
| `getFiber(selectors)` | Extract React Fiber data |
| `typeAndSubmit(varName, selectorExpr)` | Text input + Enter send |
| `waitFor(selector, timeout)` | Wait for element appearance |
| `htmlToMdCode()` | HTML → Markdown converter function declaration |
| `isNoiseText(text)` | Noise text filtering |

```javascript
const { htmlToMdCode, waitFor } = require('../../_helpers/index.js');

scripts: {
  readChat() {
    return `(async () => {
  ${htmlToMdCode()}
  ${waitFor('.chat-container')}
  // ...
})()`;
  },
}
```

> [!NOTE]
> Using helpers is **completely optional**. Each `provider.js` can be fully independent.

---

## 6️⃣ DOM Exploration Tips

### Common Patterns Across IDEs

Most VS Code-based IDEs share the following structure:

| Element | Selector pattern |
|---------|-----------------|
| Sidebar | `#workbench.parts.auxiliarybar` |
| Editor input | `[contenteditable="true"][role="textbox"]` |
| Notification toast | `.notifications-toasts .notification-toast` |
| Dialog | `.monaco-dialog-box, [role="dialog"]` |
| Action button | `a.action-label.codicon-*` |

### Status Detection Strategy

```
1. data-* attribute check (most stable)
   → Cursor: data-composer-status="streaming"

2. Fiber props exploration (React-based UI)
   → Windsurf: fiber.memoizedProps.isRunning

3. Stop button presence (universal)
   → button[aria-label*="stop"], text="Stop"

4. Placeholder text (fallback)
   → input placeholder contains "wait" / "generating"
```

---

## 7️⃣ Verification Checklist

After completing a new provider, verify all items below:

- [ ] `readChat` — returns message list correctly in idle state
- [ ] `readChat` — correctly detects generating status
- [ ] `readChat` — detects waiting_approval status (including modal button list)
- [ ] `sendMessage` — `needsTypeAndSend: true` return triggers normal daemon typing
- [ ] `listSessions` — session list (including title, active status)
- [ ] `switchSession` — switching based on index/title
- [ ] `newSession` — new chat creation
- [ ] `focusEditor` — focuses input field
- [ ] `openPanel` — chat panel toggle
- [ ] `resolveAction` — approve/reject button click
- [ ] `listNotifications` — notification list output
- [ ] `dismissNotification` — dismiss notification
- [ ] All scripts pass ▶ Run tests in DevConsole
- [ ] `node -c provider.js` — no syntax errors

---

## 8️⃣ Reference Implementations

| Pattern | Provider | Features |
|---------|----------|----------|
| **Inline** | [cursor/provider.js] | Most complete, concise implementation |
| **File separation** | [windsurf/provider.js] | Fiber usage, HTML→Markdown conversion |
| **File separation** | [antigravity/provider.js] | CDP mouse click coordinate return pattern |
| **Webview** | [kiro/provider.js] | webviewMatchText + webview* script pattern |
| **Webview** | [pearai/provider.js] | webview iframe-based chat UI |
| **File separation** | [trae/provider.js] | webviewMatchText + mainframe script hybrid |
| **ACP** | [gemini-cli/provider.js] | ACP + env_var auth + agent auth |
| **ACP** | [goose/provider.js] | ACP + terminal auth |

> [!TIP]
> When writing a new provider, **copy Cursor's `provider.json` + `scripts.js`** and modify selectors — it's the fastest approach.
> For VS Code-based IDEs, the DOM structure is similar, so just change a few selectors.
> For webview-based IDEs, refer to **Kiro's provider.json**.
> For ACP agents, refer to **gemini-cli's provider.json**.

---

## 📊 Version Detection & Compatibility Tracking

ADHDev automatically detects installed versions of all providers and archives the history
for future compatibility tracking.

### How It Works

```
adhdev daemon --dev
  └─ GET /api/providers/versions
      ├─ IDE:  cli --version → Info.plist fallback (macOS)
      ├─ CLI:  binary --version → -V → -v (auto-fallback)
      ├─ ACP:  binary --version → -V → -v (auto-fallback)
      └─ Extensions: detected at runtime via CDP (future)
```

### Version Archive

Detected versions are archived to `~/.adhdev/version-history.json`:

```json
{
  "cursor": [
    { "version": "2.5.0", "detectedAt": "2026-02-01T...", "os": "darwin" },
    { "version": "2.6.19", "detectedAt": "2026-03-18T...", "os": "darwin" }
  ],
  "claude-cli": [
    { "version": "2.1.76", "detectedAt": "2026-03-18T...", "os": "darwin" }
  ]
}
```

- **Deduplication**: Same version is not recorded twice consecutively
- **Entry limit**: Max 20 entries per provider (oldest trimmed)
- **OS tracking**: Records which OS the version was detected on

### provider.json Version Fields

| Field | Type | Purpose |
|-------|------|---------|
| `versionCommand` | `string` | Custom version detection command (default: `"<binary> --version"`) |
| `testedVersions` | `string[]` | Versions tested by the provider maintainer |

```json
{
  "type": "cursor",
  "versionCommand": "cursor --version",
  "testedVersions": ["2.5.0", "2.6.19"]
}
```

### Use Cases

1. **Compatibility alerts**: When a user's installed version doesn't match `testedVersions`,
   the dashboard can warn that scripts may not work correctly.
2. **Regression tracking**: When selectors break after an IDE update, the version history
   shows exactly when the change occurred.
3. **Per-version script overrides**: Use the existing `versions` field in provider config
   to provide different scripts for different IDE versions:

```json
{
  "versions": {
    ">=2.7.0": {
      "scripts": {
        "readChat": "... updated selectors for 2.7+ ..."
      }
    }
  }
}
```

### DevServer API

```bash
# Detect all provider versions (runs installation checks)
curl http://127.0.0.1:19280/api/providers/versions

# Response:
{
  "total": 52,
  "installed": 13,
  "providers": [
    {
      "type": "cursor",
      "name": "Cursor",
      "category": "ide",
      "installed": true,
      "version": "2.6.19",
      "path": "/Applications/Cursor.app",
      "binary": "/Applications/Cursor.app/Contents/Resources/app/bin/cursor"
    }
  ],
  "history": { ... }
}
```

> [!TIP]
> Run version detection periodically (or on daemon start) to keep the archive up-to-date.
> When a provider update breaks selectors, check the archive to identify the version change.

---

## 9️⃣ ACP Provider Guide

> Guide for adding ACP (Agent Client Protocol) agents.
> ACP agents communicate via stdin/stdout JSON-RPC 2.0.

### Directory Structure

```
providers/_builtin/acp/
├── gemini-cli/      ← env_var auth (reference)
│   └── provider.js
├── goose/           ← terminal auth (reference)
│   └── provider.js
├── [your-agent]/    ← new ACP provider
│   └── provider.js
```

### provider.js Basic Structure

```javascript
module.exports = {
  type: 'my-agent-acp',        // unique identifier
  name: 'My Agent (ACP)',      // display name
  category: 'acp',             // must be 'acp'
  aliases: ['my-agent'],       // aliases (adhdev launch my-agent etc.)

  displayName: 'My Agent',
  icon: '🤖',
  install: 'npm install -g my-agent',  // install command (shown in error messages)

  spawn: {
    command: 'my-agent',  // used for which install check + CLI detection
    args: ['--acp'],      // ACP mode activation argument
    shell: false,
  },

  // ─── Authentication Config ───
  auth: [
    // 1. API key based (env_var)
    {
      type: 'env_var',
      id: 'api-key',
      name: 'API Key',
      link: 'https://my-agent.dev/keys',  // key issuance URL
      vars: [
        { name: 'MY_AGENT_API_KEY', label: 'API Key', secret: true },
        { name: 'MY_AGENT_ORG', label: 'Organization', optional: true },
      ],
    },
    // 2. Self auth (agent)
    // { type: 'agent', id: 'oauth', name: 'OAuth', description: 'First run will open browser' },
    // 3. Terminal command (terminal)
    // { type: 'terminal', id: 'config', name: 'Configure', args: ['configure'] },
  ],

  settings: {
    approvalAlert: {
      type: 'boolean', default: true, public: true,
      label: 'Approval Alerts',
    },
    longGeneratingAlert: {
      type: 'boolean', default: true, public: true,
      label: 'Long Generation Alert',
    },
    longGeneratingThresholdSec: {
      type: 'number', default: 180, public: true,
      label: 'Long Generation Threshold (sec)',
      min: 30, max: 600,
    },
  },
};
```

### Authentication Types (auth[]) — Documentation Only

> **Note**: ADHDev does not store or inject API keys (v0.7.1+).
> The `auth[]` field is used for documentation purposes only; each tool handles authentication independently.
> On auth failure, stderr error messages are displayed directly on the dashboard.

| type | Purpose | Note |
|------|---------|------|
| `env_var` | API key-based auth | User sets environment variables manually |
| `agent` | Agent self OAuth/browser auth | Auto-handled on first run |
| `terminal` | Auth setup via CLI command | User runs manually |

### Behavior Flow

```
1. Dashboard CLIs tab → select Launch
2. daemon-cli.ts → which check → AcpProviderInstance created
3. spawn(command, args) → JSON-RPC initialize → session/new
4. Chat available on Dashboard
5. On auth failure → stderr error messages displayed on dashboard
```

### Error Handling (Automatic)

- **Not installed**: `which` failure → "Not installed" error + install guide
- **Auth failure**: stderr detects `unauthorized`, `api_key missing` etc. → `errorReason: 'auth_failed'`
- **Quick exit**: exit within 3 seconds → `errorReason: 'crash'` + last 3 stderr lines
- **Handshake failure**: initialize timeout → `errorReason: 'init_failed'`

> [!TIP]
> Adding a new ACP agent only requires creating a single provider.js.
> Copying `providers/_builtin/acp/gemini-cli/provider.js` is the fastest approach.

---

## 🔟 ProviderLoader API

```typescript
class ProviderLoader {
  loadAll(): void                              // load _builtin + .upstream + ~/.adhdev/providers
  resolve(type, context?): ResolvedProvider    // apply OS/version overrides
  get(type): ProviderModule | undefined
  getAll(): ProviderModule[]
  getByCategory(cat): ProviderModule[]
  
  // ─── Helpers (used by other modules) ───
  getCdpPortMap(): Record<string, number[]>    // CDP ports per IDE
  getMacAppIdentifiers(): Record<string, string>  // IDE → macOS app name
  getWinProcessNames(): Record<string, string[]>  // IDE → Windows process names
  getAvailableIdeTypes(): string[]             // IDE category only
  registerToDetector(): void                   // register IDE to core detector
  resolveAlias(alias): string                  // alias → type resolution
  fetchLatest(): Promise<void>                 // download GitHub tarball (.upstream/)
  
  watch(): void                                // hot-reload
  stopWatch(): void
}
```

---

## 1️⃣1️⃣ End-to-End Flow When Adding a New IDE

```
① provider.js created
   providers/_builtin/ide/zed/provider.js
                │
② ProviderLoader.loadAll()
   → auto-discovered (recursive scan)
                │
③ registerToDetector()
   → IDE definition registered to core detector (paths, processNames)
                │
④ daemon initCdp()
   → getCdpPortMap() → CDP connection starts
                │
⑤ daemon statusReport
   → auto-included in managedIdes (from cdpManagers.keys())
   → included in availableProviders (delivered to frontend)
                │
⑥ Dashboard display
   → DaemonContext auto-creates IDE tab from ':ide:' pattern
   → formatIdeType('zed') → 'Zed' (fallback capitalize)
                │
⑦ User interaction — zero TS code changes
```

> [!IMPORTANT]
> Adding just one `provider.json` + `scripts.js` enables **detection → CDP connection → dashboard display → command execution**
> to work automatically. No TypeScript code changes are required.

---

## ⚡ Scaffold — Quick Provider Creation

Use the scaffold API or DevConsole to generate a new provider skeleton:

### Via DevConsole

1. Open http://127.0.0.1:19280
2. Click **+ New** in the toolbar
3. Fill in Type ID, Display Name, Category
4. Category-specific fields appear automatically:
   - **IDE**: CDP Port, CLI Command, Process Name, Install Path
   - **Extension**: Extension ID
   - **CLI/ACP**: Binary / Command
5. Click **Create** → generates `~/.adhdev/providers/{type}/provider.json` + `scripts.js`

### Via API

```bash
curl -X POST http://127.0.0.1:19280/api/scaffold \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "zed",
    "name": "Zed",
    "category": "ide",
    "cdpPorts": [9450, 9451],
    "cli": "zed",
    "processName": "Zed",
    "installPath": "/Applications/Zed.app"
  }'
```

### Generated Files

| Category | Files Generated |
|----------|----------------|
| IDE | `provider.json` + `scripts.js` (with readChat, sendMessage, etc.) |
| Extension | `provider.json` + `scripts.js` |
| CLI | `provider.json` only |
| ACP | `provider.json` only |

> [!TIP]
> After scaffold, open the provider in DevConsole → use the Wizard to discover
> DOM selectors → implement the TODO stubs in scripts.js.

---

## 1️⃣2️⃣ Scope Limitations

1. **Electron-based IDEs only** — requires `--remote-debugging-port`. Zed, IntelliJ and other non-Electron IDEs not supported.
2. **Common launch logic** — all IDEs use identical Electron launch arguments. Per-provider custom launch not implemented.
3. **CLI adapter TypeScript maintained** — PTY lifecycle (spawn, handleOutput) is TS runtime code. provider.js provides config/patterns only.
4. **P2P-first** — all data (chat, commands, screenshots) transmitted directly via P2P. Server WS for signaling + lightweight meta only.

---

## 1️⃣3️⃣ Hardcoding Removal Status

### ✅ Fully Removed

| Location | Before | After |
|----------|--------|-------|
| `launch.ts` getCdpPorts | Hardcoded port map | `providerLoader.getCdpPortMap()` |
| `launch.ts` getMacAppIdentifiers | Hardcoded app names | `providerLoader.getMacAppIdentifiers()` |
| `launch.ts` getWinProcessNames | Hardcoded process names | `providerLoader.getWinProcessNames()` |
| `launch.ts` getAvailableIdeIds | Hardcoded IDE list | `providerLoader.getAvailableIdeTypes()` |
| `Dashboard.tsx` CLI_IDES | Hardcoded | `isCliConv()` — id pattern `:cli:` |
| `MachineDetail.tsx` CLI_TYPES | Hardcoded | `isCliEntry()` — id pattern |
| `detector.ts` IDE_DEFINITIONS | Hardcoded | `registerIDEDefinition()` runtime registration |

### ⚠️ Intentionally Kept (fallback)

| Location | Content | Reason |
|----------|---------|--------|
| `adhdev-daemon.ts` | `fallbackType = 'cursor'` | Default on detection failure |
| `adhdev-daemon.ts` | fallback port map | On ProviderLoader load failure |
| `Dashboard.tsx` | `IDE_TYPE_LABELS` | Display name override (fallback) |
| `detector.ts` | `BUILTIN_IDE_DEFINITIONS` | Default before runtime registration |
