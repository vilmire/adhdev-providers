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

  // Hermes prompt can appear either as a bare prompt line (`❯`) or as an
  // inline footer/prompt line such as `⚕ ❯ type a message + Enter to interrupt...`.
  const promptLineIndex = (() => {
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const trimmed = normalizeLineText(lines[i]);
      if (/^(?:⚕\s*)?❯\s*(?:$|\S.*)$/.test(trimmed)) return i;
    }
    return -1;
  })();

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

function buildFromBufferFallback(input) {
  const screen = getScreen(input);
  if (screen && screen.lineCount > 0) return screen;
  return buildScreenSnapshot(input?.buffer || input?.tail || '');
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
  buildScreenSnapshot,
  getScreen,
  buildFromBufferFallback,
  toText,
};
