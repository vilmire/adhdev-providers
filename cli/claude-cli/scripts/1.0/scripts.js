/**
 * Claude Code CLI Scripts — v1.0
 *
 * CLI scripts differ from IDE scripts:
 *   - IDE scripts return JS code strings for CDP evaluate (browser context)
 *   - CLI scripts are Node.js functions that receive PTY buffer and return structured data
 *
 * Each export receives an `input` object:
 *   {
 *     buffer: string,
 *     rawBuffer: string,
 *     recentBuffer: string,
 *     screenText: string,
 *     screen: { lines, promptLineIndex, linesAbovePrompt, linesBelowPrompt, ... },
 *     messages: Array
 *   }
 * and returns a result conforming to the output contract.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const DIR  = __dirname;
const nativeHistory = require('../../../_shared/native_history.js');

function loadModule(name) {
    try { return require(path.join(DIR, name)); }
    catch { return null; }
}

// ─── Core ───

/** Parse full PTY output → ReadChatResult */
module.exports.parseOutput = (input) => {
    const mod = loadModule('parse_output.js');
    return mod ? mod(input) : null;
};

/** Lightweight status detection (100ms polling) → AgentStatus string */
module.exports.detectStatus = (input) => {
    const mod = loadModule('detect_status.js');
    return mod ? mod(input) : null;
};

/** Parse approval modal from PTY output → ModalInfo | null */
module.exports.parseApproval = (input) => {
    const mod = loadModule('parse_approval.js');
    return mod ? mod(input) : null;
};

module.exports.readNativeHistory = nativeHistory.readClaudeNativeHistory;
module.exports.listNativeHistory = nativeHistory.listClaudeNativeHistory;

// ─── Controls ───

/** List available models for the model selector */
module.exports.listModels = (input) => {
    const mod = loadModule('list_models.js');
    return mod ? mod(input) : null;
};

/** Set the active model via /model command */
module.exports.setModel = (input) => {
    const mod = loadModule('set_model.js');
    return mod ? mod(input) : null;
};

/** Set effort level via /effort command */
module.exports.setEffort = (input) => {
    const mod = loadModule('set_effort.js');
    return mod ? mod(input) : null;
};

/** Start a new session via /clear command */
module.exports.newSession = (input) => {
    const mod = loadModule('new_session.js');
    return mod ? mod(input) : null;
};

/** Toggle compact output mode via /compact command */
module.exports.setCompact = (input) => {
    const mod = loadModule('set_compact.js');
    return mod ? mod(input) : null;
};
