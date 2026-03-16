/**
 * Windsurf — IDE Provider
 * 
 * Category: ide (workbench CDP session — iframe 없음)
 * Cascade 에디터 기반
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
  type: 'windsurf',
  name: 'Windsurf',
  category: 'ide',

  // ─── IDE 인프라 ───
  displayName: 'Windsurf',
  icon: '🏄',
  cli: 'windsurf',
  cdpPorts: [9337, 9338],
  processNames: {
    darwin: 'Windsurf',
  },
  paths: {
    darwin: ['/Applications/Windsurf.app'],
  },

  inputMethod: 'cdp-type-and-send',
  inputSelector: '[contenteditable="true"][role="textbox"]',

  scripts: {
    readChat() { return loadScript('read_chat.js'); },
    sendMessage(text) {
      const s = loadScript('send_message.js');
      return s ? s.replace(/\$\{\s*MESSAGE\s*\}/g, JSON.stringify(text)) : null;
    },
    listSessions() { return loadScript('list_chats.js'); },
    switchSession(sessionId) {
      const s = loadScript('switch_session.js');
      return s ? s.replace(/\$\{\s*SESSION_ID\s*\}/g, JSON.stringify(sessionId)) : null;
    },
    newSession() { return loadScript('new_session.js'); },
    resolveAction(params) {
      const action = typeof params === 'string' ? params : params?.action || 'approve';
      const buttonText = params?.button || params?.buttonText
        || (action === 'approve' ? 'Accept' : action === 'reject' ? 'Reject' : action);
      const s = loadScript('resolve_action.js');
      return s ? s.replace(/\$\{\s*BUTTON_TEXT\s*\}/g, JSON.stringify(buttonText)) : null;
    },
    focusEditor() { return loadScript('focus_editor.js'); },
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
    openPanel() { return loadScript('open_panel.js'); },
  },
};
