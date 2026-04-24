'use strict';

// Copied/adapted from cli/claude-cli/scripts/1.0/screen_helpers.js

function splitLines(text) {
  return String(text || '')
    .replace(/\u0007/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.replace(/\s+$/g, ''));
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

function hasOnlyStructuralPromptChromeBelow(lines, index) {
  const trailing = lines
    .slice(index + 1)
    .map(normalizeLineText)
    .filter(Boolean);
  return trailing.length > 0
    && trailing.length <= 2
    && trailing.every(line => /^[-─━═]{8,}$/.test(line));
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
  if (!hasOnlyStructuralPromptChromeBelow(lines, index)) return false;
  return isHorizontalSeparatorLine(lines[index - 1]) && isHorizontalSeparatorLine(lines[index + 1]);
}

function isPromptLineAt(lines, index) {
  const trimmed = normalizeLineText(lines[index]);
  if (/^(?:⚕\s*)?❯\s*(?:$|\S.*)$/.test(trimmed)) return true;
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

  // Hermes prompt can appear as a native `❯` line or as a boxed input row:
  // horizontal separator, `> ...`, horizontal separator.
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

function buildFromBufferFallback(input) {
  const screen = getScreen(input);
  if (screen && screen.lineCount > 0) return screen;
  return getBufferScreen(input);
}

function toText(lines, options = {}) {
  const trim = options.trim !== false;
  const text = (Array.isArray(lines) ? lines : [])
    .map(line => (typeof line === 'string' ? line : line?.text || ''))
    .join('\n');
  return trim ? text.trim() : text;
}

module.exports = {
  splitLines,
  normalizeLineText,
  isHorizontalSeparatorLine,
  isStructuralInputPromptLine,
  isPromptLineAt,
  findPromptLineIndex,
  buildScreenSnapshot,
  getScreen,
  getBufferScreen,
  getTailScreen,
  buildFromBufferFallback,
  toText,
};
