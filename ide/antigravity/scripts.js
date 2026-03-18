/**
 * CDP Scripts for Antigravity
 */

module.exports.readChat = function readChat() {
      return loadScript('read_chat.js');
    };

module.exports.sendMessage = function sendMessage(text) {
      const script = loadScript('send_message.js');
      if (!script) return null;
      // ${ MESSAGE } 템플릿 변수 치환
      return script.replace(/\$\{\s*MESSAGE\s*\}/g, JSON.stringify(text));
    };

module.exports.listSessions = function listSessions() {
      return loadScript('list_chats.js');
    };

module.exports.switchSession = function switchSession(sessionId) {
      const script = loadScript('switch_session.js');
      if (!script) return null;
      return script.replace(/\$\{\s*SESSION_ID\s*\}/g, JSON.stringify(sessionId));
    };

module.exports.newSession = function newSession() {
      return loadScript('new_session.js');
    };

module.exports.resolveAction = function resolveAction(params) {
      const action = typeof params === 'string' ? params : params?.action || 'approve';
      const buttonText = params?.button || params?.buttonText
        || (action === 'approve' ? 'Accept' : action === 'reject' ? 'Reject' : action);
      const script = loadScript('resolve_action.js');
      if (!script) return null;
      return script.replace(/\$\{\s*BUTTON_TEXT\s*\}/g, JSON.stringify(buttonText));
    };

module.exports.focusEditor = function focusEditor() {
      return loadScript('focus_editor.js');
    };

module.exports.listModels = function listModels() {
      return loadScript('list_models.js');
    };

module.exports.setModel = function setModel(params) {
      const model = typeof params === 'string' ? params : params?.model;
      const script = loadScript('set_model.js');
      if (!script) return null;
      return script.replace(/\$\{\s*MODEL\s*\}/g, JSON.stringify(model));
    };

module.exports.listModes = function listModes() {
      return loadScript('list_modes.js');
    };

module.exports.setMode = function setMode(params) {
      const mode = typeof params === 'string' ? params : params?.mode;
      const script = loadScript('set_mode.js');
      if (!script) return null;
      return script.replace(/\$\{\s*MODE\s*\}/g, JSON.stringify(mode));
    };

