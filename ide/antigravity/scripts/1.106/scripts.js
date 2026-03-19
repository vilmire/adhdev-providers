/**
 * Antigravity CDP Scripts — legacy (< 1.107.0)
 * DOM uses exact CSS class selectors (original Tailwind classes without arbitrary values)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const DIR  = __dirname;  // scripts/legacy/

function load(name) {
    try { return fs.readFileSync(path.join(DIR, name), 'utf-8'); }
    catch { return null; }
}

// Non-model/mode scripts fall back to parent scripts/
const PARENT_DIR = path.join(DIR, '..');
function loadParent(name) {
    try { return fs.readFileSync(path.join(PARENT_DIR, name), 'utf-8'); }
    catch { return null; }
}

module.exports.readChat     = () => loadParent('read_chat.js');
module.exports.focusEditor  = () => loadParent('focus_editor.js');
module.exports.listSessions = () => loadParent('list_chats.js');
module.exports.newSession   = () => loadParent('new_session.js');
module.exports.listModels   = () => load('list_models.js');
module.exports.listModes    = () => load('list_modes.js');

module.exports.sendMessage = (text) => {
    const script = loadParent('send_message.js');
    if (!script) return null;
    return script.replace(/\$\{\s*MESSAGE\s*\}/g, JSON.stringify(text));
};

module.exports.switchSession = (sessionId) => {
    const script = loadParent('switch_session.js');
    if (!script) return null;
    return script.replace(/\$\{\s*SESSION_ID\s*\}/g, JSON.stringify(sessionId));
};

module.exports.resolveAction = (params) => {
    const action     = typeof params === 'string' ? params : params?.action || 'approve';
    const buttonText = params?.button || params?.buttonText
        || (action === 'approve' ? 'Accept' : action === 'reject' ? 'Reject' : action);
    const script = loadParent('resolve_action.js');
    if (!script) return null;
    return script.replace(/\$\{\s*BUTTON_TEXT\s*\}/g, JSON.stringify(buttonText));
};

module.exports.setModel = (params) => {
    const model = typeof params === 'string' ? params : params?.model;
    const script = load('set_model.js');
    if (!script) return null;
    return script.replace(/\$\{\s*MODEL\s*\}/g, JSON.stringify(model));
};

module.exports.setMode = (params) => {
    const mode = typeof params === 'string' ? params : params?.mode;
    const script = load('set_mode.js');
    if (!script) return null;
    return script.replace(/\$\{\s*MODE\s*\}/g, JSON.stringify(mode));
};
