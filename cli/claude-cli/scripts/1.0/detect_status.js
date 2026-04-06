/**
 * Claude Code — detect_status
 *
 * Keep this intentionally simple:
 * - approval wins first
 * - visible prompt means idle
 * - spinner / running tool lines mean generating
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
        .trim();
}

function nonEmptyLines(text) {
    return splitLines(text)
        .map(normalize)
        .filter(Boolean);
}

function takeLast(lines, count) {
    return lines.slice(Math.max(0, lines.length - count));
}

function isPromptLine(line) {
    return /^[❯›>]\s*$/.test(normalize(line));
}

function isShellChrome(line) {
    const trimmed = normalize(line);
    return /^➜\s+\S+/.test(trimmed)
        || /^Update available!/i.test(trimmed)
        || /^ctrl\+g to edit in VS Code/i.test(trimmed)
        || /^⏵⏵\s+accept edits on/i.test(trimmed)
        || /^Claude Code v\d/i.test(trimmed)
        || /^(?:Sonnet|Opus|Haiku)\b/i.test(trimmed)
        || /^[◐◑◒◓◴◵◶◷◸◹◺◿].*\/effort/i.test(trimmed);
}

function isApprovalCue(line) {
    const trimmed = normalize(line);
    return /requires approval/i.test(trimmed)
        || /Do you want to (?:proceed|allow|run|make this edit)/i.test(trimmed)
        || /^Allow\s*once\b/i.test(trimmed)
        || /^Always\s*allow\b/i.test(trimmed)
        || /^Yes,\s+and\s+don['’]t\s+ask\s+again\b/i.test(trimmed)
        || /\(y\/n\)/i.test(trimmed)
        || /\[Y\/n\]/i.test(trimmed);
}

function isApprovalButton(line) {
    const trimmed = normalize(line);
    return /^([❯›>]\s*)?\d+[.)]\s+/.test(trimmed)
        || /^(?:Allow once|Always allow|Yes|No|Deny|Reject|Cancel|Proceed)\b/i.test(trimmed)
        || /^Yes,\s+and\s+don['’]t\s+ask\s+again\b/i.test(trimmed);
}

function isRunningToolLine(line) {
    const trimmed = normalize(line);
    return /^⎿\s+Running\b/i.test(trimmed)
        || /^(?:[⏺•]\s+)?(?:Bash|Read|Write|Edit|MultiEdit|Task|Glob|Grep|LS|NotebookEdit|WebFetch|WebSearch|TodoWrite|NotebookRead|ExitPlanMode)\(/.test(trimmed)
        || /^[A-Z][A-Za-z0-9_-]*\(/.test(trimmed)
        || /^\+\d+\s+more\s+(?:tool\s+uses?|steps?|actions?)\b/i.test(trimmed)
        || /^\(ctrl\+[a-z].*\)$/i.test(trimmed)
        || /^Show more\b/i.test(trimmed)
        || /^Read\s+\d+\s+files?\b/i.test(trimmed)
        || /^Wrote\s+\d+\s+files?\b/i.test(trimmed)
        || /^Edited\s+\d+\s+files?\b/i.test(trimmed)
        || /^Updated\s+\d+\s+files?\b/i.test(trimmed);
}

function isStatusLine(line) {
    const trimmed = normalize(line);
    if (!trimmed || isShellChrome(trimmed)) return false;

    if (/^[✻✶✳✢✽·⠂⠐⠒⠓⠦⠴⠶⠷⠿]+$/.test(trimmed)) return true;
    if (/Esc to (?:cancel|interrupt|stop)/i.test(trimmed)) return true;
    if (/[↑↓]\s*\d+(?:\.\d+)?k?\s*tokens\)/i.test(trimmed)) return true;
    if (/\(\s*(?:\d+h\s*)?(?:\d+m\s*)?(?:\d+s)(?:\s*·\s*[↑↓]\s*\d+(?:\.\d+)?k?\s*tokens)?\s*\)$/i.test(trimmed)) return true;
    if (/^(?:[✻✶✳✢✽·⠂⠐⠒⠓⠦⠴⠶⠷⠿]\s*)?[A-Z][\p{L}\p{M}'-]{2,}(?:ing|ed)(?:\s+[^\n()]*)?(?:\s*[.…]{1,3})?(?:\s+\([^)]*\))?$/u.test(trimmed)) return true;

    return false;
}

module.exports = function detectStatus(input) {
    const screenLines = nonEmptyLines(input?.screenText || '');
    const tailLines = nonEmptyLines(input?.tail || '');
    const activeLines = screenLines.length > 0 ? screenLines : tailLines;
    const bottom = takeLast(activeLines, 20);

    const hasApproval = bottom.some(isApprovalCue) && bottom.some(isApprovalButton);
    if (hasApproval) return 'waiting_approval';

    const promptVisible = takeLast(activeLines, 6).some(isPromptLine);
    const spinnerVisible = bottom.some(isStatusLine);
    const runningToolVisible = takeLast(activeLines, 10).some(isRunningToolLine);

    if (promptVisible && !spinnerVisible) return 'idle';
    if (spinnerVisible || runningToolVisible) return 'generating';

    const tail = String(input?.tail || '');
    if (/requires approval/i.test(tail) && /(^|\n)\s*(?:[❯›>]\s*)?\d+[.)]\s+/m.test(tail)) return 'waiting_approval';
    if (/[↑↓]\s*\d+(?:\.\d+)?k?\s*tokens\)/i.test(tail)) return 'generating';
    if (/\(\s*(?:\d+h\s*)?(?:\d+m\s*)?(?:\d+s)(?:\s*·\s*[↑↓]\s*\d+(?:\.\d+)?k?\s*tokens)?\s*\)$/i.test(tail)) return 'generating';
    if (/[✻✶✳✢✽⠂⠐⠒⠓⠦⠴⠶⠷⠿]/.test(tail)) return 'generating';

    return 'idle';
};
