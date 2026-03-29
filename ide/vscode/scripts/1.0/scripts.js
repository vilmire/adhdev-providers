/**
 * Visual Studio Code (Native GitHub Copilot Chat) — Scripts
 */

const fs = require('fs');
const path = require('path');

function load(name) {
  try { return fs.readFileSync(path.join(__dirname, name), 'utf-8'); }
  catch { return null; }
}

module.exports = {
  // ─── IDE Core ───
  openPanel: () => load('open_panel.js'),
  focusEditor: () => load('focus_editor.js'),

  // ─── Chat Interaction ───
  sendMessage: (params) => {
    let s = load('send_message.js');
    if (!s) return null;
    return `(${s})(${JSON.stringify(params || {})})`;
  },
  readChat: () => load('read_chat.js'),

  // ─── Session Management ───
  newSession: () => load('new_session.js'),
  listSessions: () => load('list_sessions.js'),
  switchSession: (params) => {
    let s = load('switch_session.js');
    if (!s) return null;
    const index = typeof params === 'number' ? params : params?.index ?? 0;
    const title = typeof params === 'string' ? params : params?.title || '';
    return `(${s})(${JSON.stringify({ index, title })})`;
  },

  // ─── Resolution ───
  resolveAction: (params) => {
    let s = load('resolve_action.js');
    if (!s) return null;
    const action = typeof params === 'string' ? params : params?.action || 'approve';
    const buttonText = params?.button || params?.buttonText || (action === 'approve' ? 'Accept' : action === 'reject' ? 'Reject' : action);
    return `(${s})(${JSON.stringify({ action, buttonText })})`;
  },

  // ─── Models ───
  listModels: () => load('list_models.js'),
  setModel: (params) => {
    let s = load('set_model.js');
    if (!s) return null;
    const model = typeof params === 'string' ? params : params?.model;
    return `(${s})(${JSON.stringify({ model })})`;
  },

  // ─── Modes ───
  listModes: () => load('list_modes.js'),
  setMode: (params) => {
    let s = load('set_mode.js');
    if (!s) return null;
    const mode = typeof params === 'string' ? params : params?.mode;
    return `(${s})(${JSON.stringify({ mode })})`;
  },
};
