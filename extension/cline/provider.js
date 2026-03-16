/**
 * Cline — Extension Provider
 * 
 * Category: extension (webview CDP session)
 * Roo Code의 원본 fork — 구조 거의 동일 (Fiber 기반)
 * 
 * 차이점:
 *  - extensionId: 'saoudrizwan.claude-dev'
 *  - resolve_action 사용 (Roo Code와 동일 패턴)
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
  type: 'cline',
  name: 'Cline',
  category: 'extension',

  extensionId: 'saoudrizwan.claude-dev',
  extensionIdPattern: /extensionId=saoudrizwan\.claude-dev/i,

  vscodeCommands: {
    focusPanel: 'claude-dev.SidebarProvider.focus',
  },

  scripts: {
    readChat() {
      return loadScript('read_chat.js');
    },

    sendMessage(text) {
      const script = loadScript('send_message.js');
      if (!script) return null;
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

    resolveAction(action) {
      const script = loadScript('resolve_action.js');
      if (!script) return null;
      return script.replace(/\$\{\s*ACTION\s*\}/g, JSON.stringify(action));
    },

    focusEditor() {
      return loadScript('focus_editor.js');
    },

    openPanel() {
      return loadScript('open_panel.js');
    },

    listModels() {
      return loadScript('list_models.js');
    },

    setModel(params) {
      const model = params?.model || params;
      const script = loadScript('set_model.js');
      if (!script) return null;
      return script.replace(/\$\{\s*MODEL\s*\}/g, JSON.stringify(model));
    },

    listModes() {
      return loadScript('list_modes.js');
    },

    setMode(params) {
      const mode = params?.mode || params;
      const script = loadScript('set_mode.js');
      if (!script) return null;
      return script.replace(/\$\{\s*MODE\s*\}/g, JSON.stringify(mode));
    },
  },
};
