/**
 * Codex CLI — detect_status
 */
'use strict';

function sourceText(input) {
    return `${String(input?.screenText || '')}\n${String(input?.tail || '')}`;
}

function hasWelcomeScreen(text) {
    return /OpenAI Codex/i.test(text)
        && /To get started, describe a task/i.test(text);
}

function hasStartupApproval(text) {
    return /You are running Codex in/i.test(text)
        && /Press Enter to continue/i.test(text)
        && /(?:^|\n)[▌> \t]*1\.\s+/m.test(text)
        && /(?:^|\n)[▌> \t]*2\.\s+/m.test(text);
}

function hasCommandApproval(text) {
    const hasAllowPrompt = /Allow Codex to (?:run|apply)/i.test(text)
        || /Allow command\?/i.test(text);
    const hasButtons = /Approve and run now/i.test(text)
        || /Always approve this session/i.test(text)
        || /(?:^|\n)[▌> \t]*1\.\s+.*(?:approve|allow|run)/im.test(text)
        || /(?:^|\n)[▌> \t]*2\.\s+.*(?:always|session)/im.test(text);
    const hasFooter = /Press Enter to confirm/i.test(text)
        || /Esc to cancel/i.test(text);
    return hasAllowPrompt
        || (hasButtons && hasFooter)
        || /Approve and run now/i.test(text)
        || /Always approve this session/i.test(text)
        || /Allow command\?/i.test(text)
        || /(?:^|\n)[▌> \t]*1\.\s+.*(?:approve|allow|run)/im.test(text);
}

module.exports = function detectStatus(input) {
    const text = sourceText(input);
    if (!text.trim()) return 'idle';

    if (hasStartupApproval(text) || hasCommandApproval(text)) return 'waiting_approval';

    if (/Esc to interrupt/i.test(text)) return 'generating';
    if (/(?:Thinking|Planning|Searching|Reading|Working|Analyzing|Inspecting|Responding|Following instructions clearly)[^\n]*\(\d+s\b/i.test(text)) {
        return 'generating';
    }
    if (/[⠁-⣿]/.test(text) && /(?:Working|Thinking|Esc to interrupt)/i.test(text)) return 'generating';

    if (hasWelcomeScreen(text)) return 'idle';
    if (/⏎\s+send/i.test(text)) return 'idle';

    return 'idle';
};
