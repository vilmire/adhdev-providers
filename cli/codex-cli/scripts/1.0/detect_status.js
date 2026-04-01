/**
 * Codex CLI — detect_status
 */
'use strict';

function getScreenText(input) {
    return String(input?.screenText || '');
}

function getTailText(input) {
    return String(input?.tail || '');
}

function splitLines(text) {
    return String(text || '')
        .split(/\r\n|\n|\r/g)
        .map(line => line.replace(/\s+$/, ''));
}

function normalize(line) {
    return String(line || '')
        .replace(/\u0007/g, '')
        .replace(/^\d+;/, '')
        .trim();
}

function takeLast(lines, count) {
    return lines.slice(Math.max(0, lines.length - count));
}

function findLastPromptIndex(lines) {
    for (let index = lines.length - 1; index >= 0; index -= 1) {
        const line = normalize(lines[index]);
        if (/^[>›❯]\s*$/.test(line)) return index;
        if (/⏎\s+send/i.test(line)) return index;
    }
    return -1;
}

function hasIdlePrompt(text) {
    const trimmed = String(text || '').trim();
    return /⏎\s+send/i.test(text) || /^>\s*$/m.test(text) || /[›❯]\s*$/.test(trimmed);
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

function hasVisibleApproval(lines) {
    const window = takeLast(lines, 18);
    const block = window.join('\n');
    const hasPrompt = /You are running Codex in/i.test(block)
        || /Allow Codex to (?:run|apply)/i.test(block)
        || /Allow command\?/i.test(block);
    const hasButtons = /Approve and run now/i.test(block)
        || /Always approve this session/i.test(block)
        || /(?:^|\n)[▌> \t]*1\.\s+.*(?:approve|allow|run)/im.test(block)
        || /(?:^|\n)[▌> \t]*2\.\s+.*(?:always|session|deny|cancel)/im.test(block);
    return hasPrompt && hasButtons;
}

function hasVisibleGenerating(lines) {
    const window = takeLast(lines, 12);
    const block = window.join('\n');
    return /Esc to interrupt/i.test(block)
        || /(?:Thinking|Planning|Searching|Reading|Working|Analyzing|Inspecting|Responding|Following instructions clearly)[^\n]*\(\d+s\b/i.test(block)
        || (/[⠁-⣿]/.test(block) && /(?:Working|Thinking|Esc to interrupt)/i.test(block));
}

module.exports = function detectStatus(input) {
    const screenText = getScreenText(input);
    const tailText = getTailText(input);
    const screenLines = splitLines(screenText).map(normalize).filter(Boolean);
    const visibleText = screenText.trim() ? screenText : tailText;
    if (!visibleText.trim()) return 'idle';

    if (screenLines.length > 0) {
        const lastPromptIndex = findLastPromptIndex(screenLines);
        if (lastPromptIndex >= 0) {
            const afterPrompt = screenLines.slice(lastPromptIndex + 1).join('\n');
            if (!hasStartupApproval(afterPrompt) && !hasCommandApproval(afterPrompt)) return 'idle';
        }
        if (hasVisibleApproval(screenLines)) return 'waiting_approval';
        if (hasVisibleGenerating(screenLines)) return 'generating';
        if (hasWelcomeScreen(screenText) || hasIdlePrompt(screenText)) return 'idle';
    }

    if (hasStartupApproval(tailText) || hasCommandApproval(tailText)) return 'waiting_approval';
    if (/Esc to interrupt/i.test(tailText)) return 'generating';
    if (/(?:Thinking|Planning|Searching|Reading|Working|Analyzing|Inspecting|Responding|Following instructions clearly)[^\n]*\(\d+s\b/i.test(tailText)) {
        return 'generating';
    }
    if (/[⠁-⣿]/.test(tailText) && /(?:Working|Thinking|Esc to interrupt)/i.test(tailText)) return 'generating';

    if (hasWelcomeScreen(tailText) || hasIdlePrompt(tailText)) return 'idle';

    return 'idle';
};
