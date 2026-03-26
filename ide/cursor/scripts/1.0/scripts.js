/**
 * Cursor CDP Scripts — Router
 *
 * Version routing is handled by ProviderLoader:
 *   - provider.json "compatibility" field declares script directory overrides
 *   - VersionArchive detects installed Cursor version at daemon startup
 *   - resolve() picks the appropriate scripts/ directory
 *
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

/** Wrap a function-expression script with params invocation */
function withParams(name, params) {
    const script = load(name);
    if (!script) return null;
    return `(${script})(${JSON.stringify(params)})`;
}

// ─── Core (no params — IIFE) ───

module.exports.readChat       = () => load('read_chat.js');
module.exports.sendMessage    = () => load('send_message.js');
module.exports.listSessions   = () => load('list_sessions.js');
module.exports.newSession     = () => load('new_session.js');
module.exports.focusEditor    = () => load('focus_editor.js');
module.exports.openPanel      = () => load('open_panel.js');
module.exports.listModels     = () => load('list_models.js');
module.exports.listModes      = () => load('list_modes.js');

// ─── With params (function expression) ───

module.exports.switchSession = (params) => {
    const index = typeof params === 'number' ? params : params?.index ?? 0;
    const title = typeof params === 'string' ? params : params?.title || null;
    return withParams('switch_session.js', { index, title });
};

module.exports.resolveAction = (params) => {
    const action = typeof params === 'string' ? params : params?.action || 'approve';
    const buttonText = params?.button || params?.buttonText
        || (action === 'approve' ? 'Run' : action === 'reject' ? 'Skip' : action);
    return withParams('resolve_action.js', { buttonText });
};

module.exports.listNotifications = (params) => {
    const filter = typeof params === 'string' ? params : params?.message || null;
    return withParams('list_notifications.js', { filter });
};

module.exports.dismissNotification = (params) => {
    const index = typeof params === 'number' ? params : params?.index ?? 0;
    const button = typeof params === 'string' ? params : params?.button || null;
    const message = params?.message || null;
    return withParams('dismiss_notification.js', { index, button, message });
};

module.exports.setModel = (params) => {
    const model = typeof params === 'string' ? params : params?.model;
    return withParams('set_model.js', { model });
};

module.exports.setMode = (params) => {
    const mode = typeof params === 'string' ? params : params?.mode;
    return withParams('set_mode.js', { mode });
};
