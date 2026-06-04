/**
 * Codex CLI Scripts — v1.0
 */
'use strict';
const path = require('path');
const DIR  = __dirname;
const nativeHistory = require('../../../_shared/native_history.js');
function loadModule(name) { try { return require(path.join(DIR, name)); } catch { return null; } }

const IDLE_SETTLE_MS = 2000;

function normalizeBasicStatusText(value) {
    return String(value || '')
        .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(-4000);
}

function normalizeStatusText(input) {
    const visibleText = [
        input && input.screenText,
        input && input.tail,
    ]
        .filter(Boolean)
        .join('\n');
    const source = hasVisibleIdlePrompt(input)
        ? visibleText
        : [visibleText, input && input.rawBuffer].filter(Boolean).join('\n');
    return normalizeBasicStatusText(source);
}

function nowMs(input) {
    return Number.isFinite(input && input.now) ? Number(input.now) : Date.now();
}

function resolveInput(state, input) {
    return input === undefined ? state : input;
}

function shouldSettleIdle(state, input) {
    return Boolean(
        input && input.isWaitingForResponse === true
        || state.lastProviderStatus === 'generating'
    );
}

function hasFinalAssistantMessage(parsed) {
    const messages = Array.isArray(parsed && parsed.messages) ? parsed.messages : [];
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return false;
    if (last.bubbleState === 'streaming') return false;
    if (last.meta && last.meta.streaming === true) return false;
    return String(last.content || '').trim().length > 0;
}

function hasVisibleIdlePrompt(input) {
    const text = normalizeBasicStatusText([
        input && input.screenText,
        input && input.tail,
    ].filter(Boolean).join('\n'));
    return /(?:^|\s)[›❯>]\s*(?:gpt-|o\d\b|codex-)[\w._-]*(?:\s+(?:none|minimal|low|medium|high|xhigh|max|fast))*\s+·/i.test(text)
        || /(?:^|\s)(?:gpt-|o\d\b|codex-)[\w._-]*(?:\s+(?:none|minimal|low|medium|high|xhigh|max|fast))*\s+·\s*(?:\/|~)/i.test(text)
        || /(?:^|\s)[›❯]\s*(?:tab to queue message\b|$)/i.test(text);
}

function hasStartupIdlePrompt(input) {
    const text = [
        input && input.screenText,
        input && input.tail,
    ]
        .filter(Boolean)
        .join('\n')
        .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(-4000);
    return /OpenAI Codex/i.test(text)
        && /(?:Find and fix a bug in @filename|Improve documentation in @filename|Write tests for @filename|Explain this codebase|Summarize recent commits|Implement \{feature\}|Use \/skills|Run \/review on my current changes)/i.test(text)
        && hasVisibleIdlePrompt(input)
        && !/esc to interrupt|Starting MCP servers?|Working\s*\(\d+s\b/i.test(text);
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

    if (hasStartupIdlePrompt(input)) {
        state.idleCandidate = null;
        state.settledIdleSignature = normalizeStatusText(input);
        state.lastProviderStatus = 'idle';
        return parsed;
    }

    if (typeof parsed !== 'string' && hasFinalAssistantMessage(parsed) && hasVisibleIdlePrompt(input)) {
        state.idleCandidate = null;
        state.settledIdleSignature = normalizeStatusText(input);
        state.lastProviderStatus = 'idle';
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
    // (fix) Carry `since` forward when the signature changes — the screen
    // can vary by 1ch between frames (cursor blink, footer timestamp,
    // background tool progress lines) and the prior implementation
    // reset `since` on every variation, so the IDLE_SETTLE_MS window
    // never elapsed and detect_status stayed pinned to `generating`
    // forever once a user turn started. Treat any idle verdict in the
    // window as a continuation of the same idle observation.
    const candidateSince = (candidate && Number.isFinite(candidate.since)) ? candidate.since : now;
    if (!candidate) {
        state.idleCandidate = { signature, since: now };
        state.lastProviderStatus = 'generating';
        return typeof parsed === 'string'
            ? 'generating'
            : { ...parsed, status: 'generating', parsedStatus: parsed.parsedStatus === 'idle' ? 'generating' : parsed.parsedStatus };
    }
    if (candidate.signature !== signature) {
        state.idleCandidate = { signature, since: candidateSince };
    }

    if (now - candidateSince < IDLE_SETTLE_MS) {
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

module.exports.parseSession = (state, input) => { const m = loadModule('parse_session.js'); const resolved = resolveInput(state, input); return m ? settleStatus(state, resolved, m(resolved)) : null; };
module.exports.parseOutput   = (state, input) => { const m = loadModule('parse_output.js'); const resolved = resolveInput(state, input); return m ? settleStatus(state, resolved, m(resolved)) : null; };
module.exports.detectStatus  = (state, input) => { const m = loadModule('detect_status.js'); const resolved = resolveInput(state, input); return m ? settleStatus(state, resolved, m(resolved)) : null; };
module.exports.parseApproval = (state, input) => { const m = loadModule('parse_approval.js'); return m ? m(input) : null; };
module.exports.readNativeHistory = nativeHistory.readCodexNativeHistory;
module.exports.listNativeHistory = nativeHistory.listCodexNativeHistory;
module.exports.listModels = (state, input) => { const m = loadModule('list_models.js'); return m ? m(input) : null; };
module.exports.setFast = (state, input) => { const m = loadModule('set_fast.js'); return m ? m(input) : null; };
module.exports.openModelPicker = (state, input) => { const m = loadModule('open_model_picker.js'); return m ? m(input) : null; };
module.exports.openReasoningPicker = (state, input) => { const m = loadModule('open_reasoning_picker.js'); return m ? m(input) : null; };
