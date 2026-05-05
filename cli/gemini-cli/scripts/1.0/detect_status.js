/**
 * Gemini CLI — detect_status
 * Input:  { tail: string, screenText?: string }
 * Output: 'idle' | 'generating' | 'waiting_approval'
 */
'use strict';

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

function isIdleCue(line) {
    const value = String(line || '').trim();
    return /\?\s*for\s*shortcuts/i.test(value)
        || /Type your message(?:\s+or\s+@path\/to\/file)?/i.test(value)
        || /^>\s*$/.test(value)
        || /[›❯]\s*$/.test(value);
}

function isProgressCue(line) {
    const value = String(line || '').trim();
    return /Waiting for authentication/i.test(value)
        || /Thinking/i.test(value)
        || /Generating/i.test(value)
        || /esc to (cancel|interrupt|stop)/i.test(value);
}

module.exports = function detectStatus(input) {
    const screenText = String(input?.screenText || '');
    const tailText = String(input?.tail || '');
    const text = screenText.trim() ? screenText : tailText;
    if (!text.trim()) return 'idle';

    if (isApprovalText(text)) return 'waiting_approval';

    const lines = text.split(/\r\n|\n|\r/g);
    const lastIdleIndex = lastIndexOfMatch(lines, isIdleCue);
    const lastProgressIndex = lastIndexOfMatch(lines, isProgressCue);

    // Gemini redraws the whole terminal. Stale "Thinking..." rows often remain in
    // the scrollback above the final idle prompt; do not let those keep the chat
    // bubble stuck in streaming/generating forever.
    if (lastIdleIndex >= 0 && lastIdleIndex > lastProgressIndex) return 'idle';
    if (lastProgressIndex >= 0 && lastProgressIndex > lastIdleIndex) return 'generating';

    // A visible Gemini prompt/chrome without a newer progress cue is idle.
    if (/workspace\s*\(\/directory\)/i.test(text) || /\/model/i.test(text)) return 'idle';
    if (screenText.trim()) return 'idle';
    return 'idle';
};
