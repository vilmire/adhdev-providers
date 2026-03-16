/**
 * Antigravity — IDE Provider
 * 
 * Category: ide (workbench CDP session — iframe 없음, 직접 DOM 접근)
 * 
 * 특이 사항:
 *  - contenteditable[role="textbox"] 입력 (Lexical 에디터)
 *  - send_message에서 Enter keydown+keypress+keyup full sequence 필요 (composed: true)
 *  - switch_session에서 CDP 마우스 클릭 좌표 반환 (needsTypeAndSend 아님, Input.dispatchMouseEvent)
 *  - resolve_action 사용
 * 
 * @type {import('../../../src/providers/contracts').ProviderModule}
 */
const fs = require('fs');
const path = require('path');

const SCRIPTS_DIR = path.join(__dirname, 'scripts');

function loadScript(name) {
  try {
    return fs.readFileSync(path.join(SCRIPTS_DIR, name), 'utf8');
  } catch {
    return null;
  }
}

module.exports = {
  // ─── 메타데이터 ───
  type: 'antigravity',
  name: 'Antigravity',
  category: 'ide',

  // ─── IDE 인프라 ───
  displayName: 'Antigravity',
  icon: '🚀',
  cli: 'antigravity',
  cdpPorts: [9335, 9336],
  processNames: {
    darwin: 'Antigravity',
    win32: ['Antigravity.exe'],
  },
  paths: {
    darwin: ['/Applications/Antigravity.app'],
    win32: ['C:\\Users\\*\\AppData\\Local\\Programs\\antigravity\\Antigravity.exe'],
    linux: ['/opt/Antigravity', '/usr/share/antigravity'],
  },

  // ─── Input method ───
  inputMethod: 'cdp-type-and-send',
  inputSelector: '[contenteditable="true"][role="textbox"]',

  // ─── CDP 스크립트 ───
  scripts: {
    readChat() {
      return loadScript('read_chat.js');
    },

    sendMessage(text) {
      const script = loadScript('send_message.js');
      if (!script) return null;
      // ${ MESSAGE } 템플릿 변수 치환
      return script.replace(/\$\{\s*MESSAGE\s*\}/g, JSON.stringify(text));
    },

    listSessions() {
      return loadScript('list_chats.js');
    },

    switchSession(sessionId) {
      const script = loadScript('switch_session.js');
      if (!script) return null;
      return script.replace(/\$\{\s*SESSION_ID\s*\}/g, JSON.stringify(sessionId));
    },

    newSession() {
      return loadScript('new_session.js');
    },

    resolveAction(params) {
      const action = typeof params === 'string' ? params : params?.action || 'approve';
      const buttonText = params?.button || params?.buttonText
        || (action === 'approve' ? 'Accept' : action === 'reject' ? 'Reject' : action);
      const script = loadScript('resolve_action.js');
      if (!script) return null;
      return script.replace(/\$\{\s*BUTTON_TEXT\s*\}/g, JSON.stringify(buttonText));
    },

    focusEditor() {
      return loadScript('focus_editor.js');
    },

    listModels() {
      return loadScript('list_models.js');
    },

    setModel(params) {
      const model = typeof params === 'string' ? params : params?.model;
      const script = loadScript('set_model.js');
      if (!script) return null;
      return script.replace(/\$\{\s*MODEL\s*\}/g, JSON.stringify(model));
    },

    listModes() {
      return loadScript('list_modes.js');
    },

    setMode(params) {
      const mode = typeof params === 'string' ? params : params?.mode;
      const script = loadScript('set_mode.js');
      if (!script) return null;
      return script.replace(/\$\{\s*MODE\s*\}/g, JSON.stringify(mode));
    },
  },
};
