/**
 * Claude Code — detect_status
 *
 * Uses the current visible PTY screen when available.
 * `tail` is still used as a fallback for older runtimes.
 */

'use strict';

function splitLines(text) {
    return String(text || '')
        .replace(/\u0007/g, '')
        .split(/\r\n|\n|\r/g)
        .map(line => line.replace(/\s+$/, ''));
}

function normalize(line) {
    return String(line || '')
        .replace(/\u0007/g, '')
        .replace(/^\d+;/, '')
        .trim();
}

function isVisiblePrompt(line) {
    return /^❯\s*$/.test(normalize(line));
}

function isVisibleApproval(line) {
    const trimmed = normalize(line);
    return /Allow\s*once/i.test(trimmed)
        || /Always\s*allow/i.test(trimmed)
        || /Deny|Reject|Cancel/i.test(trimmed)
        || /\(y\/n\)/i.test(trimmed)
        || /\[Y\/n\]/i.test(trimmed);
}

function isVisibleSpinner(line) {
    const trimmed = normalize(line);
    if (!trimmed) return false;
    if (/^[✻✶✳✢✽⠂⠐⠒⠓⠦⠴⠶⠷⠿]+$/.test(trimmed)) return true;
    if (/esc to (cancel|interrupt|stop)/i.test(trimmed)) return true;
    if (/(?:Finagling|Scurrying|Bloviating|Whatchamacallit(?:ing)?|Thinking|Processing|Working|Analyzing|Planning|Drafting|Synthesizing|Inspecting|Reading|Searching)\u2026?$/i.test(trimmed)) return true;
    return false;
}

module.exports = function detectStatus(input) {
    const tail = String(input?.tail || '');
    const screenText = String(input?.screenText || '');
    const visibleLines = splitLines(screenText);
    const visibleText = visibleLines.map(normalize).filter(Boolean).join('\n');
    const approvalText = visibleText || tail;

    if (approvalText) {
        const hasApproval = visibleLines.some(isVisibleApproval)
            || /Allow\s*once/i.test(approvalText)
            || /Always\s*allow/i.test(approvalText)
            || /\(y\/n\)|\[Y\/n\]/i.test(approvalText);
        if (hasApproval) return 'waiting_approval';
    }

    if (visibleLines.length > 0) {
        const hasSpinner = visibleLines.some(isVisibleSpinner);
        if (hasSpinner) return 'generating';

        const hasPrompt = visibleLines.some(isVisiblePrompt);
        if (hasPrompt) return 'idle';
    }

    if (/[\u2800-\u28ff]/.test(tail)) return 'generating';
    if (/esc to (cancel|interrupt|stop)/i.test(tail)) return 'generating';
    if (/(?:Finagling|Scurrying|Bloviating|Whatchamacallit(?:ing)?|Thinking|Processing|Working|Analyzing|Planning|Drafting|Synthesizing|Inspecting|Reading|Searching)\u2026?$/i.test(tail)) return 'generating';

    return 'idle';
};
