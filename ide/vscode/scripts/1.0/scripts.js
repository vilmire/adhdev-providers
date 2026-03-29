/**
 * Visual Studio Code (Native GitHub Copilot Chat) — Scripts
 */

module.exports = {
  // ─── IDE Core ───
  openPanel: require('./open_panel.js'),
  focusEditor: require('./focus_editor.js'),

  // ─── Chat Interaction ───
  sendMessage: require('./send_message.js'),
  readChat: require('./read_chat.js'),

  // ─── Session Management ───
  newSession: require('./new_session.js'),
  listSessions: require('./list_sessions.js'),
  switchSession: require('./switch_session.js'),

  // ─── Resolution ───
  resolveAction: require('./resolve_action.js'),

  // ─── Models ───
  listModels: require('./list_models.js'),
  setModel: require('./set_model.js'),
};
