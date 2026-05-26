/**
 * Codex CLI Scripts — v1.0
 */
'use strict';
const path = require('path');
const DIR  = __dirname;
const nativeHistory = require('../../../_shared/native_history.js');
function loadModule(name) { try { return require(path.join(DIR, name)); } catch { return null; } }

const IDLE_SETTLE_MS = 2000;

function normalizeStatusText(input) {
    return [
        input && input.screenText,
        input && input.tail,
        input && input.rawBuffer,
    ]
        .filter(Boolean)
        .join('\n')
        .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(-4000);
}

function nowMs(input) {
    return Number.isFinite(input && input.now) ? Number(input.now) : Date.now();
}

function shouldSettleIdle(state, input) {
    return Boolean(
        input && input.isWaitingForResponse === true
        || state.lastProviderStatus === 'generating'
    );
}

function settleStatus(state, input, parsed) {
    state = state || {};
    const status = typeof parsed === 'string' ? parsed : parsed && parsed.status;
    if (!status) return parsed;

    if (status !== 'idle') {
        state.idleCandidate = null;
        state.settledIdleSignature = '';
        state.lastProviderStatus = status;
        return parsed;
    }

    const signature = normalizeStatusText(input);
    if (state.settledIdleSignature === signature) {
        state.idleCandidate = null;
        state.lastProviderStatus = 'idle';
        return parsed;
    }

    if (!shouldSettleIdle(state, input)) {
        state.idleCandidate = null;
        state.settledIdleSignature = signature;
        state.lastProviderStatus = 'idle';
        return parsed;
    }

    const now = nowMs(input);
    const candidate = state.idleCandidate;
    if (!candidate || candidate.signature !== signature) {
        state.idleCandidate = { signature, since: now };
        state.settledIdleSignature = '';
        state.lastProviderStatus = 'generating';
        return typeof parsed === 'string'
            ? 'generating'
            : { ...parsed, status: 'generating', parsedStatus: parsed.parsedStatus === 'idle' ? 'generating' : parsed.parsedStatus };
    }

    if (now - candidate.since < IDLE_SETTLE_MS) {
        state.lastProviderStatus = 'generating';
        return typeof parsed === 'string'
            ? 'generating'
            : { ...parsed, status: 'generating', parsedStatus: parsed.parsedStatus === 'idle' ? 'generating' : parsed.parsedStatus };
    }

    state.idleCandidate = null;
    state.settledIdleSignature = signature;
    state.lastProviderStatus = 'idle';
    return parsed;
}

module.exports.createState = () => ({ lastGeneratingAt: 0, lastApprovalText: '', lastProviderStatus: 'idle', idleCandidate: null, settledIdleSignature: '' });

module.exports.parseSession = (state, input) => { const m = loadModule('parse_session.js'); return m ? settleStatus(state, input, m(input)) : null; };
module.exports.parseOutput   = (state, input) => { const m = loadModule('parse_output.js'); return m ? settleStatus(state, input, m(input)) : null; };
module.exports.detectStatus  = (state, input) => { const m = loadModule('detect_status.js'); return m ? settleStatus(state, input, m(input)) : null; };
module.exports.parseApproval = (state, input) => { const m = loadModule('parse_approval.js'); return m ? m(input) : null; };
module.exports.readNativeHistory = nativeHistory.readCodexNativeHistory;
module.exports.listNativeHistory = nativeHistory.listCodexNativeHistory;
module.exports.listModels = (state, input) => { const m = loadModule('list_models.js'); return m ? m(input) : null; };
module.exports.setFast = (state, input) => { const m = loadModule('set_fast.js'); return m ? m(input) : null; };
module.exports.openModelPicker = (state, input) => { const m = loadModule('open_model_picker.js'); return m ? m(input) : null; };
