/**
 * Script router — same contract as extension/cline (file-per-script).
 * resolve_action: upstream cline passes BUTTON_TEXT only; ${ACTION} must be inlined here.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function load(name) {
  try {
    return fs.readFileSync(path.join(__dirname, name), 'utf-8');
  } catch {
    return null;
  }
}

function getMessageText(params) {
  return typeof params === 'string' ? params : params?.message || '';
}

function withParams(name, params) {
  let script = load(name);
  if (!script) return null;
  if (script.includes('${ MESSAGE }')) {
    const msg = getMessageText(params);
    return script.replace(/\$\{ MESSAGE \}/g, JSON.stringify(msg));
  }
  if (script.includes('${ BUTTON_TEXT }')) {
    const btn = params?.BUTTON_TEXT || params?.buttonText || '';
    return script.replace(/\$\{ BUTTON_TEXT \}/g, JSON.stringify(btn));
  }
  return `(${script})(${JSON.stringify(params)})`;
}

module.exports.readChat = () => load('read_chat.js');

module.exports.sendMessage = (params) => {
  let s = load('send_message.js');
  if (!s) return null;
  if (s.includes('${ MESSAGE }')) {
    const msg = getMessageText(params);
    return s.replace(/\$\{ MESSAGE \}/g, JSON.stringify(msg));
  }
  return withParams('send_message.js', params);
};

module.exports.resolveAction = (params) => {
  const action = typeof params === 'string' ? params : params?.action || 'approve';
  let s = load('resolve_action.js');
  if (!s) return null;
  s = s.replace(/\$\{\s*ACTION\s*\}/g, JSON.stringify(action));
  return s;
};

module.exports.focusEditor = () => load('focus_editor.js');
module.exports.openPanel = () => load('open_panel.js');
