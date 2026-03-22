/**
 * CDP Scripts for Codex (openai.chatgpt)
 *
 * All scripts run inside the Codex webview frame via evaluateInWebviewFrame.
 * Script names containing "Webview" are automatically routed through
 * evaluateInWebviewFrame by DevServer.
 *
 * For production (ProviderInstance), the AgentStreamAdapter calls
 * evaluateInWebviewFrame directly using the provider's webviewMatchText.
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

module.exports.resolveAction = function resolveAction(action) {
  const script = loadScript('resolve_action.js');
  if (!script) return null;
  return script.replace(/\$\{\s*ACTION\s*\}/g, JSON.stringify(action));
};

// ─── DevConsole debug helpers (names contain "Webview" for auto-routing) ───

module.exports.readChatWebview = function readChatWebview() {
  return loadScript('read_chat.js');
};

module.exports.sendMessageWebview = function sendMessageWebview(text) {
  const script = loadScript('send_message.js');
  if (!script) return null;
  return script.replace(/\$\{\s*MESSAGE\s*\}/g, JSON.stringify(text));
};

module.exports.exploreWebview = function exploreWebview() {
  return loadScript('explore_dom.js');
};

module.exports.exploreChatWebview = function exploreChatWebview() {
  return loadScript('explore_chat_webview.js');
};

module.exports.messageStructureWebview = function messageStructureWebview() {
  return loadScript('message_structure_webview.js');
};
