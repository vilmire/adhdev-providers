/**
 * Claude Code — parse_approval
 */

'use strict';

function splitLines(text) {
    return String(text || '')
        .replace(/\u0007/g, '')
        .split(/\r\n|\n|\r/g)
        .map((line) => line.replace(/\s+$/, ''));
}

function normalize(line) {
    return String(line || '')
        .replace(/\u0007/g, '')
        .replace(/^\s*\d+;/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function isNoise(line) {
    const trimmed = normalize(line);
    return !trimmed
        || /^[─═╭╮╰╯│┌┐└┘├┤┬┴┼]+$/.test(trimmed)
        || /^[❯›>]\s*$/.test(trimmed)
        || /^➜\s+\S+/.test(trimmed)
        || /^Update available!/i.test(trimmed)
        || /^ctrl\+g to edit in VS Code/i.test(trimmed)
        || /^Claude Code v\d/i.test(trimmed)
        || /^(?:Sonnet|Opus|Haiku)\b/i.test(trimmed)
        || /^[◐◑◒◓◴◵◶◷◸◹◺◿].*\/effort/i.test(trimmed)
        || /^\(ctrl\+[a-z].*\)$/i.test(trimmed)
        || /^Show more\b/i.test(trimmed)
        || /^⎿\s+Tip:\s+/i.test(trimmed);
}

function isApprovalCue(line) {
    const trimmed = normalize(line);
    return /requires approval/i.test(trimmed)
        || /Do you want to (?:proceed|allow|run|make this edit)/i.test(trimmed)
        || /\(y\/n\)/i.test(trimmed)
        || /\[Y\/n\]/i.test(trimmed);
}

function normalizeButton(line) {
    const trimmed = normalize(line)
        .replace(/^[❯›>]\s*/, '')
        .replace(/^\d+[.)]\s*/, '')
        .trim();

    if (/^Yes,\s+and\s+don['’]t\s+ask\s+again\b/i.test(trimmed)) return 'Always allow';
    if (/^Allow\s*once\b/i.test(trimmed)) return 'Yes';
    if (/^(?:Deny|Reject)\b/i.test(trimmed)) return 'No';
    if (/^Yes\b/i.test(trimmed)) return 'Yes';
    if (/^No\b/i.test(trimmed)) return 'No';
    if (/^Always\s*allow\b/i.test(trimmed)) return 'Always allow';
    return trimmed;
}

function isApprovalButton(line) {
    const trimmed = normalize(line);
    return /^([❯›>]\s*)?\d+[.)]\s+/.test(trimmed)
        || /^(?:Allow once|Always allow|Yes|No|Deny|Reject|Cancel|Proceed)\b/i.test(trimmed)
        || /^Yes,\s+and\s+don['’]t\s+ask\s+again\b/i.test(trimmed);
}

module.exports = function parseApproval(input) {
    const source = String(input?.screenText || input?.buffer || input?.tail || '');
    const lines = splitLines(source).slice(-40);
    if (lines.length === 0) return null;

    const hasCue = lines.some(isApprovalCue);
    const buttons = [];
    for (const line of lines) {
        if (!isApprovalButton(line)) continue;
        const label = normalizeButton(line);
        if (label && !buttons.includes(label)) buttons.push(label);
    }

    if (!hasCue && buttons.length === 0) return null;

    const context = [];
    for (const line of lines) {
        const trimmed = normalize(line);
        if (!trimmed || isNoise(trimmed) || isApprovalButton(trimmed)) continue;
        if (isApprovalCue(trimmed)) continue;
        context.push(trimmed);
    }

    return {
        message: context.slice(-3).join(' ').slice(0, 240) || 'Claude Code approval required',
        buttons: buttons.length > 0 ? buttons : ['Yes', 'Always allow', 'No'],
    };
};
