'use strict';

const { getScreen, buildFromBufferFallback } = require('./screen_helpers.js');

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
  // Approval detection must only use the current visible screen.
  // Falling back to the buffer risks false positives from old resolved
  // approval dialogs that are still present in the terminal scrollback.
  const screen = getScreen(input);
  if (!screen || screen.lineCount === 0) return [];
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

function normalizeOptionLine(line) {
  return String(line || '')
    .replace(/^❯\s*/, '')
    .replace(/^\d+\.\s*/, '')
    .trim();
}

function looksLikeClarifyQuestionLine(line) {
  const text = normalizeOptionLine(line).replace(/\s+/g, ' ').trim();
  if (!text) return false;
  return /[?？]/.test(text)
    || /(?:까요|나요|습니까|습니까요|할까요|될까요|인가요|있나요|없나요)(?:[.!。]?|[”"'）)\]]*)$/i.test(text);
}

function lineMatchesButton(line, label) {
  return normalizeOptionLine(line) === label;
}

function isStructuralApprovalLine(line) {
  return /^(?:╭|╰)[─━═-]{4,}/.test(line)
    || /^Hermes needs your input/i.test(line)
    || /^↑\/↓ to select, Enter to confirm/i.test(line)
    || line === '[object Object]';
}

function isClarifySelectionHint(line) {
  return /↑\/↓ to select|Enter to confirm/i.test(String(line || ''));
}

function hasClarifySelectionHint(lines, startIndex = 0) {
  return lines.slice(Math.max(0, startIndex)).some(isClarifySelectionHint);
}

function uniqueNonEmptyStrings(values) {
  const result = [];
  const seen = new Set();
  for (const value of values || []) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function parseClarifyDebugJson(line) {
  const text = String(line || '');
  if (!/\bclarify\b|choices_offered|"choices"/.test(text)) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    const buttons = uniqueNonEmptyStrings(parsed?.choices_offered || parsed?.choices);
    const answered = typeof parsed?.user_response === 'string' && parsed.user_response.trim().length > 0;
    if (answered || buttons.length === 0) return null;
    const message = String(parsed?.question || '').replace(/\s+/g, ' ').trim() || 'Input required';
    return { message, buttons };
  } catch (_error) {
    return null;
  }
}

function isResolvedApprovalOutcomeLine(line) {
  const text = String(line || '').trim();
  return /\b(?:timeout|timed out)\b.*\bdenying\b/i.test(text)
    || /\bdenying\s+command\b/i.test(text)
    || /\b(?:command|request|approval)\s+denied\b/i.test(text)
    || /\bdenied\s+(?:command|request|approval)\b/i.test(text);
}

function hasResolvedApprovalOutcome(lines, startIndex, endIndex) {
  return lines
    .slice(Math.max(0, startIndex), Math.min(lines.length, endIndex + 1))
    .some(isResolvedApprovalOutcomeLine);
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
  const lastButtonIndex = findLastIndex(lines, (line) => LEGACY_BUTTONS.some((label) => lineMatchesButton(line, label)));
  if (lastButtonIndex < 0) return null;

  const titleIndex = findLastIndex(lines.slice(0, lastButtonIndex + 1), (line) => /Dangerous Command/i.test(line));
  if (titleIndex < 0 || titleIndex < (lastButtonIndex - 16)) return null;
  if (hasResolvedApprovalOutcome(lines, titleIndex, lastButtonIndex)) return null;
  if (hasNormalPromptAfter(lines, lastButtonIndex)) return null;

  const region = lines.slice(titleIndex, Math.min(lines.length, lastButtonIndex + 4));
  const buttons = LEGACY_BUTTONS.filter((label) => region.some((line) => lineMatchesButton(line, label)));
  if (buttons.length === 0) return null;

  const messageLines = region
    .map((line) => normalizeOptionLine(line))
    .filter((line) => line && !LEGACY_BUTTONS.includes(line) && line !== 'Show full command' && !isStructuralApprovalLine(line));

  return {
    message: messageLines.join(' ').replace(/\s+/g, ' ').trim().slice(0, 220) || 'Approval required',
    buttons,
  };
}

function buildModernApproval(lines) {
  const lastButtonIndex = findLastIndex(lines, (line) => MODERN_BUTTONS.some((label) => lineMatchesButton(line, label)));
  if (lastButtonIndex < 0) return null;
  if (hasNormalPromptAfter(lines, lastButtonIndex)) return null;

  const titleSearchStart = Math.max(0, lastButtonIndex - 12);
  const titleRelativeIndex = lines
    .slice(titleSearchStart, lastButtonIndex + 1)
    .findIndex((line) => /requires approval|approve the delete\?/i.test(line));
  if (titleRelativeIndex < 0) return null;
  const titleIndex = titleSearchStart + titleRelativeIndex;
  if (hasResolvedApprovalOutcome(lines, titleIndex, lastButtonIndex)) return null;

  const region = lines.slice(titleIndex, Math.min(lines.length, lastButtonIndex + 3));
  const buttons = [];
  for (const label of MODERN_BUTTONS) {
    if (region.some((line) => lineMatchesButton(line, label))) buttons.push(label);
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

function buildClarifyChoiceApproval(lines) {
  const debugIndex = findLastIndex(lines, (line) => parseClarifyDebugJson(line));
  if (debugIndex >= 0 && hasClarifySelectionHint(lines, debugIndex)) {
    return parseClarifyDebugJson(lines[debugIndex]);
  }

  const hintIndex = findLastIndex(lines, isClarifySelectionHint);
  if (hintIndex < 0) return null;

  const headerIndex = findLastIndex(
    lines.slice(0, hintIndex + 1),
    (line) => /Hermes needs your input/i.test(line),
  );
  if (headerIndex < 0) return null;

  const region = lines.slice(headerIndex + 1, hintIndex)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isStructuralApprovalLine(line));
  const selectedIndex = region.findIndex((line) => /^❯\s*\S/.test(line));
  if (selectedIndex < 0) return null;

  let firstChoiceIndex = selectedIndex;
  for (let index = selectedIndex - 1; index >= 0; index -= 1) {
    if (looksLikeClarifyQuestionLine(region[index])) {
      firstChoiceIndex = index + 1;
      break;
    }
  }

  const buttons = uniqueNonEmptyStrings(region.slice(firstChoiceIndex).map(normalizeOptionLine));
  if (buttons.length === 0) return null;

  const message = uniqueNonEmptyStrings(region.slice(0, firstChoiceIndex))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Input required';

  return { message, buttons };
}

module.exports = function parseApproval(input) {
  const lines = getVisibleLines(input);
  if (lines.length === 0) return null;
  return buildLegacyApproval(lines) || buildModernApproval(lines) || buildClarifyChoiceApproval(lines);
};
