/**
 * CDP Scripts — Router
 *
 * Version routing is handled by ProviderLoader:
 * Pattern:
 *   - Scripts WITHOUT params: loaded as-is (self-invoking IIFE)
 *   - Scripts WITH params: loaded as function expression, invoked with params JSON
 *     e.g. `(${script})(${JSON.stringify(params)})`
 */

'use strict';

const fs   = require('fs');
const path = require('path');

function load(name) {
    try { return fs.readFileSync(path.join(__dirname, name), 'utf-8'); }
    catch { return null; }
}

function withParams(name, params) {
    let script = load(name);
    if (!script) return null;
    
    // For legacy scripts checking MESSAGE, interpolate them manually
    if (script.includes('${ MESSAGE }')) {
        const msg = params?.MESSAGE || params?.text || '';
        script = script.replace(/\$\{ MESSAGE \}/g, JSON.stringify(msg));
    }
    if (script.includes('${ BUTTON_TEXT }')) {
        const btn = params?.BUTTON_TEXT || params?.buttonText || '';
        script = script.replace(/\$\{ BUTTON_TEXT \}/g, JSON.stringify(btn));
    }
    if (script.includes('${ MODE }')) {
        const mode = params?.mode || '';
        script = script.replace(/\$\{ MODE \}/g, JSON.stringify(mode));
    }
    if (script.includes('${ MODEL }')) {
        const model = params?.model || '';
        script = script.replace(/\$\{ MODEL \}/g, JSON.stringify(model));
    }
    if (script.includes('${ INDEX }')) {
        const index = params?.index ?? 0;
        script = script.replace(/\$\{ INDEX \}/g, JSON.stringify(index));
    }
    if (script.includes('${ TITLE }')) {
        const title = params?.title || '';
        script = script.replace(/\$\{ TITLE \}/g, JSON.stringify(title));
    }

    if (!script.includes('${')) {
        return script;
    }
    
    return `(${script})(${JSON.stringify(params)})`;
}

module.exports.readChat = () => load('read_chat.js');
module.exports.webviewReadChat = module.exports.readChat;

module.exports.sendMessage    = (params) => {
    let s = load('send_message.js');
    if (!s) return null;
    if (s.includes('${ MESSAGE }')) {
        const msg = params?.MESSAGE || params?.text || params || '';
        return s.replace(/\$\{ MESSAGE \}/g, JSON.stringify(msg));
    }
    return withParams('send_message.js', params);
};
module.exports.webviewSendMessage = module.exports.sendMessage;

module.exports.listSessions   = () => load('list_sessions.js');
module.exports.webviewListSessions = module.exports.listSessions;
module.exports.newSession     = () => load('new_session.js');
module.exports.webviewNewSession = module.exports.newSession;
module.exports.focusEditor    = () => load('focus_editor.js');
module.exports.webviewFocusEditor = module.exports.focusEditor;
module.exports.openPanel      = () => load('open_panel.js');
module.exports.listModels     = () => load('list_models.js');
module.exports.webviewListModels = module.exports.listModels;
module.exports.listModes      = () => load('list_modes.js');
module.exports.webviewListModes = module.exports.listModes;

// ─── With params (function expression) ───

module.exports.switchSession = (params) => {
    const index = typeof params === 'number' ? params : params?.index ?? 0;
    const title = typeof params === 'string' ? params : params?.title || null;
    return withParams('switch_session.js', { index, title });
};
module.exports.webviewSwitchSession = module.exports.switchSession;

module.exports.resolveAction = (params) => {
    const action = typeof params === 'string' ? params : params?.action || 'approve';
    const buttonText = params?.button || params?.buttonText
        || (action === 'approve' ? 'Accept' : action === 'reject' ? 'Reject' : action);
    return withParams('resolve_action.js', { buttonText, BUTTON_TEXT: buttonText });
};
module.exports.webviewResolveAction = module.exports.resolveAction;

module.exports.setModel = (params) => {
    const model = typeof params === 'string' ? params : params?.model;
    return withParams('set_model.js', { model });
};
module.exports.webviewSetModel = module.exports.setModel;

module.exports.setMode = (params) => {
    const mode = typeof params === 'string' ? params : params?.mode;
    return withParams('set_mode.js', { mode });
};
module.exports.webviewSetMode = module.exports.setMode;
