# Contributing to ADHDev Providers

> ADHDev에 새 Provider를 추가하거나 기존 Provider를 개선하는 방법

## 🚀 빠른 시작

### 1. 포크 & 클론

```bash
git clone https://github.com/YOUR_USERNAME/adhdev-providers.git
cd adhdev-providers
```

### 2. Provider 작성

카테고리별 디렉토리에 `provider.js` 생성:

```bash
# IDE
mkdir -p ide/my-ide && touch ide/my-ide/provider.js

# CLI Agent
mkdir -p cli/my-cli && touch cli/my-cli/provider.js

# ACP Agent
mkdir -p acp/my-agent && touch acp/my-agent/provider.js

# Extension
mkdir -p extension/my-ext && touch extension/my-ext/provider.js
```

### 3. 기본 구조

```javascript
module.exports = {
  type: 'my-ide',           // 고유 식별자 (기존과 중복 불가)
  name: 'My IDE',           // 표시 이름
  category: 'ide',          // 'ide' | 'extension' | 'cli' | 'acp'
  displayName: 'My IDE',
  icon: '🔧',

  // IDE: CDP 설정
  cdpPorts: [9357, 9358],   // 다음 가용 포트 사용
  cli: 'my-ide',
  paths: { darwin: ['/Applications/My IDE.app'] },

  // 스크립트
  scripts: {
    readChat() { return `(() => { /* ... */ })()`; },
    sendMessage(text) { return `(() => { /* ... */ })()`; },
  },
};
```

> 📖 전체 가이드: [PROVIDER_GUIDE.md](https://github.com/vilmire/adhdev/blob/main/docs/PROVIDER_GUIDE.md)

### 4. 검증

```bash
# 구문 검증
node -c ide/my-ide/provider.js

# 스키마 검증 (필수 필드 체크)
node validate.js ide/my-ide/provider.js

# 전체 검증
node validate.js
```

### 5. 로컬 테스트

```bash
# ADHDev가 설치된 경우:
# provider.js를 유저 디렉토리에 복사하면 즉시 적용
mkdir -p ~/.adhdev/providers/ide/my-ide
cp ide/my-ide/provider.js ~/.adhdev/providers/ide/my-ide/

# 데몬 재시작 (또는 reload)
adhdev daemon:restart

# 또는 DevConsole에서 테스트
# http://127.0.0.1:19280 → IDE 탭 → Scripts → Run
```

### 6. PR 제출

```bash
git checkout -b feat/add-my-ide
git add -A
git commit -m "feat: add My IDE provider"
git push origin feat/add-my-ide
# GitHub에서 PR 생성
```

## 📋 PR 체크리스트

- [ ] `node validate.js` 통과
- [ ] `type`이 기존 provider와 중복되지 않음
- [ ] CDP 포트가 기존과 겹치지 않음 (IDE인 경우)
- [ ] 최소 `readChat` + `sendMessage` 스크립트 구현
- [ ] DevConsole에서 스크립트 실행 테스트 완료

## 📁 카테고리별 참조 구현체

| 카테고리 | 참조 | 특징 |
|----------|------|------|
| **IDE (메인프레임)** | `ide/cursor/provider.js` | CDP evaluate, inputMethod |
| **IDE (webview)** | `ide/kiro/provider.js` | webviewMatchText, webview* 스크립트 |
| **CLI** | `cli/gemini-cli/provider.js` | aliases, ACP spawn |
| **ACP** | `acp/gemini-cli/provider.js` | auth, spawn, settings |
| **Extension** | `extension/cline/provider.js` | extensionIdPattern, webview |

## 🔧 CDP 포트 현황

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

**다음 가용: 9357~**

## ❓ 도움이 필요한 경우

- 전체 가이드: [PROVIDER_GUIDE.md](https://github.com/vilmire/adhdev/blob/main/docs/PROVIDER_GUIDE.md)
- DOM 탐색 팁: PROVIDER_GUIDE.md 섹션 6
- DevConsole 사용법: PROVIDER_GUIDE.md 섹션 4
