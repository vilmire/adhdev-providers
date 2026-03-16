/**
 * Trae — IDE Provider
 * 
 * Category: ide (VS Code fork by ByteDance)
 * AI-powered code editor
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
  type: 'trae',
  name: 'Trae',
  category: 'ide',

  // ─── IDE 인프라 ───
  displayName: 'Trae',
  icon: '🔮',
  cli: 'trae',
  cdpPorts: [9353, 9354],
  processNames: {
    darwin: 'Trae',
    win32: ['Trae.exe'],
    linux: ['trae'],
  },
  paths: {
    darwin: ['/Applications/Trae.app'],
    win32: [
      'C:\\Users\\*\\AppData\\Local\\Programs\\trae\\Trae.exe',
    ],
    linux: ['/opt/trae', '/usr/share/trae'],
  },

  inputMethod: 'cdp-type-and-send',
  inputSelector: '.chat-input-v2-input-box-editable, [contenteditable="true"][role="textbox"]',

  scripts: {
    readChat() { return loadScript('read_chat.js'); },
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
    // 세션 관리
    newSession() { return loadScript('new_session.js'); },
    listSessions() { return loadScript('list_chats.js'); },
    switchSession(sessionId) {
      const s = loadScript('switch_session.js');
      return s ? s.replace(/\$\{\s*SESSION_ID\s*\}/g, JSON.stringify(sessionId)) : null;
    },
    listModels() { return loadScript('list_models.js'); },
    setModel(params) {
      const model = typeof params === 'string' ? params : params?.model;
      const s = loadScript('set_model.js');
      return s ? s.replace(/\$\{\s*MODEL\s*\}/g, JSON.stringify(model)) : null;
    },
    listModes() { return loadScript('list_modes.js'); },
    setMode(params) {
      const mode = typeof params === 'string' ? params : params?.mode;
      const s = loadScript('set_mode.js');
      return s ? s.replace(/\$\{\s*MODE\s*\}/g, JSON.stringify(mode)) : null;
    },
  },
};
