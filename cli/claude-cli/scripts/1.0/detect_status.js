/**
 * Claude Code — detect_status
 *
 * Uses the current visible PTY screen when available.
 * `tail` is still used as a fallback for older runtimes.
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
        .trim();
}

function isVisiblePrompt(line) {
    return /^❯\s*$/.test(normalize(line));
}

function isApprovalCue(line) {
    const trimmed = normalize(line);
    return /Allow\s*once/i.test(trimmed)
        || /Always\s*allow/i.test(trimmed)
        || /This command requires approval/i.test(trimmed)
        || /requires approval/i.test(trimmed)
        || /Do you want to (?:proceed|allow|run)/i.test(trimmed)
        || /\(y\/n\)/i.test(trimmed)
        || /\[Y\/n\]/i.test(trimmed);
}

function isApprovalButton(line) {
    const trimmed = normalize(line);
    const label = trimmed
        .replace(/^[❯›>]\s*/, '')
        .replace(/^\d+[.)]\s*/, '')
        .trim();
    return /^([❯›>]\s*)?\d+[.)]\s+/.test(trimmed)
        && /^(?:Yes|No|Allow|Deny|Reject|Cancel|Proceed)\b/i.test(label);
}

function hasVisibleApproval(lines) {
    const cues = lines.filter(isApprovalCue).length;
    const buttons = lines.filter(isApprovalButton).length;
    if (cues > 0 && buttons > 0) return true;
    return cues > 1;
}

function isVisibleSpinner(line) {
    const trimmed = normalize(line);
    if (!trimmed) return false;
    if (/^[✻✶✳✢✽⠂⠐⠒⠓⠦⠴⠶⠷⠿]+$/.test(trimmed)) return true;
    if (/esc to (cancel|interrupt|stop)/i.test(trimmed)) return true;
    if (/Running(?:\u2026|\.{3})?$/i.test(trimmed)) return true;
    if (/Percolating(?:\u2026|\.{3})?$/i.test(trimmed)) return true;
    if (/(?:Finagling|Scurrying|Bloviating|Whatchamacallit(?:ing)?|Hatching|Thinking|Processing|Working|Analyzing|Planning|Drafting|Synthesizing|Inspecting|Reading|Searching|Tinkering|Canoodling|Whirring|Infusing|Accomplishing|Deliberating)\u2026?$/i.test(trimmed)) return true;
    if (/^[A-Z][a-z]+ing\u2026?$/.test(trimmed)) return true;
    return false;
}

function isVisibleToolActivity(line) {
    const trimmed = normalize(line);
    return /^(?:[⏺•]\s+)?(?:Bash|Read|Write|Edit|MultiEdit|Task|Glob|Grep|LS|NotebookEdit)\(/.test(trimmed)
        || /^⎿\s+(?:Running|Wrote|Read|Updated|Edited|Created)/i.test(trimmed);
}

module.exports = function detectStatus(input) {
    const tail = String(input?.tail || '');
    const screenText = String(input?.screenText || '');
    const visibleLines = splitLines(screenText);
    const visibleText = visibleLines.map(normalize).filter(Boolean).join('\n');
    if (visibleText) {
        const hasSpinner = visibleLines.some(isVisibleSpinner) || visibleLines.some(isVisibleToolActivity);
        if (hasSpinner) return 'generating';

        // Check idle prompt BEFORE approval — if ❯ prompt is visible without spinner,
        // the CLI is idle regardless of stale approval text that may linger on screen
        const hasPrompt = visibleLines.some(isVisiblePrompt);
        if (hasPrompt) return 'idle';

        if (hasVisibleApproval(visibleLines)) return 'waiting_approval';
    } else if (tail) {
        const tailLines = splitLines(tail);
        const hasApproval = hasVisibleApproval(tailLines)
            || (/This command requires approval/i.test(tail)
                && /(^|\n)\s*[❯›>]?\s*\d+[.)]\s+/m.test(tail));
        if (hasApproval) return 'waiting_approval';
    }

    if (/[\u2800-\u28ff]/.test(tail)) return 'generating';
    if (/esc to (cancel|interrupt|stop)/i.test(tail)) return 'generating';
    if (/Running(?:\u2026|\.{3})?$/im.test(tail)) return 'generating';
    if (/Percolating(?:\u2026|\.{3})?$/im.test(tail)) return 'generating';
    if (/(?:Finagling|Scurrying|Bloviating|Whatchamacallit(?:ing)?|Hatching|Thinking|Processing|Working|Analyzing|Planning|Drafting|Synthesizing|Inspecting|Reading|Searching|Tinkering|Canoodling|Whirring|Infusing|Accomplishing|Deliberating)\u2026?$/i.test(tail)) return 'generating';
    if (/^[A-Z][a-z]+ing\u2026?$/m.test(tail)) return 'generating';
    if (/(?:^|\n)\s*(?:[⏺•]\s+)?(?:Bash|Read|Write|Edit|MultiEdit|Task|Glob|Grep|LS|NotebookEdit)\(/m.test(tail)) return 'generating';

    return 'idle';
};
