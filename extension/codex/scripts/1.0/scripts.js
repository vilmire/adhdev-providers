'use strict';

const fs = require('fs');
const path = require('path');

function load(name) {
  try {
    return fs.readFileSync(path.join(__dirname, name), 'utf8');
  } catch (e) {
    return null;
  }
}

function withParams(name, params) {
  const script = load(name);
  if (!script) return null;
  return `(${script})(${JSON.stringify(params ?? {})})`;
}

module.exports.clickConversationWebview = () => load('click_conversation_webview.js');
module.exports.exploreChatWebview = () => load('explore_chat_webview.js');
module.exports.exploreControlsWebview = () => load('explore_controls_webview.js');
module.exports.exploreDom = () => load('explore_dom.js');
module.exports.exploreDropdownWebview = () => load('explore_dropdown_webview.js');
module.exports.exploreSessionsWebview = (params) => withParams('explore_sessions_webview.js', params);
module.exports.inspectCodeWebview = () => load('inspect_code_webview.js');
module.exports.listModels = () => load('list_models.js');
module.exports.listModes = () => load('list_modes.js');
module.exports.listSessions = () => load('list_sessions.js');
module.exports.messageStructureWebview = () => load('message_structure_webview.js');
module.exports.newSession = () => load('new_session.js');
module.exports.readChat = () => load('read_chat.js');

module.exports.resolveAction = (params) => withParams('resolve_action.js', params);

module.exports.sendMessage = (params) => {
  const normalized = typeof params === 'string' ? { message: params } : params;
  return withParams('send_message.js', normalized);
};

module.exports.setMode = (params) => withParams('set_mode.js', params);

module.exports.setModel = (params) => withParams('set_model.js', params);
module.exports.focusEditor = () => load('focus_editor.js');
module.exports.openPanel = () => load('open_panel.js');

module.exports.switchSession = (params) => {
  const normalized = typeof params === 'string'
    ? { title: params }
    : { index: params?.index, title: params?.title };
  return withParams('switch_session.js', normalized);
};
