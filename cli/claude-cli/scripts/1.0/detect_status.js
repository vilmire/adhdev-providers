/**
 * Claude Code — detect_status
 *
 * Status detection must prefer the active bottom-of-screen region rather than
 * stale tool blocks that remain visible after a response completes.
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

function nonEmptyLines(text) {
    return splitLines(text)
        .map(normalize)
        .filter(Boolean);
}

function takeLast(lines, count) {
    return lines.slice(Math.max(0, lines.length - count));
}

function isIdlePrompt(line) {
    return /^[❯›>]\s*$/.test(normalize(line));
}

function isShellChrome(line) {
    const trimmed = normalize(line);
    return /^➜\s+\S+/.test(trimmed)
        || /^Update available!/i.test(trimmed)
        || /^[◐◑◒◓◴◵◶◷◸◹◺◿].*\/effort/i.test(trimmed)
        || /^⏵⏵\s+accept edits on/i.test(trimmed)
        || /^ctrl\+g to edit in VS Code/i.test(trimmed)
        || /Claude Code v\d/i.test(trimmed)
        || /^(Sonnet|Opus|Haiku)\b/i.test(trimmed);
}

function isApprovalCue(line) {
    const trimmed = normalize(line);
    return /This command requires approval/i.test(trimmed)
        || /requires approval/i.test(trimmed)
        || /Do you want to (?:proceed|allow|run|make this edit)/i.test(trimmed)
        || /Quick safety check/i.test(trimmed)
        || /Is this a project you trust/i.test(trimmed)
        || /Security guide/i.test(trimmed)
        || /Enter to confirm/i.test(trimmed)
        || /Claude Code'?ll be able to read, edit, and execute files here/i.test(trimmed)
        || /Allow\s*once/i.test(trimmed)
        || /Always\s*allow/i.test(trimmed)
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

function isStartupTrustButton(line) {
    const trimmed = normalize(line)
        .replace(/^[❯›>]\s*/, '')
        .replace(/^\d+[.)]\s*/, '')
        .trim();
    return /^(?:Yes,\s*I trust this folder|No,\s*exit)$/i.test(trimmed);
}

function hasStartupTrustPrompt(lines) {
    const window = takeLast(lines, 16);
    const joined = window.join('\n');
    const hasCue = window.some(isApprovalCue)
        || /Quick safety check/i.test(joined)
        || /Is this a project you trust/i.test(joined)
        || /Claude Code'?ll be able to read, edit, and execute files here/i.test(joined);
    const hasButtons = window.some(isApprovalButton) || window.some(isStartupTrustButton);
    const hasEnterConfirm = /Enter to confirm/i.test(joined);
    return hasCue && (hasButtons || hasEnterConfirm);
}

function isSpinnerLine(line) {
    const trimmed = normalize(line);
    if (!trimmed || isShellChrome(trimmed)) return false;
    if (/^[✻✶✳✢✽⠂⠐⠒⠓⠦⠴⠶⠷⠿]+$/.test(trimmed)) return true;
    if (/esc to (cancel|interrupt|stop)/i.test(trimmed)) return true;
    if (/(?:Running|Percolating|Finagling|Scurrying|Bloviating|Whatchamacallit(?:ing)?|Hatching|Thinking|Processing|Working|Analyzing|Planning|Drafting|Synthesizing|Inspecting|Reading|Searching|Tinkering)\u2026?$/i.test(trimmed)) return true;
    return /^[A-Z][a-z]+ing\u2026?$/.test(trimmed);
}

function isToolLine(line) {
    const trimmed = normalize(line);
    return /^(?:[⏺•]\s+)?(?:Bash|Read|Write|Edit|MultiEdit|Task|Glob|Grep|LS|NotebookEdit|Exact output)(?:\(|:)/.test(trimmed)
        || /^⎿\s+(?:Running|Wrote|Read|Updated|Edited|Created|\/)/i.test(trimmed);
}

function isAssistantReplyLine(line) {
    const trimmed = normalize(line);
    if (!trimmed) return false;
    if (isShellChrome(trimmed) || isApprovalCue(trimmed) || isApprovalButton(trimmed) || isToolLine(trimmed)) return false;
    if (isSpinnerLine(trimmed)) return false;
    return /^(?:[⏺•]\s+)?\S/.test(trimmed);
}

function isTransientPostReplyLine(line) {
    const trimmed = normalize(line);
    if (!trimmed) return true;
    if (isSpinnerLine(trimmed)) return true;
    if (isShellChrome(trimmed)) return true;
    return /^[─═╭╮╰╯│┌┐└┘├┤┬┴┼]+$/.test(trimmed);
}

function hasActiveApproval(lines) {
    const window = takeLast(lines, 18);
    if (hasStartupTrustPrompt(window)) return true;
    const cues = window.filter(isApprovalCue).length;
    const buttons = window.filter(line => isApprovalButton(line) || isStartupTrustButton(line)).length;
    return buttons > 0 && cues > 0;
}

function hasActiveGenerating(lines) {
    const window = takeLast(lines, 12);
    const spinner = window.some(isSpinnerLine);
    const activeTool = takeLast(lines, 8).some(isToolLine);
    return spinner || (activeTool && window.some(line => /\u2026|\.{3}|Running\b/i.test(normalize(line))));
}

function hasVisibleCompletedReply(lines) {
    const recent = takeLast(lines, 20);
    let promptIndex = -1;
    for (let i = recent.length - 1; i >= 0; i--) {
        if (isIdlePrompt(recent[i])) {
            promptIndex = i;
            break;
        }
    }
    if (promptIndex < 0) return false;

    const beforePrompt = recent.slice(0, promptIndex);
    let lastAssistantIndex = -1;
    for (let i = beforePrompt.length - 1; i >= 0; i--) {
        if (isAssistantReplyLine(beforePrompt[i])) {
            lastAssistantIndex = i;
            break;
        }
    }
    if (lastAssistantIndex < 0) return false;

    const trailingSegment = beforePrompt.slice(lastAssistantIndex + 1);
    const hasRunningTool = trailingSegment.some(line => /^⎿\s+Running\b/i.test(normalize(line)));
    if (hasRunningTool) return false;

    return trailingSegment.every(isTransientPostReplyLine);
}

module.exports = function detectStatus(input) {
    const screenLines = nonEmptyLines(input?.screenText || '');
    const tailLines = nonEmptyLines(input?.tail || '');
    const activeLines = screenLines.length > 0 ? screenLines : tailLines;

    if (activeLines.length > 0) {
        if (hasActiveApproval(activeLines)) return 'waiting_approval';
        if (hasVisibleCompletedReply(activeLines)) return 'idle';
        if (hasActiveGenerating(activeLines)) return 'generating';
        if (takeLast(activeLines, 6).some(isIdlePrompt)) return 'idle';
        if (takeLast(activeLines, 8).some(isShellChrome)) return 'idle';
    }

    const tail = String(input?.tail || '');
    if (/This command requires approval/i.test(tail) && /(^|\n)\s*[❯›>]?\s*\d+[.)]\s+/m.test(tail)) return 'waiting_approval';
    if (/Quick safety check|Is this a project you trust|Enter to confirm|Claude Code'?ll be able to read, edit, and execute files here/i.test(tail)) return 'waiting_approval';
    if (/esc to (cancel|interrupt|stop)/i.test(tail)) return 'generating';
    if (/(?:Running|Percolating|Finagling|Scurrying|Bloviating|Whatchamacallit(?:ing)?|Hatching|Thinking|Processing|Working|Analyzing|Planning|Drafting|Synthesizing|Inspecting|Reading|Searching|Tinkering)\u2026?$/im.test(tail)) return 'generating';
    if (/[⠂⠐⠒⠓⠦⠴⠶⠷⠿]/.test(tail) && !/accept edits on/i.test(tail)) return 'generating';

    return 'idle';
};
