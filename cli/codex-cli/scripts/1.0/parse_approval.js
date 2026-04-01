/**
 * Codex CLI — parse_approval
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
        .replace(/\s+/g, ' ')
        .trim();
}

function isBoxLine(line) {
    return /^[─═╭╮╰╯│┌┐└┘├┤┬┴┼]+$/.test(line);
}

function isFooterLine(line) {
    return /⏎\s+send/i.test(line)
        || /⌃J\s+newline/i.test(line)
        || /⌃T\s+transcript/i.test(line)
        || /⌃C\s+quit/i.test(line)
        || /Press Enter to (?:continue|confirm)/i.test(line)
        || /Esc to cancel/i.test(line);
}

function stripLeadingMarkers(s) {
    // strip any combination of ▌, >, and spaces before the digit
    return s.replace(/^(?:[▌>]\s*)+/, '').trim();
}

function normalizeButton(line) {
    return stripLeadingMarkers(normalize(line))
        .replace(/^\d+\.\s+/, '')
        // strip shortcut hints like "(Y)", "(A)", "(N)" and extra spacing
        .replace(/\s{2,}\([A-Za-z]\)\s.*$/, '')
        .trim();
}

function isButtonLine(line) {
    return /^\d+\.\s+/.test(stripLeadingMarkers(normalize(line)));
}

function takeLast(lines, count) {
    return lines.slice(Math.max(0, lines.length - count));
}

function findLastPromptIndex(lines) {
    for (let index = lines.length - 1; index >= 0; index -= 1) {
        const line = normalize(lines[index]);
        if (/^[>›❯]\s*$/.test(line) || /⏎\s+send/i.test(line)) return index;
    }
    return -1;
}

module.exports = function parseApproval(input) {
    const screenText = String(input?.screenText || '');
    const text = String(screenText || input?.buffer || input?.tail || '');
    const lines = splitLines(text);
    if (lines.length === 0) return null;

    const normalizedLines = lines.map(normalize).filter(Boolean);
    const lastPromptIndex = findLastPromptIndex(normalizedLines);
    if (lastPromptIndex >= 0) {
        const afterPrompt = normalizedLines.slice(lastPromptIndex + 1).join('\n');
        if (!/You are running Codex in/i.test(afterPrompt)
            && !/Allow Codex to (?:run|apply)/i.test(afterPrompt)
            && !/Allow command\?/i.test(afterPrompt)
            && !/(?:^|\n)[▌> \t]*1\.\s+.*(?:approve|allow|run)/im.test(afterPrompt)) {
            return null;
        }
    }

    const buttons = [];
    let currentButton = '';
    const recentLines = takeLast(lines, 24);
    for (const rawLine of recentLines) {
        const line = normalize(rawLine);
        if (!line) continue;
        if (isButtonLine(rawLine)) {
            if (currentButton && !buttons.includes(currentButton)) buttons.push(currentButton);
            currentButton = normalizeButton(rawLine);
            continue;
        }
        if (!currentButton) continue;
        if (isFooterLine(line) || isBoxLine(line)) continue;
        if (/^(?:model|directory):/i.test(line)) continue;
        const continuation = stripLeadingMarkers(line);
        if (!continuation) continue;
        currentButton = `${currentButton} ${continuation}`.replace(/\s+/g, ' ').trim();
    }
    if (currentButton && !buttons.includes(currentButton)) buttons.push(currentButton);

    const approvalText = lines
        .map(normalize)
        .filter(line => line && !isBoxLine(line) && !isButtonLine(line) && !isFooterLine(line))
        .filter(line => !/^OpenAI Codex\b/i.test(line))
        .filter(line => !/^model:/i.test(line))
        .filter(line => !/^directory:/i.test(line));

    const hasApproval = /You are running Codex in/i.test(text)
        || /Allow Codex to (?:run|apply)/i.test(text)
        || /Allow command\?/i.test(text)
        || buttons.length > 0;
    if (!hasApproval) return null;

    const bottomWindow = takeLast(lines.map(normalize).filter(Boolean), 18).join('\n');
    const hasActivePrompt = /You are running Codex in/i.test(bottomWindow)
        || /Allow Codex to (?:run|apply)/i.test(bottomWindow)
        || /Allow command\?/i.test(bottomWindow);
    const hasActiveButtons = buttons.length > 0
        || /Approve and run now/i.test(bottomWindow)
        || /Always approve this session/i.test(bottomWindow)
        || /(?:^|\n)[▌> \t]*1\.\s+.*(?:approve|allow|run)/im.test(bottomWindow);
    if (!hasActivePrompt && !hasActiveButtons) return null;

    return {
        message: approvalText.slice(-3).join(' ').slice(0, 240) || 'Codex approval required',
        buttons: buttons.length > 0 ? buttons : ['Approve', 'Deny'],
    };
};
