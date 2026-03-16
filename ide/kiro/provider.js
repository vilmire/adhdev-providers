/**
 * Kiro (AWS) — IDE Provider
 * 
 * Category: ide (VS Code fork, Code-OSS based)
 * AWS의 AI-native spec-driven IDE
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
  type: 'kiro',
  name: 'Kiro',
  category: 'ide',

  // ─── IDE 인프라 ───
  displayName: 'Kiro',
  icon: '🪁',
  cli: 'kiro',
  cdpPorts: [9351, 9352],
  processNames: {
    darwin: 'Kiro',
    win32: ['Kiro.exe'],
    linux: ['kiro'],
  },
  paths: {
    darwin: ['/Applications/Kiro.app'],
    win32: [
      'C:\\Users\\*\\AppData\\Local\\Programs\\kiro\\Kiro.exe',
    ],
    linux: ['/opt/kiro', '/usr/share/kiro'],
  },

  inputMethod: 'cdp-type-and-send',
  inputSelector: '[contenteditable="true"][role="textbox"]',

  // Kiro의 채팅 UI는 webview iframe 내부 (extensionId=kiro.kiroAgent)
  webviewMatchText: 'kiro',

  scripts: {
    webviewReadChat() { return loadScript('webview_read_chat.js'); },
    webviewSendMessage(text) {
      const s = loadScript('webview_send_message.js');
      return s ? s.replace(/\$\{\s*MESSAGE\s*\}/g, JSON.stringify(text)) : null;
    },
    sendMessage(text) {
      const s = loadScript('send_message.js');
      return s ? s.replace(/\$\{\s*MESSAGE\s*\}/g, JSON.stringify(text)) : null;
    },
    resolveAction(params) {
      const action = typeof params === 'string' ? params : params?.action || 'approve';
      const buttonText = params?.button || params?.buttonText
        || (action === 'approve' ? 'Accept' : action === 'reject' ? 'Reject' : action);
      const s = loadScript('resolve_action.js');
      return s ? s.replace(/\$\{\s*BUTTON_TEXT\s*\}/g, JSON.stringify(buttonText)) : null;
    },
    openPanel() { return loadScript('open_panel.js'); },
    focusEditor() { return loadScript('focus_editor.js'); },
    // 세션 관리 (webview)
    webviewListSessions() { return loadScript('webview_list_sessions.js'); },
    webviewNewSession() { return loadScript('webview_new_session.js'); },
    webviewSwitchSession(sessionId) {
      const s = loadScript('webview_switch_session.js');
      return s ? s.replace(/\$\{\s*SESSION_ID\s*\}/g, JSON.stringify(sessionId)) : null;
    },
    webviewListModels() { return loadScript('webview_list_models.js'); },
    webviewSetModel(params) {
      const model = typeof params === 'string' ? params : params?.model;
      const s = loadScript('webview_set_model.js');
      return s ? s.replace(/\$\{\s*MODEL\s*\}/g, JSON.stringify(model)) : null;
    },
    webviewListModes() { return loadScript('webview_list_modes.js'); },
    webviewSetMode(params) {
      const mode = typeof params === 'string' ? params : params?.mode;
      const s = loadScript('webview_set_mode.js');
      return s ? s.replace(/\$\{\s*MODE\s*\}/g, JSON.stringify(mode)) : null;
    },
  },
};
