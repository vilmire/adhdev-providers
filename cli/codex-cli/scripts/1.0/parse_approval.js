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
        || /Press Enter to continue/i.test(line);
}

function normalizeButton(line) {
    return normalize(line)
        .replace(/^[>▌]\s*/, '')
        .replace(/^\d+\.\s+/, '')
        .trim();
}

function isButtonLine(line) {
    return /^(?:[>▌]\s*)?\d+\.\s+/.test(normalize(line));
}

module.exports = function parseApproval(input) {
    const text = String(input?.buffer || input?.tail || '');
    const lines = splitLines(text);
    if (lines.length === 0) return null;

    const buttons = [];
    for (const rawLine of lines.slice(-40)) {
        if (!isButtonLine(rawLine)) continue;
        const label = normalizeButton(rawLine);
        if (label && !buttons.includes(label)) buttons.push(label);
    }

    const approvalText = lines
        .map(normalize)
        .filter(line => line && !isBoxLine(line) && !isButtonLine(line) && !isFooterLine(line))
        .filter(line => !/^OpenAI Codex\b/i.test(line))
        .filter(line => !/^model:/i.test(line))
        .filter(line => !/^directory:/i.test(line));

    const hasApproval = /You are running Codex in/i.test(text)
        || /Allow Codex to (?:run|apply)/i.test(text)
        || buttons.length > 0;
    if (!hasApproval) return null;

    return {
        message: approvalText.slice(-3).join(' ').slice(0, 240) || 'Codex approval required',
        buttons: buttons.length > 0 ? buttons : ['Approve', 'Deny'],
    };
};
