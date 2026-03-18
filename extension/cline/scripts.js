/**
 * CDP Scripts for Cline
 */

const fs = require('fs');
const path = require('path');
const SCRIPTS_DIR = path.join(__dirname, 'scripts');
function loadScript(name) {
  try { return fs.readFileSync(path.join(SCRIPTS_DIR, name), 'utf8'); }
  catch { return null; }
}


module.exports.readChat = function readChat() {
      return loadScript('read_chat.js');
    };

module.exports.sendMessage = function sendMessage(text) {
      const script = loadScript('send_message.js');
      if (!script) return null;
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

module.exports.resolveAction = function resolveAction(action) {
      const script = loadScript('resolve_action.js');
      if (!script) return null;
      return script.replace(/\$\{\s*ACTION\s*\}/g, JSON.stringify(action));
    };

module.exports.focusEditor = function focusEditor() {
      return loadScript('focus_editor.js');
    };

module.exports.openPanel = function openPanel() {
      return loadScript('open_panel.js');
    };

module.exports.listModels = function listModels() {
      return loadScript('list_models.js');
    };

module.exports.setModel = function setModel(params) {
      const model = params?.model || params;
      const script = loadScript('set_model.js');
      if (!script) return null;
      return script.replace(/\$\{\s*MODEL\s*\}/g, JSON.stringify(model));
    };

module.exports.listModes = function listModes() {
      return loadScript('list_modes.js');
    };

module.exports.setMode = function setMode(params) {
      const mode = params?.mode || params;
      const script = loadScript('set_mode.js');
      if (!script) return null;
      return script.replace(/\$\{\s*MODE\s*\}/g, JSON.stringify(mode));
    };

