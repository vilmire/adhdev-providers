# CDP DOM 탐색 가이드 — AI로 Provider 스크립트 작성하기

> **⚠️ 이 문서의 API는 로컬 DevServer 전용입니다 (`adhdev daemon --dev`, `:19280`)**
> - 프로덕션/클라우드 API(`api.adhf.dev`)와는 별개입니다 → [api.md](./api.md)
> - Provider 스크립트 개발 시에만 사용

> ADHDev의 **로컬 DevServer API**를 사용하여 IDE의 DOM 구조를 분석하고,
> `readChat`, `sendMessage` 등 provider 스크립트에 필요한 셀렉터를 찾는 방법.
> **AI 에이전트가 DevServer API만으로 자동 수행 가능.**

---

## 🏗️ 아키텍처

```
AI Agent (or script)
    │
    │  HTTP POST (localhost)
    ▼
ADHDev Dev Server (:19280)
    │
    │  CDP Runtime.evaluate
    ▼
IDE 브라우저 프로세스 (Electron)
    │
    └─ DOM 접근, JS 실행, 결과 반환
```

---

## 🚀 시작하기

### 1. 데몬을 dev 모드로 시작

```bash
adhdev daemon --dev
# DevServer: http://127.0.0.1:19280
```

### 2. CDP 연결 확인

```bash
curl -s http://127.0.0.1:19280/api/cdp/status | python3 -m json.tool
```

```json
{
  "connected": ["antigravity"],
  "pages": { "antigravity": "remote_vs — App.tsx" }
}
```

---

## 📡 핵심 API

### `POST /api/cdp/evaluate` — JS 실행

IDE 브라우저에서 임의의 JavaScript를 실행하고 결과를 반환.

```bash
curl -s -X POST http://127.0.0.1:19280/api/cdp/evaluate \
  -H 'Content-Type: application/json' \
  -d '{
    "expression": "document.title",
    "ideType": "antigravity"
  }'
```

> **반환값은 반드시 string** — 객체는 `JSON.stringify()` 필수.

### `POST /api/cdp/dom/find-common` — 텍스트 기반 셀렉터 탐색

화면에 보이는 텍스트로 공통 조상 셀렉터를 자동으로 찾아줌.

```bash
curl -s -X POST http://127.0.0.1:19280/api/cdp/dom/find-common \
  -H 'Content-Type: application/json' \
  -d '{
    "include": ["Hello World", "Fix the bug"],
    "exclude": [],
    "ideType": "antigravity"
  }'
```

---

## 🔍 Step-by-Step: readChat 셀렉터 찾기

아래는 AI가 API만으로 Antigravity IDE의 readChat 셀렉터를 찾은 **실제 과정**입니다.

### Step 1: 채팅 영역의 텍스트 두 개로 컨테이너 찾기

화면에 보이는 **서로 다른 채팅 메시지의 텍스트** 2개를 include에 넣습니다.

```bash
curl -s -X POST http://127.0.0.1:19280/api/cdp/dom/find-common \
  -H 'Content-Type: application/json' \
  -d '{
    "include": ["첫번째 메시지 텍스트", "두번째 메시지 텍스트"],
    "ideType": "antigravity"
  }'
```

**결과 예시:**
```json
{
  "results": [{
    "selector": "body > div... > div.relative.flex.flex-col",
    "isList": true,
    "listItemCount": 174,
    "renderedCount": 2,
    "placeholderCount": 172,
    "items": [
      { "index": 0, "text": "...첫번째 메시지 텍스트...", "matchedIncludes": ["첫번째 메시지 텍스트"] }
    ]
  }]
}
```

**핵심 정보:**
- `selector` → 채팅 리스트 컨테이너
- `isList: true` → 리스트 구조 확인
- `renderedCount` vs `placeholderCount` → 가상 스크롤 감지

### Step 2: 컨테이너 내부 구조 분석

```bash
curl -s -X POST http://127.0.0.1:19280/api/cdp/evaluate \
  -H 'Content-Type: application/json' \
  -d '{
    "expression": "(() => { const el = document.querySelector(\"#conversation\"); const rows = el.querySelectorAll(\"div.flex.flex-row\"); const results = []; for (let i = 0; i < Math.min(rows.length, 15); i++) { const r = rows[i]; const text = (r.innerText||\"\").trim(); if (text.length < 3) continue; results.push({ cls: r.className.substring(0, 50), text: text.substring(0, 100), parentCls: (r.parentElement.className||\"\").substring(0, 40) }); } return JSON.stringify({total: rows.length, results}); })()",
    "ideType": "antigravity"
  }'
```

### Step 3: 유저 vs 어시스턴트 메시지 구분

클래스 패턴으로 역할 구분:

```javascript
// Antigravity 실제 결과:
// "flex w-full flex-row"                    → 👤 유저 메시지
// "flex flex-row my-2 first:mt-1 last:mb-1" → 🤖 어시스턴트 텍스트
// "flex flex-row" (without my-2)            → 🔧 도구 사용 (Analyzed, Edited 등)
```

### Step 4: readChat 스크립트 완성

```javascript
(() => {
  try {
    const chat = document.querySelector('#conversation');
    if (!chat) return JSON.stringify({ id: '', status: 'error', messages: [] });

    const messages = [];

    // 유저 메시지
    chat.querySelectorAll('div.flex.w-full.flex-row').forEach(el => {
      const text = (el.innerText || '').trim();
      if (text.length > 1) {
        messages.push({ role: 'user', content: text, y: el.getBoundingClientRect().top });
      }
    });

    // 어시스턴트 메시지
    chat.querySelectorAll('div.flex.flex-row.my-2').forEach(el => {
      const text = (el.innerText || '').trim();
      if (text.length > 1) {
        messages.push({ role: 'assistant', content: text, y: el.getBoundingClientRect().top });
      }
    });

    // Y좌표 순 정렬 (위→아래 = 시간순)
    messages.sort((a, b) => a.y - b.y);

    // status 감지
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

## 📋 탐색 패턴 레시피

### 패턴 A: 텍스트로 요소 찾기

```javascript
// 특정 텍스트가 포함된 모든 요소 찾기
(() => {
  const searchText = "검색할 텍스트";
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

### 패턴 B: 리스트 컨테이너 발견

```javascript
// 특정 셀렉터의 자식 구조 분석
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

### 패턴 C: 클래스 패턴별 요소 분류

```javascript
// 컨테이너 안의 요소를 클래스 패턴별로 분류
(() => {
  const container = document.querySelector("#conversation");
  const elements = container.querySelectorAll("div.flex.flex-row");
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

### 패턴 D: 입력 필드 셀렉터 찾기 (sendMessage용)

```javascript
// contenteditable 또는 textarea 찾기
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

### 패턴 E: 버튼 찾기 (resolveAction용)

```javascript
// 특정 텍스트의 버튼 찾기 (승인/거부)
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

## ⚠️ 주의사항

### 가상 스크롤 (Virtual Scrolling)

일부 IDE(Antigravity 등)는 채팅 목록에 가상 스크롤을 사용합니다.

- 화면에 보이는 1-3개 아이템만 실제 DOM에 렌더링
- 나머지는 높이만 잡는 빈 placeholder
- `innerText`로 필터: `(c.innerText || '').trim().length > 0`

**감지 방법:**
```javascript
const total = container.children.length;
const rendered = [...container.children].filter(c => (c.innerText || '').trim().length > 0).length;
const isVirtualScroll = rendered < total * 0.5;
```

### textContent vs innerText

| 속성 | 용도 |
|------|------|
| `textContent` | 숨겨진 요소 포함, 빠름, 노드 전체 텍스트 |
| `innerText` | **렌더링된 텍스트만**, 느리지만 "보이는 것"에 가까움 |

> readChat에서는 `innerText` 사용 권장 — 스크린리더와 유사한 결과.

### 셀렉터 안정성

| 안정도 | 셀렉터 타입 | 예시 |
|--------|------------|------|
| ⭐⭐⭐ | ID | `#conversation` |
| ⭐⭐⭐ | Role | `[role="textbox"]` |
| ⭐⭐ | Semantic class | `.chat-message` |
| ⭐ | Tailwind class | `.flex.flex-row.my-2` |

> Tailwind 클래스 기반 셀렉터는 IDE 업데이트로 깨질 수 있음.
> 가능하면 `id`, `role`, `data-*` 속성 기반 셀렉터 우선 사용.

---

## 🤖 AI 에이전트 사용 시 권장 워크플로우

```
1. /api/cdp/status → 연결된 IDE 확인
2. /api/cdp/evaluate → document.title 확인 (올바른 IDE인지)
3. /api/cdp/dom/find-common → 채팅 텍스트 2개로 컨테이너 탐색
4. /api/cdp/evaluate → 컨테이너 내부 구조 분석 (자식 태그, 클래스 패턴)
5. /api/cdp/evaluate → 유저 vs 어시스턴트 메시지 구분 (클래스, 부모 체인)
6. /api/cdp/evaluate → 입력 필드 셀렉터 탐색 (sendMessage용)
7. /api/cdp/evaluate → 버튼 셀렉터 탐색 (resolveAction용)
8. → 결과를 바탕으로 provider.js 스크립트 생성
```

> [!TIP]
> AI에게 **PROVIDER_GUIDE.md**와 **이 문서**를 컨텍스트로 제공하면,
> API 호출만으로 provider.js 스크립트를 자동 생성할 수 있습니다.
