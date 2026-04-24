'use strict';

const { buildFromBufferFallback } = require('./screen_helpers.js');

const LEGACY_BUTTONS = [
  'Allow once',
  'Allow for this session',
  'Add to permanent allowlist',
  'Deny',
];

const MODERN_BUTTONS = [
  'Approve delete',
  'Do not delete',
  'Other (type your answer)',
];

function cleanAnsi(text) {
  return String(text || '')
    .replace(/\u0007/g, '')
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

function normalizeLine(line) {
  return cleanAnsi(line)
    .trim()
    .replace(/^[│┃]\s?/, '')
    .replace(/\s*[│┃]$/, '')
    .trim();
}

function getVisibleLines(input) {
  const screen = buildFromBufferFallback(input);
  const lines = Array.isArray(screen?.lines) ? screen.lines : [];
  return lines
    .map((line) => normalizeLine(line?.text || line?.trimmed || line || ''))
    .filter(Boolean)
    .filter((line) => !/^Auto-approved:/i.test(line));
}

function findLastIndex(lines, predicate) {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (predicate(lines[index], index)) return index;
  }
  return -1;
}

function hasNormalPromptAfter(lines, startIndex) {
  const trailing = lines.slice(startIndex + 1);
  const promptIndex = trailing.findIndex((line) => (
    /^❯\s*$/.test(line)
    || /^(?:⚕\s*)?❯\s*type a message\b/i.test(line)
    || /^Type your message or \/help for commands\.?$/i.test(line)
    || /^Resume this session with:/i.test(line)
  ));
  if (promptIndex < 0) return false;

  const beforePrompt = trailing.slice(0, promptIndex + 1).join('\n');
  if (/↑\/↓ to select|Enter to confirm|requires approval|approve the delete\?/i.test(beforePrompt)) {
    return false;
  }

  return true;
}

function buildLegacyApproval(lines) {
  const lastButtonIndex = findLastIndex(lines, (line) => LEGACY_BUTTONS.some((label) => line === label || line === `❯ ${label}`));
  if (lastButtonIndex < 0) return null;

  const titleIndex = findLastIndex(lines.slice(0, lastButtonIndex + 1), (line) => /Dangerous Command/i.test(line));
  if (titleIndex < 0 || titleIndex < (lastButtonIndex - 16)) return null;
  if (hasNormalPromptAfter(lines, lastButtonIndex)) return null;

  const buttons = LEGACY_BUTTONS.filter((label) => lines.slice(titleIndex, Math.min(lines.length, lastButtonIndex + 4)).some((line) => line === label || line === `❯ ${label}`));
  if (buttons.length === 0) return null;

  const messageLines = lines
    .slice(titleIndex, Math.min(lines.length, lastButtonIndex + 4))
    .map((line) => line.replace(/^❯\s*/, '').trim())
    .filter((line) => line && !LEGACY_BUTTONS.includes(line) && line !== 'Show full command');

  return {
    message: messageLines.join(' ').replace(/\s+/g, ' ').trim().slice(0, 220) || 'Approval required',
    buttons,
  };
}

function buildModernApproval(lines) {
  const lastButtonIndex = findLastIndex(lines, (line) => MODERN_BUTTONS.some((label) => line === label || line === `❯ ${label}`));
  if (lastButtonIndex < 0) return null;
  if (hasNormalPromptAfter(lines, lastButtonIndex)) return null;

  const titleSearchStart = Math.max(0, lastButtonIndex - 12);
  const titleRelativeIndex = lines
    .slice(titleSearchStart, lastButtonIndex + 1)
    .findIndex((line) => /requires approval|approve the delete\?/i.test(line));
  if (titleRelativeIndex < 0) return null;
  const titleIndex = titleSearchStart + titleRelativeIndex;

  const region = lines.slice(titleIndex, Math.min(lines.length, lastButtonIndex + 3));
  const buttons = [];
  for (const label of MODERN_BUTTONS) {
    if (region.some((line) => line === label || line === `❯ ${label}`)) buttons.push(label);
  }
  if (buttons.length === 0) return null;

  const messageLines = region
    .filter((line) => /requires approval|approve the delete\?/i.test(line))
    .map((line) => line.replace(/^❓\s*/, '').replace(/\s*\(\s*\)\s*$/, '').trim());
  const uniqueMessageParts = [];
  for (const line of messageLines) {
    if (!line) continue;
    if (uniqueMessageParts.includes(line)) continue;
    if (uniqueMessageParts.some((part) => part.includes(line) || line.includes(part))) continue;
    uniqueMessageParts.push(line);
  }

  return {
    message: uniqueMessageParts.join(' ').replace(/\s+/g, ' ').trim() || 'Approval required',
    buttons,
  };
}

module.exports = function parseApproval(input) {
  const lines = getVisibleLines(input);
  if (lines.length === 0) return null;
  return buildLegacyApproval(lines) || buildModernApproval(lines);
};
