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

function isShellChromeLine(line) {
    return /^>\s+You are in\b/i.test(line)
        || /^(?:model|directory):/i.test(line);
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
    return String(s || '').replace(/^(?:[▌>›❯]\s*)+/, '').trim();
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

function isApprovalCue(line) {
    return /Do you trust the contents of this directory\?/i.test(line)
        || /Working with untrusted contents/i.test(line)
        || /You are running Codex in/i.test(line)
        || /Allow Codex to (?:run|apply)/i.test(line)
        || /Allow command\?/i.test(line);
}

function hasActiveApproval(lines) {
    const window = takeLast(lines.map(normalize).filter(Boolean), 24);
    const cueCount = window.filter(isApprovalCue).length;
    const buttonCount = window.filter(isButtonLine).length;
    const hasFooter = window.some(isFooterLine);
    return cueCount > 0 && buttonCount > 0 && (hasFooter || cueCount >= 2);
}

module.exports = function parseApproval(input) {
    const screenText = String(input?.screenText || '');
    const text = String(screenText || input?.buffer || input?.tail || '');
    const lines = splitLines(text);
    if (lines.length === 0) return null;
    if (!hasActiveApproval(lines)) return null;

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
        if (isFooterLine(line) || isBoxLine(line) || isShellChromeLine(line) || isApprovalCue(line)) continue;
        const continuation = stripLeadingMarkers(line);
        if (!continuation) continue;
        currentButton = `${currentButton} ${continuation}`.replace(/\s+/g, ' ').trim();
    }
    if (currentButton && !buttons.includes(currentButton)) buttons.push(currentButton);

    const approvalText = lines
        .map(normalize)
        .filter(line => line && !isBoxLine(line) && !isButtonLine(line) && !isFooterLine(line))
        .filter(line => !/^OpenAI Codex\b/i.test(line))
        .filter(line => !isShellChromeLine(line));

    return {
        message: approvalText.slice(-3).join(' ').slice(0, 240) || 'Codex approval required',
        buttons: buttons.length > 0 ? buttons : ['Approve', 'Deny'],
    };
};
