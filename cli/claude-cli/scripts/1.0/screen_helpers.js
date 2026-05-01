'use strict';

function splitLines(text) {
    return String(text || '')
        .replace(/\u0007/g, '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .map(line => line.replace(/\s+$/, ''));
}

function normalizeLineText(line) {
    const text = typeof line === 'string'
        ? line
        : (line && typeof line.text === 'string' ? line.text : '');
    return String(text || '')
        .replace(/\u0007/g, '')
        .replace(/^\d+;/, '')
        .trim();
}

function isHorizontalSeparatorLine(line) {
    return /^[-─━═]{8,}$/.test(normalizeLineText(line));
}

function isConversationContinuationBelowPrompt(line) {
    const trimmed = normalizeLineText(line);
    if (!trimmed) return false;
    return /^[⏺⎿]/u.test(trimmed)
        || /^[❯›>]\s*\S/u.test(trimmed)
        || /^\d+[.)]\s+/u.test(trimmed);
}

function hasStructuralPromptChromeBelow(lines, index) {
    const trailing = lines
        .slice(index + 1)
        .map(normalizeLineText)
        .filter(Boolean);
    if (trailing.length === 0) return false;

    const firstBoundaryIndex = trailing.findIndex(line => /^[-─━═]{8,}$/.test(line));
    if (firstBoundaryIndex < 0) return false;

    // Lines between the input row and its lower boundary belong to the active
    // input footer/extension area, not to chat transcript.  After that boundary,
    // reject only clear conversation continuations; arbitrary plugin footer text
    // below the input must not make the active prompt invisible.
    return trailing
        .slice(firstBoundaryIndex + 1)
        .every(line => /^[-─━═]{8,}$/.test(line) || !isConversationContinuationBelowPrompt(line));
}

function isInsideOpenBox(lines, index) {
    let open = false;
    for (let i = 0; i < index; i += 1) {
        const trimmed = normalizeLineText(lines[i]);
        if (/^╭/.test(trimmed)) open = true;
        if (/^╰/.test(trimmed)) open = false;
    }
    return open;
}

function isStructuralInputPromptLine(lines, index) {
    if (!Array.isArray(lines) || index <= 0 || index >= lines.length - 1) return false;
    const trimmed = normalizeLineText(lines[index]);
    if (!/^>\s*(?:$|\S.*)$/.test(trimmed)) return false;
    if (isInsideOpenBox(lines, index)) return false;
    if (!hasStructuralPromptChromeBelow(lines, index)) return false;
    return isHorizontalSeparatorLine(lines[index - 1]);
}

function isPromptLineAt(lines, index) {
    const trimmed = normalizeLineText(lines[index]);
    if (/^[❯›]\s*(?:$|\S.*)$/.test(trimmed)) return true;
    return isStructuralInputPromptLine(lines, index);
}

function findPromptLineIndex(lines) {
    for (let i = lines.length - 1; i >= 0; i -= 1) {
        if (isPromptLineAt(lines, i)) return i;
    }
    return -1;
}

function buildScreenSnapshot(text) {
    const normalizedText = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = splitLines(normalizedText).map((line, index, arr) => ({
        index,
        fromTop: index,
        fromBottom: arr.length - index - 1,
        text: line,
        trimmed: normalizeLineText(line),
        isEmpty: normalizeLineText(line).length === 0,
    }));
    const nonEmptyLines = lines.filter(line => !line.isEmpty);
    const promptLineIndex = findPromptLineIndex(lines);

    return {
        text: normalizedText,
        lineCount: lines.length,
        lines,
        nonEmptyLines,
        firstNonEmptyLineIndex: nonEmptyLines[0]?.index ?? -1,
        lastNonEmptyLineIndex: nonEmptyLines[nonEmptyLines.length - 1]?.index ?? -1,
        firstNonEmptyLine: nonEmptyLines[0] ?? null,
        lastNonEmptyLine: nonEmptyLines[nonEmptyLines.length - 1] ?? null,
        promptLineIndex,
        promptLine: promptLineIndex >= 0 ? lines[promptLineIndex] : null,
        linesAbovePrompt: promptLineIndex >= 0 ? lines.slice(0, promptLineIndex) : [...lines],
        linesBelowPrompt: promptLineIndex >= 0 ? lines.slice(promptLineIndex + 1) : [],
    };
}

function getScreen(input) {
    return input?.screen && Array.isArray(input.screen.lines)
        ? input.screen
        : buildScreenSnapshot(input?.screenText || '');
}

function getBufferScreen(input) {
    return input?.bufferScreen && Array.isArray(input.bufferScreen.lines)
        ? input.bufferScreen
        : buildScreenSnapshot(input?.buffer || '');
}

function getTailScreen(input) {
    return input?.tailScreen && Array.isArray(input.tailScreen.lines)
        ? input.tailScreen
        : buildScreenSnapshot(input?.tail || input?.recentBuffer || '');
}

function trimTop(lines, count) {
    return Array.isArray(lines) ? lines.slice(Math.max(0, count || 0)) : [];
}

function trimBottom(lines, count) {
    if (!Array.isArray(lines)) return [];
    const safeCount = Math.max(0, count || 0);
    return safeCount === 0 ? [...lines] : lines.slice(0, Math.max(0, lines.length - safeCount));
}

function takeLast(lines, count) {
    return Array.isArray(lines) ? lines.slice(Math.max(0, lines.length - Math.max(0, count || 0))) : [];
}

function nonEmpty(lines) {
    return Array.isArray(lines) ? lines.filter(line => normalizeLineText(line)) : [];
}

function linesAbovePrompt(screen) {
    if (!screen || !Array.isArray(screen.lines)) return [];
    return Array.isArray(screen.linesAbovePrompt)
        ? [...screen.linesAbovePrompt]
        : (screen.promptLineIndex >= 0 ? screen.lines.slice(0, screen.promptLineIndex) : [...screen.lines]);
}

function linesBelowPrompt(screen, options = {}) {
    if (!screen || !Array.isArray(screen.lines)) return [];
    const includePrompt = !!options.includePrompt;
    if (screen.promptLineIndex < 0) return [...screen.lines];
    return includePrompt
        ? screen.lines.slice(screen.promptLineIndex)
        : (Array.isArray(screen.linesBelowPrompt) ? [...screen.linesBelowPrompt] : screen.lines.slice(screen.promptLineIndex + 1));
}

function sliceAroundPrompt(screen, options = {}) {
    if (!screen || !Array.isArray(screen.lines) || screen.promptLineIndex < 0) return [];
    const before = Math.max(0, options.before || 0);
    const after = Math.max(0, options.after || 0);
    const includePrompt = !!options.includePrompt;
    const start = Math.max(0, screen.promptLineIndex - before);
    const end = Math.min(screen.lines.length, screen.promptLineIndex + after + 1);
    const lines = screen.lines.slice(start, end);
    if (includePrompt) return lines;
    return lines.filter(line => line.index !== screen.promptLineIndex);
}

function toText(lines, options = {}) {
    const trim = options.trim !== false;
    const text = (Array.isArray(lines) ? lines : [])
        .map(line => (typeof line === 'string' ? line : line?.text || ''))
        .join('\n');
    return trim ? text.trim() : text;
}

module.exports = {
    buildScreenSnapshot,
    getScreen,
    getBufferScreen,
    getTailScreen,
    normalizeLineText,
    isHorizontalSeparatorLine,
    isStructuralInputPromptLine,
    isPromptLineAt,
    findPromptLineIndex,
    trimTop,
    trimBottom,
    takeLast,
    nonEmpty,
    linesAbovePrompt,
    linesBelowPrompt,
    sliceAroundPrompt,
    toText,
};
