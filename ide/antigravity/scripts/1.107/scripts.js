/**
 * Antigravity CDP Scripts
 *
 * Version routing is handled by ProviderLoader:
 *   - provider.json "versions" field declares script directory overrides
 *   - VersionArchive detects installed Antigravity version at daemon startup
 *   - resolve() picks scripts/legacy/ for < 1.107.0, scripts/ for >= 1.107.0
 *
 * To add support for a new breaking version:
 *   1. Create scripts/v<next>/ with updated scripts
 *   2. Add entry to provider.json "versions" field:
 *      "< X.Y.Z": { "__dir": "scripts/v<next>" }
 *   3. Update "testedVersions" in provider.json
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const SCRIPTS_DIR = path.join(__dirname, 'scripts');

function load(name) {
    try { return fs.readFileSync(path.join(SCRIPTS_DIR, name), 'utf-8'); }
    catch { return null; }
}

module.exports.readChat    = () => load('read_chat.js');
module.exports.focusEditor = () => load('focus_editor.js');
module.exports.listSessions = () => load('list_chats.js');
module.exports.newSession  = () => load('new_session.js');
module.exports.listModels  = () => load('list_models.js');
module.exports.listModes   = () => load('list_modes.js');

module.exports.sendMessage = (text) => {
    const script = load('send_message.js');
    if (!script) return null;
    return script.replace(/\$\{\s*MESSAGE\s*\}/g, JSON.stringify(text));
};

module.exports.switchSession = (sessionId) => {
    const script = load('switch_session.js');
    if (!script) return null;
    return script.replace(/\$\{\s*SESSION_ID\s*\}/g, JSON.stringify(sessionId));
};

module.exports.resolveAction = (params) => {
    const action     = typeof params === 'string' ? params : params?.action || 'approve';
    const buttonText = params?.button || params?.buttonText
        || (action === 'approve' ? 'Accept' : action === 'reject' ? 'Reject' : action);
    const script = load('resolve_action.js');
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
