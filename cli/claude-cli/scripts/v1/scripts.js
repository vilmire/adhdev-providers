/**
 * Claude Code CLI Scripts — v1.0
 *
 * CLI scripts differ from IDE scripts:
 *   - IDE scripts return JS code strings for CDP evaluate (browser context)
 *   - CLI scripts are Node.js functions that receive PTY buffer and return structured data
 *
 * Each export receives (state, input) where:
 *   - state: opaque object created by createState() once per session; mutate freely
 *   - input: { buffer, rawBuffer, recentBuffer, screenText, screen, messages, ... }
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

// ─── State factory ───

/**
 * Per-session state for claude-cli scripts.
 * - lastGeneratingAt: timestamp when generating was last confidently detected
 * - lastApprovalText: normalized text of the last seen approval prompt (dedup)
 * - spinnerStabilityCount: consecutive generating signals before locking status
 */
module.exports.createState = () => ({
    lastGeneratingAt: 0,
    lastApprovalText: '',
    spinnerStabilityCount: 0,
    consecutiveIdleFrames: 0,
});

function resolveInput(state, input) {
    return input === undefined ? state : input;
}

// ─── Core ───

/** Parse full PTY output → ReadChatResult */
module.exports.parseSession = (state, input) => { const m = loadModule('parse_session.js'); return m ? m(resolveInput(state, input)) : null; };
module.exports.parseOutput = (state, input) => {
    const mod = loadModule('parse_output.js');
    return mod ? mod(input) : null;
};

/** Lightweight status detection (100ms polling) → AgentStatus string */
module.exports.detectStatus = (state, input) => {
    const mod = loadModule('detect_status.js');
    return mod ? mod(state, input) : null;
};

/** Parse approval modal from PTY output → ModalInfo | null */
module.exports.parseApproval = (state, input) => {
    const mod = loadModule('parse_approval.js');
    return mod ? mod(input) : null;
};

module.exports.readNativeHistory = nativeHistory.readClaudeNativeHistory;
module.exports.listNativeHistory = nativeHistory.listClaudeNativeHistory;

// ─── Controls ───

/** List available models for the model selector */
module.exports.listModels = (state, input) => {
    const mod = loadModule('list_models.js');
    return mod ? mod(input) : null;
};

/** Set the active model via /model command */
module.exports.setModel = (state, input) => {
    const mod = loadModule('set_model.js');
    return mod ? mod(input) : null;
};

/** Set effort level via /effort command */
module.exports.setEffort = (state, input) => {
    const mod = loadModule('set_effort.js');
    return mod ? mod(input) : null;
};

/** Start a new session via /clear command */
module.exports.newSession = (state, input) => {
    const mod = loadModule('new_session.js');
    return mod ? mod(input) : null;
};

/** Toggle compact output mode via /compact command */
module.exports.setCompact = (state, input) => {
    const mod = loadModule('set_compact.js');
    return mod ? mod(input) : null;
};
