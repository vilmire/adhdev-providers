/**
 * Gemini CLI — detect_status
 * Input:  { tail: string, screenText?: string }
 * Output: 'idle' | 'generating' | 'waiting_approval'
 */
'use strict';

function stripAnsi(value) {
    return String(value || '')
        .replace(/\x1B\[(\d*)C/g, (_match, n) => ' '.repeat(Math.max(1, Number(n) || 1)))
        .replace(/\x1B\[\d*D/g, '')
        .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
        .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, '')
        .replace(/\x1B[P^_X][\s\S]*?(?:\x07|\x1B\\)/g, '')
        .replace(/\x1B(?:[@-Z\\-_])/g, '')
        .replace(/\u0007/g, '');
}

function normalizeText(value) {
    return stripAnsi(String(value || '')).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function lastIndexOfMatch(lines, matcher) {
    for (let index = lines.length - 1; index >= 0; index -= 1) {
        if (matcher(lines[index], index)) return index;
    }
    return -1;
}

function isApprovalText(text) {
    return /Allow\s*once/i.test(text)
        || /Always\s*allow/i.test(text)
        || /\(y\/n\)/i.test(text)
        || /\[Y\/n\]/i.test(text)
        || /Run\s*this\s*command/i.test(text)
        || (/Deny/i.test(text) && /Allow/i.test(text))
        || (/auto-?approve/i.test(text) && /Deny/i.test(text));
}

function isProgressCue(line) {
    const value = String(line || '').trim();
    return /Waiting for authentication/i.test(value)
        || /Thinking/i.test(value)
        || /Generating/i.test(value)
        || /esc to (cancel|interrupt|stop)/i.test(value);
}

function isIdleCue(line) {
    const value = String(line || '').trim();
    if (!value || isProgressCue(value)) return false;
    return /Type your message(?:\s+or\s+@path\/to\/file)?/i.test(value)
        || /^>\s*$/.test(value)
        || /[›❯]\s*$/.test(value);
}

function isAssistantCue(line) {
    return /^\s*✦\s+/.test(String(line || ''));
}

module.exports = function detectStatus(input) {
    const screenText = normalizeText(input?.screenText || '');
    const tailText = normalizeText(input?.tail || '');
    const text = screenText.trim() ? screenText : tailText;
    if (!text.trim()) return 'idle';

    if (isApprovalText(text)) return 'waiting_approval';

    const lines = text.split(/\n/g);
    const lastIdleIndex = lastIndexOfMatch(lines, isIdleCue);
    const lastProgressIndex = lastIndexOfMatch(lines, isProgressCue);
    const lastAssistantIndex = lastIndexOfMatch(lines, isAssistantCue);

    // Gemini redraws the full terminal. A live Thinking row often shares the
    // same row with footer chrome like "? for shortcuts", and the bottom input
    // box can remain visible while a turn is still running. Treat visible
    // progress as authoritative unless a newer assistant answer and idle prompt
    // prove the progress row is stale scrollback/redraw residue.
    if (lastProgressIndex >= 0) {
        const progressResolvedByAnswer = lastAssistantIndex > lastProgressIndex && lastIdleIndex > lastAssistantIndex;
        if (progressResolvedByAnswer) return 'idle';
        if (lastProgressIndex >= lastIdleIndex) return 'generating';
        if (input?.isWaitingForResponse) return 'generating';
        return 'idle';
    }

    if (lastIdleIndex >= 0) return 'idle';

    // A visible Gemini prompt/chrome without a progress cue is idle.
    if (/workspace\s*\(\/directory\)/i.test(text) || /\/model/i.test(text)) return 'idle';
    if (screenText.trim()) return 'idle';
    return 'idle';
};
