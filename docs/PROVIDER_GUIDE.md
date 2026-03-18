# ADHDev Provider 생성 가이드

> ADHDev에 새 IDE, Extension, CLI, ACP 프로바이더를 추가하기 위한 전체 안내서
> **provider.js 하나만 생성하면 TypeScript 수정 없이 자동으로 동작합니다.**

---

## 🏗️ Provider 아키텍처

```
provider.js 생성 (ide/cli/extension/acp)
    │
    ▼
ProviderLoader.loadAll()  ← 3단계 우선순위 로드
    │
    ├─ 1. _builtin/           (npm 번들 — 오프라인 fallback)
    ├─ 2. .upstream/           (GitHub 자동 다운로드 — 30분마다 체크)
    └─ 3. ~/.adhdev/providers/ (유저 커스텀 — 최종 우선, 절대 자동갱신 안 됨)
    │
    ├─ registerToDetector()  ← IDE: 설치 감지 (paths, cli)
    ├─ getCdpPortMap()       ← IDE: CDP 포트 자동 할당
    ├─ getCliDetectionList() ← CLI/ACP: 설치 감지 (spawn.command)
    ├─ resolveAlias()        ← 별칭 해석 ('claude' → 'claude-cli')
    └─ fetchLatest()         ← GitHub tarball 자동 다운로드
```

### 로딩 우선순위 (나중이 이전을 덮어씀)

| 순서 | 디렉토리 | 자동 갱신 | 용도 |
|------|----------|-----------|------|
| 1 (최저) | `packages/launcher/providers/_builtin/` | npm update 시만 | 오프라인 fallback |
| 2 | `~/.adhdev/providers/.upstream/` | ✅ 데몬 시작 시 | GitHub 최신 providers |
| 3 (최고) | `~/.adhdev/providers/` (_upstream 제외) | ❌ **절대 안 함** | 유저 커스텀 |

### 자동 업데이트 플로우

```
adhdev daemon 시작
  ├─ loadAll() → 빌트인 + .upstream + 유저 커스텀 즉시 로드
  └─ 백그라운드: fetchLatest()
      ├─ HEAD 요청 → ETag 비교
      ├─ 변경 없음 → 스킵 (네트워크 비용 0)
      └─ 변경됨 → tarball 다운로드 → .upstream/ 교체 → reload()
```

> [!IMPORTANT]
> **유저 커스텀 보호**: `~/.adhdev/providers/` 에 직접 생성한 provider.js는 어떤 상황에서도
> 자동 갱신되지 않습니다. `.upstream/`만 자동 교체되며, 유저 커스텀이 항상 우선합니다.

---

## 📁 디렉토리 구조

```
providers/_builtin/ide/
├── cursor/              ← 인라인 패턴 (참조 구현체)
│   └── provider.js
├── windsurf/            ← 파일 패턴 (참조 구현체)
│   ├── provider.js
│   └── scripts/
│       ├── read_chat.js
│       ├── send_message.js
│       ├── list_chats.js
│       ├── switch_session.js
│       ├── new_session.js
│       ├── resolve_action.js
│       ├── focus_editor.js
│       └── open_panel.js
├── antigravity/
│   ├── provider.js
│   └── scripts/...
├── vscode/
│   └── provider.js      ← 인프라만 (스크립트 미구현)
└── [your-ide]/          ← 새 프로바이더 위치
    ├── provider.js
    └── scripts/          ← (파일 패턴 사용 시)
```

---

## 1️⃣ provider.js 기본 골격

> [!IMPORTANT]
> `provider.js`는 `module.exports`로 하나의 객체를 내보내야 합니다.
> 타입 정의: [contracts.ts](file:///Users/vilmire/Work/remote_vs/packages/launcher/src/providers/contracts.ts)

```javascript
/**
 * [IDE 이름] — IDE Provider
 * @type {import('../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  // ─── 필수 메타데이터 ───
  type: 'my-ide',           // 고유 식별자 (중복 불가)
  name: 'My IDE',           // 표시 이름
  category: 'ide',          // 'ide' | 'extension' | 'cli' | 'acp'
  aliases: ['myide'],       // 별칭 (adhdev launch myide 등에서 사용)

  // ─── IDE 인프라 ───
  displayName: 'My IDE',
  icon: '🔧',
  cli: 'my-ide',            // CLI 명령어 (예: cursor, code, windsurf)
  cdpPorts: [9357, 9358],   // CDP 포트 [primary, fallback] — 기존과 겹치지 않게!
  processNames: {
    darwin: 'My IDE',
    win32: ['MyIDE.exe'],
  },
  paths: {
    darwin: ['/Applications/My IDE.app'],
    win32: ['C:\\Users\\*\\AppData\\Local\\Programs\\my-ide\\MyIDE.exe'],
    linux: ['/opt/my-ide'],
  },

  // ─── 입력 방식 ───
  inputMethod: 'cdp-type-and-send',   // 대부분의 IDE에서 사용
  inputSelector: '[contenteditable="true"][role="textbox"]',

  // ─── CDP 스크립트 ───
  scripts: {
    // ... 아래 섹션 참조
  },
};
```

### 이미 사용 중인 CDP 포트

| Port | Provider |
|------|----------|
| 9333-9334 | Cursor |
| 9335-9336 | Antigravity |
| 9337-9338 | Windsurf |
| 9339-9340 | VS Code |
| 9341-9342 | VS Code Insiders |
| 9343-9344 | VSCodium |
| 9351-9352 | Kiro |
| 9353-9354 | Trae |
| 9355-9356 | PearAI |

> [!WARNING]
> 새 프로바이더 추가 시 **기존 포트와 겹치지 않도록** 다음 번호(9357~)부터 사용하세요.

### aliases 필드

`aliases`를 정의하면 `adhdev launch <alias>` 등에서 사용 가능합니다.
TypeScript 코드에 별칭 맵을 추가할 필요 없이 provider.js에서 선언만 하면 됩니다.

```javascript
// CLI 예시
module.exports = {
  type: 'claude-cli',
  aliases: ['claude', 'claude-code'],  // adhdev launch claude → claude-cli로 해석
  // ...
};

// IDE 예시 (선택사항)
module.exports = {
  type: 'vscode',
  aliases: ['code', 'vs'],  // adhdev launch code → vscode로 해석
  // ...
};
```

---

## 2️⃣ 스크립트 구현 — 두 가지 패턴

### 패턴 A: 인라인 (Cursor 방식)

`provider.js` 안에 template literal로 직접 작성합니다.

```javascript
scripts: {
  readChat(params) {
    return `(() => {
  try {
    // ... CDP JS 코드 ...
    return JSON.stringify({ id, status, messages, inputContent, activeModal });
  } catch(e) {
    return JSON.stringify({ id: '', status: 'error', messages: [] });
  }
})()`;
  },
}
```

**장점:** 파일 하나로 완결, 파라미터 치환이 자연스러움 (`${JSON.stringify(text)}`)
**단점:** 코드 길어지면 관리 어려움, syntax highlight 없음

### 패턴 B: 파일 분리 (Windsurf 방식)

`scripts/` 폴더에 개별 `.js` 파일을 두고 `loadScript()`로 로드합니다.

```javascript
const fs = require('fs');
const path = require('path');
const SCRIPTS_DIR = path.join(__dirname, 'scripts');

function loadScript(name) {
  try { return fs.readFileSync(path.join(SCRIPTS_DIR, name), 'utf8'); }
  catch { return null; }
}

// scripts 객체
scripts: {
  readChat() { return loadScript('read_chat.js'); },
  sendMessage(params) {
    const text = typeof params === 'string' ? params : params?.text;
    const s = loadScript('send_message.js');
    return s ? s.replace(/\$\{\s*MESSAGE\s*\}/g, JSON.stringify(text)) : null;
  },
}
```

**장점:** syntax highlight 가능, DevConsole에서 개별 편집/테스트 용이
**단점:** 파일 관리 필요, 파라미터 치환 시 `${MESSAGE}` 플레이스홀더 필요

> [!TIP]
> 스크립트가 30줄 이하면 **인라인**, 그 이상이면 **파일 분리**를 추천합니다.

---

## 3️⃣ 스크립트 Output Contract

모든 스크립트는 **반드시 JSON 문자열**을 반환해야 합니다.
[contracts.ts](file:///Users/vilmire/Work/remote_vs/packages/launcher/src/providers/contracts.ts) 참조.

### Core Scripts

#### readChat(params?) → `ReadChatResult`
```typescript
{
  id: string;              // 세션 ID
  status: AgentStatus;     // 'idle' | 'generating' | 'waiting_approval' | 'error'
  messages: ChatMessage[]; // { role, content, index }
  title?: string;
  inputContent?: string;   // 현재 입력 창 텍스트
  activeModal?: {          // 승인 대기 모달
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
  needsTypeAndSend?: boolean;  // true → daemon이 CDP Input API로 타이핑
  selector?: string;           // needsTypeAndSend 시 대상 selector
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

#### focusEditor(params?) → `string` (예: `'focused'`, `'not_found'`)
#### openPanel(params?) → `string` (예: `'visible'`, `'opened'`, `'not_found'`)

### Modal/Approval Scripts

#### resolveAction(params) — 두 가지 반환 방식

```typescript
// params: { action: 'approve'|'reject'|'custom', button?: string, buttonText?: string }
```

**방식 1: Script-Click** — 스크립트가 직접 `el.click()` 호출 (Cursor 등)

```js
// Cursor는 div.cursor-pointer 요소를 사용하므로 직접 click 가능
return JSON.stringify({ resolved: true, clicked: "Run⏎" });
return JSON.stringify({ resolved: false, available: ["Send", "Cancel"] });
```

**방식 2: Coordinate-Click** — 좌표 반환 → 데몬이 CDP 마우스 클릭 (Antigravity 등)

```js
// el.click()이 이벤트 전파가 안 되는 경우 좌표 반환
return JSON.stringify({ found: true, text: "Accept", x: 800, y: 450, w: 120, h: 32 });
return JSON.stringify({ found: false });
```

> [!IMPORTANT]
> 데몬 처리 순서: `resolved: true` → 성공 / `found: true` + `x,y` → CDP 클릭 / 둘 다 아님 → 실패

#### 승인 감지 (readChat에서 waiting_approval)

IDE마다 승인 UI가 다르므로 각 provider의 readChat에서 적절히 감지해야 합니다:

| IDE | 감지 방식 |
|-----|---------|
| Cursor | `.run-command-review-active` CSS 클래스 + `div.cursor-pointer` 버튼 (`Run⏎`, `SkipEsc`) |
| Antigravity | `<button>` 텍스트 매칭 (`Allow This Conversation`, `Deny` 등) |
| Windsurf | Fiber props 또는 버튼 텍스트 |

> [!TIP]
> Cursor 2.6.19+에서는 승인 버튼이 `<button>`이 아닌 `<div class="cursor-pointer">`이며,
> 버튼 텍스트에 단축키가 붙어있습니다 (예: `"Run⏎"`, `"SkipEsc"`).

#### listNotifications(params?) → `Array<{ index, message, severity, buttons }>`
#### dismissNotification(params) → `{ dismissed: boolean, error?: string }`

### Model / Mode Scripts

#### listModels(params?) → `{ models: string[], current: string }`
#### setModel(params) → `{ success: boolean, model?: string, error?: string }`
#### listModes(params?) → `{ modes: string[], current: string }`
#### setMode(params) → `{ success: boolean, mode?: string, error?: string }`

> [!NOTE]
> Webview 기반 IDE(Kiro, PearAI)는 `webviewListModels`, `webviewSetModel` 등 webview prefix 스크립트를 사용합니다.
> `handleExtensionScript`가 자동으로 webview variant 존재 시 우선 실행합니다.


---

## 3½. 데몬 분기 로직 — provider.js가 제어하는 것

> [!IMPORTANT]
> 데몬(daemon-commands.ts)은 **IDE 이름으로 분기하지 않습니다.**
> 모든 분기는 provider.js에 정의한 **속성과 스크립트 반환값**으로 결정됩니다.

### IDE 유형별 자동 분기

```
daemon이 명령 수신 (readChat, sendMessage, etc.)
  │
  ├─ provider.category === 'cli' or 'acp'?
  │   └─ CLI/ACP adapter로 전송 (stdin/stdout JSON-RPC)
  │
  ├─ provider.category === 'extension'?
  │   └─ AgentStream → webview iframe에서 실행
  │
  └─ provider.category === 'ide'?
      │
      ├─ scripts.webviewReadChat 존재?  (★ webview IDE)
      │   └─ evaluateInWebviewFrame() → webview iframe 내부에서 JS 실행
      │   └─ provider.webviewMatchText로 올바른 iframe 매칭
      │
      └─ scripts.readChat만 존재?  (★ 메인프레임 IDE)
          └─ cdp.evaluate() → 메인프레임에서 JS 실행
          └─ provider.inputMethod로 입력 방식 결정
```

### 메인프레임 IDE vs Webview IDE 차이

| 속성 | 메인프레임 (Cursor, Windsurf, Trae) | Webview (Kiro, PearAI) |
|------|--------------------------------------|-------------------------|
| `inputMethod` | `'cdp-type-and-send'` | 없음 (webview 스크립트에서 처리) |
| `inputSelector` | `'[contenteditable="true"]...'` | 없음 |
| `webviewMatchText` | 없음 | `'Kiro'` 등 iframe body 매칭 텍스트 |
| 스크립트 이름 | `readChat`, `sendMessage` | `webviewReadChat`, `webviewSendMessage` |
| 실행 컨텍스트 | IDE 메인 프레임 DOM | webview iframe 내부 DOM |

### 메인프레임 IDE 만들기

```javascript
module.exports = {
  type: 'my-ide',
  category: 'ide',
  inputMethod: 'cdp-type-and-send',       // ← 이것이 메인프레임 방식 결정
  inputSelector: '[contenteditable="true"][role="textbox"]',
  scripts: {
    readChat() { return `(() => { ... })()`; },
    sendMessage(text) {
      // needsTypeAndSend: true → 데몬이 inputSelector로 CDP 타이핑
      return `(() => JSON.stringify({ sent: false, needsTypeAndSend: true }))()`;
    },
  },
};
```

### Webview IDE 만들기

```javascript
module.exports = {
  type: 'my-webview-ide',
  category: 'ide',
  webviewMatchText: 'MyWebviewApp',        // ← iframe body에 이 텍스트가 있으면 매칭
  // inputMethod 없음! webview 내부에서 직접 처리
  scripts: {
    // webview 접두사 → evaluateInWebviewFrame()으로 자동 라우팅
    webviewReadChat() { return `(() => { ... })()`; },
    webviewSendMessage(text) { return `(() => { ... })()`; },
    webviewListSessions() { return `(() => { ... })()`; },

    // 메인프레임에서 실행할 스크립트 (패널 열기 등)
    openPanel() { return `(() => { ... })()`; },
    focusEditor() { return `(() => { ... })()`; },
  },
};
```

### sendMessage 반환값에 따른 데몬 동작

| 반환값 | 데몬 동작 |
|--------|-----------|
| `{ sent: true }` | 완료 (스크립트가 직접 전송) |
| `{ sent: false, needsTypeAndSend: true }` | CDP로 `inputSelector`에 타이핑 + Enter |
| `{ sent: false, needsTypeAndSend: true, selector: '...' }` | 지정된 셀렉터에 타이핑 |
| `{ sent: false, needsTypeAndSend: true, clickCoords: {x,y} }` | 좌표 클릭 후 타이핑 |

### resolveAction 반환값에 따른 데몬 동작

| 반환값 | 데몬 동작 |
|--------|-----------|
| `{ resolved: true }` | 완료 (스크립트가 직접 클릭) |
| `{ found: true, x, y, w, h }` | CDP 마우스 클릭 (좌표 기반) |
| `{ resolved: false }` / `{ found: false }` | 실패 |

> [!TIP]
> 새 IDE 추가 시 **TS 코드를 볼 필요가 없습니다.**
> provider.js에 올바른 속성만 설정하면 데몬이 자동으로 적절한 경로를 선택합니다.

---

## 4️⃣ 개발 워크플로우 (DevConsole 활용)

### Step 1: IDE를 CDP 모드로 실행

```bash
# 예시: Cursor
adhdev launch cursor --cdp

# 또는 기존 IDE를 CDP 포트와 함께 재실행
/Applications/MyIDE.app/Contents/MacOS/MyIDE --remote-debugging-port=9350
```

### Step 2: DevConsole 열기

```bash
adhdev daemon --dev
# 브라우저에서 http://127.0.0.1:19280 접속
```

### Step 3: DOM 탐색 및 스크립트 작성

1. **📸 Screenshot** 버튼으로 현재 IDE 화면 캡처
2. **CSS selector** 입력란에서 요소 탐색 (`Query` 버튼)
3. **🖥 Editor** 탭에서 CDP JS 코드 작성 → **▶ Run** 으로 즉시 테스트
4. 테스트한 코드를 `provider.js`에 복사

### Step 4: 스크립트 편집 모드 활용

1. **📜 Scripts ▾** 드롭다운에서 스크립트 이름 클릭 → 편집 모드 진입
2. 코드 수정 후 **▶ Run**으로 직접 실행하여 Output 확인
3. 만족스러우면 **💾 Save Script** 버튼으로 `provider.js`에 반영

### Step 5: 파라미터가 필요한 스크립트

- **⚙ params** 버튼 클릭 → JSON 파라미터 입력 → 실행
- 예: `sendMessage`에 `{"text": "Hello"}`

---

## 5️⃣ _helpers 활용 (선택사항)

[_helpers/index.js](file:///Users/vilmire/Work/remote_vs/packages/launcher/providers/_helpers/index.js)에서 공통 유틸을 가져다 쓸 수 있습니다.

| 헬퍼 | 용도 |
|------|------|
| `getWebviewDoc(selector)` | Extension webview iframe의 document 접근 |
| `getFiber(selectors)` | React Fiber 데이터 추출 |
| `typeAndSubmit(varName, selectorExpr)` | 텍스트 입력 + Enter 전송 |
| `waitFor(selector, timeout)` | 요소 출현 대기 |
| `htmlToMdCode()` | HTML → Markdown 변환 함수 선언 |
| `isNoiseText(text)` | 노이즈 텍스트 필터링 |

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
> 헬퍼 사용은 **완전히 선택사항**입니다. 각 `provider.js`는 독립적이어도 됩니다.

---

## 6️⃣ DOM 탐색 팁

### IDE별 공통 패턴

대부분의 VS Code 기반 IDE는 다음 구조를 공유합니다:

| 요소 | 셀렉터 패턴 |
|------|-----------|
| 사이드바 | `#workbench.parts.auxiliarybar` |
| 에디터 입력 | `[contenteditable="true"][role="textbox"]` |
| 알림 토스트 | `.notifications-toasts .notification-toast` |
| 다이얼로그 | `.monaco-dialog-box, [role="dialog"]` |
| 액션 버튼 | `a.action-label.codicon-*` |

### 상태 감지 전략

```
1. data-* 속성 확인 (가장 안정적)
   → Cursor: data-composer-status="streaming"

2. Fiber props 탐색 (React 기반 UI)
   → Windsurf: fiber.memoizedProps.isRunning

3. Stop 버튼 존재 여부 (범용)
   → button[aria-label*="stop"], text="Stop"

4. Placeholder 텍스트 (폴백)
   → input placeholder에 "wait" / "generating" 포함
```

---

## 7️⃣ 검증 체크리스트

새 프로바이더를 완성한 후 아래 항목을 모두 확인하세요:

- [ ] `readChat` — idle 상태에서 메시지 목록 정상 반환
- [ ] `readChat` — generating 상태 감지 정상 동작
- [ ] `readChat` — waiting_approval 상태 감지 (모달 버튼 목록 포함)
- [ ] `sendMessage` — `needsTypeAndSend: true` 반환 시 daemon이 정상 타이핑
- [ ] `listSessions` — 세션 목록 (title, active 상태 포함)
- [ ] `switchSession` — index/title 기반 전환 동작
- [ ] `newSession` — 새 채팅 생성
- [ ] `focusEditor` — 입력 창에 포커스
- [ ] `openPanel` — 채팅 패널 토글
- [ ] `resolveAction` — 승인/거부 버튼 클릭
- [ ] `listNotifications` — 알림 목록 출력
- [ ] `dismissNotification` — 알림 닫기
- [ ] DevConsole에서 모든 스크립트 ▶ Run 테스트 통과
- [ ] `node -c provider.js` — 구문 오류 없음

---

## 8️⃣ 참조 구현체

| 패턴 | 프로바이더 | 특징 |
|------|-----------|------|
| **인라인** | [cursor/provider.js] | 가장 완성도 높음, 간결한 구현 |
| **파일 분리** | [windsurf/provider.js] | Fiber 활용, HTML→Markdown 변환 |
| **파일 분리** | [antigravity/provider.js] | CDP 마우스 클릭 좌표 반환 패턴 |
| **Webview** | [kiro/provider.js] | webviewMatchText + webview* 스크립트 패턴 |
| **Webview** | [pearai/provider.js] | webview iframe 기반 채팅 UI |
| **파일 분리** | [trae/provider.js] | webviewMatchText + 메인프레임 스크립트 혼합 |
| **ACP** | [gemini-cli/provider.js] | ACP + env_var auth + agent auth |
| **ACP** | [goose/provider.js] | ACP + terminal auth |

> [!TIP]
> 새 프로바이더 작성 시 **Cursor provider.js를 복사**하고 셀렉터만 수정하는 것이 가장 빠릅니다.
> VS Code 기반 IDE라면 특히 DOM 구조가 유사하므로 셀렉터 몇 개만 바꾸면 됩니다.
> Webview 기반 IDE라면 **Kiro provider.js**를 참조하세요.
> ACP 에이전트라면 **gemini-cli provider.js**를 참조하세요.

---

## 9️⃣ ACP Provider 작성 가이드

> ACP (Agent Client Protocol) 에이전트를 추가하는 가이드입니다.
> ACP 에이전트는 stdin/stdout JSON-RPC 2.0으로 통신합니다.

### 디렉토리 구조

```
providers/_builtin/acp/
├── gemini-cli/      ← env_var auth (참조)
│   └── provider.js
├── goose/           ← terminal auth (참조)
│   └── provider.js
├── [your-agent]/    ← 새 ACP 프로바이더
│   └── provider.js
```

### provider.js 기본 골격

```javascript
module.exports = {
  type: 'my-agent-acp',        // 고유 식별자
  name: 'My Agent (ACP)',      // 표시 이름
  category: 'acp',             // 반드시 'acp'
  aliases: ['my-agent'],       // 별칭 (adhdev launch my-agent 등)

  displayName: 'My Agent',
  icon: '🤖',
  install: 'npm install -g my-agent',  // 설치 명령어 (에러 메시지에 표시)

  spawn: {
    command: 'my-agent',  // which로 설치 체크 + CLI 감지에 사용
    args: ['--acp'],      // ACP 모드 활성화 인자
    shell: false,
  },

  // ─── 인증 설정 ───
  auth: [
    // 1. API 키 기반 (env_var)
    {
      type: 'env_var',
      id: 'api-key',
      name: 'API Key',
      link: 'https://my-agent.dev/keys',  // 키 발급 URL
      vars: [
        { name: 'MY_AGENT_API_KEY', label: 'API Key', secret: true },
        { name: 'MY_AGENT_ORG', label: 'Organization', optional: true },
      ],
    },
    // 2. 자체 인증 (agent)
    // { type: 'agent', id: 'oauth', name: 'OAuth', description: 'First run will open browser' },
    // 3. 터미널 명령 (terminal)
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

### 인증 타입 (auth[]) — 문서용

> **Note**: ADHDev는 API 키를 저장하거나 주입하지 않습니다 (v0.7.1+).
> `auth[]` 필드는 문서화 목적으로만 사용되며, 각 도구가 자치적으로 인증을 처리합니다.
> 인증 실패 시 stderr 에러 메시지가 대시보드에 그대로 표시됩니다.

| type | 용도 | 비고 |
|------|------|------|
| `env_var` | API 키 기반 인증 | 유저가 직접 환경변수 설정 |
| `agent` | 에이전트 자체 OAuth/브라우저 인증 | 첨 실행 시 자동 처리 |
| `terminal` | CLI 명령으로 인증 설정 | 유저가 직접 실행 |

### 동작 플로우

```
1. Dashboard CLIs 탭 → Launch 선택
2. daemon-cli.ts → which 체크 → AcpProviderInstance 생성
3. spawn(command, args) → JSON-RPC initialize → session/new
4. Dashboard에서 채팅 가능
5. 인증 실패 시 → stderr 에러 메시지가 대시보드에 표시
```

### 에러 핸들링 (자동)

- **미설치**: `which` 실패 → "Not installed" 에러 + install 가이드
- **인증 실패**: stderr에서 `unauthorized`, `api_key missing` 등 감지 → `errorReason: 'auth_failed'`
- **빠른 종료**: 3초 이내 exit → `errorReason: 'crash'` + stderr 마지막 3줄
- **핸드셰이크 실패**: initialize 타임아웃 → `errorReason: 'init_failed'`

> [!TIP]
> 새 ACP 에이전트 추가는 provider.js 하나만 만들면 됩니다.
> `providers/_builtin/acp/gemini-cli/provider.js`를 복사하는 것이 가장 빠릅니다.

---

## 🔟 ProviderLoader API

```typescript
class ProviderLoader {
  loadAll(): void                              // _builtin + .upstream + ~/.adhdev/providers 로드
  resolve(type, context?): ResolvedProvider    // OS/버전 오버라이드 적용
  get(type): ProviderModule | undefined
  getAll(): ProviderModule[]
  getByCategory(cat): ProviderModule[]
  
  // ─── 헬퍼 (다른 모듈에서 사용) ───
  getCdpPortMap(): Record<string, number[]>    // IDE별 CDP 포트
  getMacAppIdentifiers(): Record<string, string>  // IDE → macOS 앱 이름
  getWinProcessNames(): Record<string, string[]>  // IDE → Windows 프로세스
  getAvailableIdeTypes(): string[]             // IDE 카테고리만
  registerToDetector(): void                   // core detector에 IDE 등록
  resolveAlias(alias): string                  // 별칭 → type 해석
  fetchLatest(): Promise<void>                 // GitHub tarball 다운로드 (.upstream/)
  
  watch(): void                                // hot-reload
  stopWatch(): void
}
```

---

## 1️⃣1️⃣ 새 IDE 추가 시 End-to-End 흐름

```
① provider.js 생성
   providers/_builtin/ide/zed/provider.js
                │
② ProviderLoader.loadAll()
   → 자동 발견 (재귀 스캔)
                │
③ registerToDetector()
   → core detector에 IDE 정의 등록 (paths, processNames)
                │
④ daemon initCdp()
   → getCdpPortMap() → CDP 연결 시작
                │
⑤ daemon statusReport
   → managedIdes에 자동 포함 (cdpManagers.keys()에서)
   → availableProviders에 포함 (프론트엔드 전달)
                │
⑥ Dashboard 표시
   → DaemonContext에서 ':ide:' 패턴으로 IDE 탭 자동 생성
   → formatIdeType('zed') → 'Zed' (fallback capitalize)
                │
⑦ 사용자 인터랙션 — TS 코드 수정 0개
```

> [!IMPORTANT]
> provider.js 하나 추가만으로 **감지 → CDP 연결 → 대시보드 표시 → 명령 실행**이 자동 동작합니다.
> TypeScript 코드 변경이 필요한 경우는 없습니다.

---

## 1️⃣2️⃣ Scope 제한사항

1. **Electron 기반 IDE만** — `--remote-debugging-port` 사용 전제. Zed, IntelliJ 등 비-Electron IDE 미지원.
2. **launch 로직 공통** — 모든 IDE가 동일한 Electron launch 인자 사용. provider별 커스텀 launch는 미구현.
3. **CLI adapter TypeScript 유지** — PTY 라이프사이클(spawn, handleOutput)은 TS 런타임 코드. provider.js는 config/patterns만 제공.
4. **P2P-first** — 모든 데이터(채팅, 커맨드, 스크린샷)는 P2P로 직접 전송. 서버 WS는 signaling + 경량 메타만.

---

## 1️⃣3️⃣ 하드코딩 제거 현황

### ✅ 완전 제거됨

| 위치 | 이전 | 이후 |
|------|------|------|
| `launch.ts` getCdpPorts | 하드코딩 포트 맵 | `providerLoader.getCdpPortMap()` |
| `launch.ts` getMacAppIdentifiers | 하드코딩 앱 이름 | `providerLoader.getMacAppIdentifiers()` |
| `launch.ts` getWinProcessNames | 하드코딩 프로세스 | `providerLoader.getWinProcessNames()` |
| `launch.ts` getAvailableIdeIds | 하드코딩 IDE 목록 | `providerLoader.getAvailableIdeTypes()` |
| `Dashboard.tsx` CLI_IDES | 하드코딩 | `isCliConv()` — id 패턴 `:cli:` |
| `MachineDetail.tsx` CLI_TYPES | 하드코딩 | `isCliEntry()` — id 패턴 |
| `detector.ts` IDE_DEFINITIONS | 하드코딩 | `registerIDEDefinition()` 런타임 등록 |

### ⚠️ 의도적 유지 (fallback)

| 위치 | 내용 | 이유 |
|------|------|------|
| `adhdev-daemon.ts` | `fallbackType = 'cursor'` | 감지 실패 시 기본값 |
| `adhdev-daemon.ts` | fallback 포트 맵 | ProviderLoader 로드 실패 시 |
| `Dashboard.tsx` | `IDE_TYPE_LABELS` | 표시명 오버라이드 (fallback) |
| `detector.ts` | `BUILTIN_IDE_DEFINITIONS` | 런타임 등록 전 기본값 |

