/**
 * CDP Scripts for Trae
 */

module.exports.readChat = function readChat() { return loadScript('read_chat.js'); };

module.exports.sendMessage = function sendMessage(text) {
      const s = loadScript('send_message.js');
      return s ? s.replace(/\$\{\s*MESSAGE\s*\}/g, JSON.stringify(text)) : null;
    };

module.exports.resolveAction = function resolveAction(params) {
      const action = typeof params === 'string' ? params : params?.action || 'approve';
      const buttonText = params?.button || params?.buttonText
        || (action === 'approve' ? 'Accept' : action === 'reject' ? 'Reject' : action);
      const s = loadScript('resolve_action.js');
      return s ? s.replace(/\$\{\s*BUTTON_TEXT\s*\}/g, JSON.stringify(buttonText)) : null;
    };

module.exports.openPanel = function openPanel() { return loadScript('open_panel.js'); };

module.exports.focusEditor = function focusEditor() { return loadScript('focus_editor.js'); };

module.exports.newSession = function newSession() { return loadScript('new_session.js'); };

module.exports.listSessions = function listSessions() { return loadScript('list_chats.js'); };

module.exports.switchSession = function switchSession(sessionId) {
      const s = loadScript('switch_session.js');
      return s ? s.replace(/\$\{\s*SESSION_ID\s*\}/g, JSON.stringify(sessionId)) : null;
    };

module.exports.listModels = function listModels() { return loadScript('list_models.js'); };

module.exports.setModel = function setModel(params) {
      const model = typeof params === 'string' ? params : params?.model;
      const s = loadScript('set_model.js');
      return s ? s.replace(/\$\{\s*MODEL\s*\}/g, JSON.stringify(model)) : null;
    };

module.exports.listModes = function listModes() { return loadScript('list_modes.js'); };

module.exports.setMode = function setMode(params) {
      const mode = typeof params === 'string' ? params : params?.mode;
      const s = loadScript('set_mode.js');
      return s ? s.replace(/\$\{\s*MODE\s*\}/g, JSON.stringify(mode)) : null;
    };

