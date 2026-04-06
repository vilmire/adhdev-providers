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

function hasIdlePrompt(text) {
    const trimmed = String(text || '').trim();
    return /⏎\s+send/i.test(text) || /^>\s*$/m.test(text) || /[›❯]\s*$/.test(trimmed);
}

function hasWelcomeScreen(text) {
    return /OpenAI Codex/i.test(text)
        && /To get started, describe a task/i.test(text);
}

function hasStartupIdleScreen(text) {
    const value = String(text || '');
    return hasWelcomeScreen(value)
        || (/OpenAI Codex/i.test(value)
            && /model:\s+/i.test(value)
            && /directory:\s+/i.test(value)
            && /(?:Use \/skills to list available skills|Write tests for @filename|Explain this codebase|Summarize recent commits|Implement \{feature\})/i.test(value))
        || /Tip:\s+New Try the Codex App/i.test(value)
        || /Tip:\s+Use \/skills to list available skills/i.test(value);
}

function isApprovalCue(line) {
    return /Do you trust the contents of this directory\?/i.test(line)
        || /Working with untrusted contents/i.test(line)
        || /You are running Codex in/i.test(line)
        || /Allow Codex to (?:run|apply)/i.test(line)
        || /Allow command\?/i.test(line)
        || /Press Enter to (?:continue|confirm)/i.test(line)
        || /Esc to cancel/i.test(line);
}

function isApprovalButton(line) {
    return /^(?:[▌>›❯]\s*)?\d+\.\s+\S/.test(line)
        || /Approve and run now/i.test(line)
        || /Always approve this session/i.test(line);
}

function hasVisibleApproval(lines) {
    const window = takeLast(lines, 18);
    const cueCount = window.filter(isApprovalCue).length;
    const buttonCount = window.filter(isApprovalButton).length;
    return cueCount > 0 && buttonCount > 0;
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
        if (hasVisibleApproval(screenLines)) return 'waiting_approval';
        if (hasVisibleGenerating(screenLines)) return 'generating';
        if (hasStartupIdleScreen(screenText) || hasIdlePrompt(screenText)) return 'idle';
    }

    if (hasVisibleApproval(splitLines(tailText).map(normalize).filter(Boolean))) return 'waiting_approval';
    if (/Esc to interrupt/i.test(tailText)) return 'generating';
    if (/(?:Thinking|Planning|Searching|Reading|Working|Analyzing|Inspecting|Responding|Following instructions clearly)[^\n]*\(\d+s\b/i.test(tailText)) {
        return 'generating';
    }
    if (/[⠁-⣿]/.test(tailText) && /(?:Working|Thinking|Esc to interrupt)/i.test(tailText)) return 'generating';

    if (hasWelcomeScreen(tailText) || hasIdlePrompt(tailText)) return 'idle';

    return 'idle';
};
