# CDP DOM Exploration Guide — Building Provider Scripts with AI

> **⚠️ These APIs are local DevServer only (`adhdev daemon --dev`, `:19280`)**
> - Separate from the production/cloud API (`api.adhf.dev`) → [api.md](./api.md)
> - Used only during provider script development

> Use ADHDev's **local DevServer API** to analyze IDE DOM structure and
> discover selectors needed for `readChat`, `sendMessage`, and other provider scripts.
> **An AI agent can perform this entire workflow using only API calls.**

---

## Architecture

```
AI Agent (or script)
    │
    │  HTTP POST (localhost)
    ▼
ADHDev Dev Server (:19280)
    │
    │  CDP Runtime.evaluate
    ▼
IDE Browser Process (Electron)
    │
    └─ DOM access, JS execution, result return
```

---

## Getting Started

### 1. Start the daemon in dev mode

```bash
adhdev daemon --dev
# DevServer: http://127.0.0.1:19280
```

### 2. Verify CDP connection

```bash
curl -s http://127.0.0.1:19280/api/cdp/status | python3 -m json.tool
```

```json
{
  "connected": ["cursor"],
  "pages": { "cursor": "my-project — App.tsx" }
}
```

---

## Core APIs

### `POST /api/cdp/evaluate` — Execute JS in IDE

Run arbitrary JavaScript inside the IDE browser and return the result.

```bash
curl -s -X POST http://127.0.0.1:19280/api/cdp/evaluate \
  -H 'Content-Type: application/json' \
  -d '{
    "expression": "document.title",
    "ideType": "cursor"
  }'
```

> **Return value must be a string** — wrap objects with `JSON.stringify()`.

### `POST /api/cdp/dom/find-common` — Text-based selector discovery

Automatically find common ancestor selectors from visible text on screen.

```bash
curl -s -X POST http://127.0.0.1:19280/api/cdp/dom/find-common \
  -H 'Content-Type: application/json' \
  -d '{
    "include": ["Hello World", "Fix the bug"],
    "exclude": [],
    "ideType": "cursor"
  }'
```

**Response:**
```json
{
  "results": [{
    "selector": "body > div... > div.chat-list",
    "isList": true,
    "listItemCount": 42,
    "renderedCount": 42,
    "placeholderCount": 0,
    "items": [
      { "index": 0, "text": "...Hello World...", "matchedIncludes": ["Hello World"] }
    ]
  }]
}
```

---

## Step-by-Step: Discovering readChat Selectors

Below is the actual process an AI used to discover readChat selectors via API calls only.

### Step 1: Find the chat container using visible text

Pick **two different chat messages visible on screen** and use them as include texts.

```bash
curl -s -X POST http://127.0.0.1:19280/api/cdp/dom/find-common \
  -H 'Content-Type: application/json' \
  -d '{
    "include": ["text from first message", "text from second message"],
    "ideType": "cursor"
  }'
```

**Key information from results:**
- `selector` → chat list container
- `isList: true` → confirms list structure
- `renderedCount` vs `placeholderCount` → detects virtual scrolling

### Step 2: Analyze internal structure of the container

```bash
curl -s -X POST http://127.0.0.1:19280/api/cdp/evaluate \
  -H 'Content-Type: application/json' \
  -d '{
    "expression": "(() => { const el = document.querySelector(\"SELECTOR_FROM_STEP_1\"); const items = [...el.children]; const rendered = items.filter(c => (c.innerText||\"\").trim().length > 0); return JSON.stringify({ total: items.length, rendered: rendered.length, samples: rendered.slice(0, 5).map((c, i) => ({ tag: c.tagName, cls: c.className.substring(0, 50), text: (c.innerText||\"\").trim().substring(0, 100) })) }); })()",
    "ideType": "cursor"
  }'
```

### Step 3: Distinguish user vs assistant messages

Look for class patterns that differentiate roles:

```bash
curl -s -X POST http://127.0.0.1:19280/api/cdp/evaluate \
  -H 'Content-Type: application/json' \
  -d '{
    "expression": "(() => { const chat = document.querySelector(\"CHAT_CONTAINER\"); const rows = chat.querySelectorAll(\"div.flex.flex-row\"); const byClass = {}; rows.forEach(el => { const text = (el.innerText||\"\").trim(); if (text.length < 3) return; const cls = el.className.substring(0, 50); if (!byClass[cls]) byClass[cls] = { count: 0, samples: [] }; byClass[cls].count++; if (byClass[cls].samples.length < 2) byClass[cls].samples.push(text.substring(0, 80)); }); return JSON.stringify(byClass); })()",
    "ideType": "cursor"
  }'
```

### Step 4: Build the readChat script

Use discovered selectors to construct the final script:

```javascript
(() => {
  try {
    const chat = document.querySelector('#conversation');
    if (!chat) return JSON.stringify({ id: '', status: 'error', messages: [] });

    const messages = [];

    // User messages
    chat.querySelectorAll('USER_SELECTOR').forEach(el => {
      const text = (el.innerText || '').trim();
      if (text.length > 1) {
        messages.push({ role: 'user', content: text, y: el.getBoundingClientRect().top });
      }
    });

    // Assistant messages
    chat.querySelectorAll('ASSISTANT_SELECTOR').forEach(el => {
      const text = (el.innerText || '').trim();
      if (text.length > 1) {
        messages.push({ role: 'assistant', content: text, y: el.getBoundingClientRect().top });
      }
    });

    // Sort by vertical position (top→bottom = chronological)
    messages.sort((a, b) => a.y - b.y);

    // Status detection
    const stopBtn = chat.querySelector('button[aria-label*="stop"], button[aria-label*="Stop"]');
    const status = stopBtn ? 'generating' : 'idle';

    return JSON.stringify({
      id: 'chat-1',
      status,
      messages: messages.map((m, i) => ({ role: m.role, content: m.content, index: i })),
    });
  } catch (e) {
    return JSON.stringify({ id: '', status: 'error', messages: [] });
  }
})()
```

---

## Exploration Pattern Recipes

### Pattern A: Find elements by text

```javascript
// Find all elements containing specific text
(() => {
  const searchText = "search text here";
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: n => n.textContent.toLowerCase().includes(searchText.toLowerCase())
      ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
  });
  const results = [];
  let node;
  while ((node = walker.nextNode()) && results.length < 5) {
    const el = node.parentElement;
    results.push({
      tag: el.tagName,
      cls: el.className.substring(0, 50),
      text: el.innerText.substring(0, 100),
    });
  }
  return JSON.stringify(results);
})()
```

### Pattern B: Analyze list container children

```javascript
// Analyze children structure of a selector
(() => {
  const el = document.querySelector("YOUR_SELECTOR");
  if (!el) return JSON.stringify({error: "Not found"});
  const children = [...el.children];
  const rendered = children.filter(c => (c.innerText || '').trim().length > 0);
  return JSON.stringify({
    total: children.length,
    rendered: rendered.length,
    placeholders: children.length - rendered.length,
    items: rendered.slice(0, 10).map((c, i) => ({
      tag: c.tagName.toLowerCase(),
      cls: c.className.substring(0, 40),
      text: (c.innerText || '').trim().substring(0, 150),
    }))
  });
})()
```

### Pattern C: Classify elements by class pattern

```javascript
// Group elements by CSS class pattern
(() => {
  const container = document.querySelector("CONTAINER_SELECTOR");
  const elements = container.querySelectorAll("div.flex");
  const byClass = {};
  elements.forEach(el => {
    const text = (el.innerText || '').trim();
    if (text.length < 3) return;
    const cls = el.className.substring(0, 50);
    if (!byClass[cls]) byClass[cls] = { count: 0, samples: [] };
    byClass[cls].count++;
    if (byClass[cls].samples.length < 2) {
      byClass[cls].samples.push(text.substring(0, 80));
    }
  });
  return JSON.stringify(byClass);
})()
```

### Pattern D: Find input fields (for sendMessage)

```javascript
// Find contenteditable or textarea inputs
(() => {
  const inputs = [
    ...document.querySelectorAll('[contenteditable="true"]'),
    ...document.querySelectorAll('textarea'),
    ...document.querySelectorAll('input[type="text"]'),
  ];
  return JSON.stringify(inputs.map(el => ({
    tag: el.tagName,
    role: el.getAttribute('role'),
    placeholder: el.getAttribute('placeholder') || el.getAttribute('aria-placeholder'),
    cls: el.className.substring(0, 50),
    visible: el.getBoundingClientRect().height > 0,
    selector: el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + el.className.split(' ').slice(0,2).join('.'),
  })));
})()
```

### Pattern E: Find buttons (for resolveAction)

```javascript
// Find visible buttons with text and coordinates
(() => {
  const buttons = [...document.querySelectorAll('button')];
  return JSON.stringify(buttons
    .filter(b => b.offsetHeight > 0)
    .map(b => {
      const r = b.getBoundingClientRect();
      return {
        text: (b.innerText || '').trim().substring(0, 30),
        cls: b.className.substring(0, 40),
        x: Math.round(r.x + r.width/2),
        y: Math.round(r.y + r.height/2),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    })
    .filter(b => b.text.length > 0)
  );
})()
```

---

## Important Notes

### Virtual Scrolling

Some IDEs (e.g., Antigravity) use virtual scrolling for chat lists.

- Only 1-3 visible items are actually rendered in the DOM
- The rest are empty placeholder divs with height only
- Filter with innerText: `(c.innerText || '').trim().length > 0`

**Detection:**
```javascript
const total = container.children.length;
const rendered = [...container.children].filter(c => (c.innerText || '').trim().length > 0).length;
const isVirtualScroll = rendered < total * 0.5;
```

### textContent vs innerText

| Property | Use case |
|----------|----------|
| `textContent` | Includes hidden elements, fast, full node text |
| `innerText` | **Rendered text only**, slower but matches what user sees |

> Use `innerText` for readChat — produces results similar to a screen reader.

### Selector Stability

| Stability | Selector type | Example |
|-----------|--------------|---------|
| ⭐⭐⭐ | ID | `#conversation` |
| ⭐⭐⭐ | Role | `[role="textbox"]` |
| ⭐⭐ | Semantic class | `.chat-message` |
| ⭐ | Tailwind class | `.flex.flex-row.my-2` |

> Tailwind-based selectors may break on IDE updates.
> Prefer `id`, `role`, `data-*` attribute selectors when available.

---

## Recommended AI Agent Workflow

```
1. /api/cdp/status        → Verify connected IDEs
2. /api/cdp/evaluate      → Check document.title (correct IDE?)
3. /api/cdp/dom/find-common → Find container using 2 chat texts
4. /api/cdp/evaluate      → Analyze container children (tags, class patterns)
5. /api/cdp/evaluate      → Distinguish user vs assistant messages (class, parent chain)
6. /api/cdp/evaluate      → Find input field selectors (sendMessage)
7. /api/cdp/evaluate      → Find button selectors (resolveAction)
8. → Generate provider.js scripts from results
```

> [!TIP]
> Provide **PROVIDER_GUIDE.md** and **this document** as context to an AI agent,
> and it can auto-generate provider.js scripts using only API calls.
