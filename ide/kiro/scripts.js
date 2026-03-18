/**
 * CDP Scripts for Kiro
 */

module.exports.webviewReadChat = function webviewReadChat() { return loadScript('webview_read_chat.js'); };

module.exports.webviewSendMessage = function webviewSendMessage(text) {
      const s = loadScript('webview_send_message.js');
      return s ? s.replace(/\$\{\s*MESSAGE\s*\}/g, JSON.stringify(text)) : null;
    };

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

module.exports.webviewListSessions = function webviewListSessions() { return loadScript('webview_list_sessions.js'); };

module.exports.webviewNewSession = function webviewNewSession() { return loadScript('webview_new_session.js'); };

module.exports.webviewSwitchSession = function webviewSwitchSession(sessionId) {
      const s = loadScript('webview_switch_session.js');
      return s ? s.replace(/\$\{\s*SESSION_ID\s*\}/g, JSON.stringify(sessionId)) : null;
    };

module.exports.webviewListModels = function webviewListModels() { return loadScript('webview_list_models.js'); };

module.exports.webviewSetModel = function webviewSetModel(params) {
      const model = typeof params === 'string' ? params : params?.model;
      const s = loadScript('webview_set_model.js');
      return s ? s.replace(/\$\{\s*MODEL\s*\}/g, JSON.stringify(model)) : null;
    };

module.exports.webviewListModes = function webviewListModes() { return loadScript('webview_list_modes.js'); };

module.exports.webviewSetMode = function webviewSetMode(params) {
      const mode = typeof params === 'string' ? params : params?.mode;
      const s = loadScript('webview_set_mode.js');
      return s ? s.replace(/\$\{\s*MODE\s*\}/g, JSON.stringify(mode)) : null;
    };

