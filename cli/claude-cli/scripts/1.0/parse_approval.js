/**
 * Claude Code — parse_approval
 */

'use strict';

const {
    getBufferScreen,
    getTailScreen,
    normalizeLineText,
    takeLast,
} = require('./screen_helpers.js');

function normalize(line) {
    return normalizeLineText(line);
}

function isNoise(line) {
    const trimmed = normalize(line);
    if (!trimmed) return true;
    if (/^[─═╭╮╰╯│┌┐└┘├┤┬┴┼]+$/.test(trimmed)) return true;
    if (/^❯\s*$/.test(trimmed)) return true;
    if (/^➜\s+\S+/.test(trimmed)) return true;
    if (/^⏵⏵\s+accept edits on/i.test(trimmed)) return true;
    if (/^[◐◑◒◓◴◵◶◷◸◹◺◿].*\/effort/i.test(trimmed)) return true;
    if (/^Update available!/i.test(trimmed)) return true;
    if (/^Claude Code v\d/i.test(trimmed)) return true;
    if (/^(Sonnet|Opus|Haiku)\b/i.test(trimmed)) return true;
    if (/^Security guide$/i.test(trimmed)) return true;
    if (/^Enter to confirm/i.test(trimmed)) return true;
    return false;
}

function normalizeButtonLabel(line) {
    const trimmed = normalize(line)
        .replace(/^[❯›>]\s*/, '')
        .replace(/^[([{]?\d+[)\].:\]-]?\s*/, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (/^Yes,\s+and\s+don['’]t\s+ask\s+again\b/i.test(trimmed)) return 'Always allow';
    if (/^Allow\s*once\b/i.test(trimmed)) return 'Yes';
    if (/^Yes\s*[-–—]/i.test(trimmed)) return 'Yes';
    if (/^(?:Deny|Reject)\b/i.test(trimmed)) return 'No';
    return trimmed;
}

function isButtonLine(line) {
    const raw = normalize(line);
    const trimmed = normalizeButtonLabel(line);
    if (/^Esc to cancel/i.test(raw)) return false;
    return /^([❯›>]\s*)?\d+[.)]\s+/.test(raw)
        || /^(Allow\s*once|Always\s*allow.*|Deny|Reject|Yes|No)$/i.test(trimmed);
}

function isStartupTrustCue(line) {
    const trimmed = normalize(line);
    return /Quick safety check/i.test(trimmed)
        || /Is this a project you trust/i.test(trimmed)
        || /Claude Code'?ll be able to read, edit, and execute files here/i.test(trimmed);
}

function stripContextPrefix(line) {
    return normalize(line)
        .replace(/^[⏺•]\s+/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function findLastIndex(lines, predicate) {
    for (let i = lines.length - 1; i >= 0; i--) {
        if (predicate(lines[i])) return i;
    }
    return -1;
}

function parseApprovalFromLines(lines, sourceText) {
    if (!Array.isArray(lines) || lines.length === 0) return null;

    const recent = takeLast(lines, 30);
    const normalizedRecent = recent.map(normalize).filter(Boolean);
    const lastPromptIndex = normalizedRecent.map((line, idx) => ({ line, idx }))
        .reverse()
        .find(({ line }) => /^❯\s*$/.test(line))?.idx ?? -1;
    if (lastPromptIndex >= 0) {
        const afterPrompt = normalizedRecent.slice(lastPromptIndex + 1);
        const trailingApproval = afterPrompt.some(line => /requires approval|Do you want to proceed|Allow\s*once|Always\s*allow/i.test(line))
            || afterPrompt.some(isButtonLine);
        if (!trailingApproval) return null;
    }

    const questionIndexInRecent = findLastIndex(recent, line => /Do you want to (?:proceed|make this edit|run this command|allow)/i.test(normalize(line)));
    const buttonWindow = questionIndexInRecent >= 0 ? recent.slice(questionIndexInRecent) : recent;

    const buttons = [];
    for (const line of buttonWindow) {
        if (!isButtonLine(line)) continue;
        const label = normalizeButtonLabel(line);
        if (label && !buttons.includes(label)) buttons.push(label);
    }

    const startupTrust = normalizedRecent.some(isStartupTrustCue);
    const hasApproval = buttons.length > 0
        || startupTrust
        || /This command requires approval|Do you want to (?:proceed|make this edit|run this command|allow)|Allow\s*once|Always\s*allow|\(y\/n\)|\[Y\/n\]/i.test(sourceText || '');
    if (!hasApproval) return null;

    const questionIndex = findLastIndex(lines, line => /Do you want to (?:proceed|make this edit|run this command|allow)/i.test(normalize(line)));
    const approvalIndex = findLastIndex(lines, line => /This command requires approval|requires approval/i.test(normalize(line)));
    const startupIndex = findLastIndex(lines, isStartupTrustCue);
    const actionIndex = findLastIndex(lines, line => /^(?:[⏺•]\s+)?(?:Bash|Write|Edit|MultiEdit|Read|Task|Glob|Grep|LS|NotebookEdit)\(/.test(stripContextPrefix(line)));
    const startIndex = Math.max(0, (
        actionIndex >= 0 ? actionIndex
            : approvalIndex >= 0 ? approvalIndex - 2
                : questionIndex >= 0 ? questionIndex - 4
                    : startupIndex >= 0 ? startupIndex
                        : lines.length - 8
    ));
    const endIndex = questionIndex >= 0 ? questionIndex + 1 : lines.length;

    const context = [];
    for (const line of lines.slice(startIndex, endIndex)) {
        if (isNoise(line) || isButtonLine(line)) continue;
        const trimmed = stripContextPrefix(line);
        if (!trimmed) continue;
        if (context[context.length - 1] !== trimmed) context.push(trimmed);
    }

    return {
        message: context.slice(-3).join(' ').slice(0, 240) || 'Claude Code approval required',
        buttons: buttons.length > 0 ? buttons : ['Allow once', 'Always allow', 'Deny'],
    };
}

module.exports = function parseApproval(input) {
    const primaryScreen = getBufferScreen(input);
    const fallbackScreen = getTailScreen(input);
    const candidates = [];

    if (primaryScreen.lineCount > 0) {
        candidates.push({
            lines: primaryScreen.lines.map(line => line.text),
            sourceText: String(input?.buffer || input?.screenText || ''),
        });
    }
    if (fallbackScreen.lineCount > 0) {
        candidates.push({
            lines: fallbackScreen.lines.map(line => line.text),
            sourceText: String(input?.tail || input?.recentBuffer || ''),
        });
    }

    // Adapter getStatus() calls can see a corrupted virtual-screen modal while
    // the raw tail/buffer still contains Claude's complete approval UI. Search
    // those raw streams as secondary candidates so approval/auto-approval does
    // not depend on the renderer snapshot being perfect.
    for (const key of ['tail', 'buffer', 'screenText', 'rawBuffer']) {
        const text = typeof input?.[key] === 'string' ? input[key] : '';
        if (text) candidates.push({ lines: text.split(/\r?\n/), sourceText: text });
    }

    const seen = new Set();
    let best = null;
    for (const candidate of candidates) {
        const signature = takeLast(candidate.lines, 30).map(line => String(line || '')).join('\n');
        if (!signature || seen.has(signature)) continue;
        seen.add(signature);
        const parsed = parseApprovalFromLines(candidate.lines, candidate.sourceText);
        if (!parsed) continue;
        if (!best || parsed.buttons.length > best.buttons.length) best = parsed;
    }

    return best;
};
