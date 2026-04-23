'use strict';

const BOX_RE = /^[\s─═╭╮╰╯│┌┐└┘├┤┬┴┼]+$/;
const TRUST_TITLE_RE = /\bworkspace\s+trust\s+required\b/i;
const TRUST_QUESTION_RE = /\bdo\s+you\s+trust\b.*\b(?:directory|workspace|project|folder)\b/i;
const TRUST_SUMMARY_RE = /\bcan\s+execute\s+code\b.*\baccess\s+files\b/i;
const RUN_QUESTION_RE = /\brun\s+this\s+command\?/i;
const WAITING_RE = /\bwaiting\s+for\s+approval\b/i;
const ALLOWLIST_RE = /\bnot\s+in\s+allowlist\b/i;
const HOTKEY_SUFFIX_RE = /^(?:shift\+tab|tab|esc(?:\s+or\s+[a-z])?|[a-z])$/i;
const BRACKET_OPTION_RE = /^(?:[▶→❯]\s*)?\[([a-z])\]\s+(.+)$/i;
const SUFFIX_OPTION_RE = /^(?:[▶→❯]\s*)?(.+?)\s+\(([^)]+)\)\s*$/i;

function splitLines(text) {
  return String(text || '')
    .replace(/\u0007/g, '')
    .split(/\r\n|\n|\r/g)
    .map((line) => line.replace(/\s+$/, ''));
}

function normalize(line) {
  return String(line || '')
    .replace(/\u0007/g, '')
    .replace(/^\d+;/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isNoise(line) {
  const text = normalize(line);
  return !text || BOX_RE.test(text);
}

function canonicalizeOption(label) {
  const text = normalize(label);
  if (!text) return '';
  if (/^trust\b.*\bworkspace\b/i.test(text)) return 'Trust this workspace';
  if (/^run\b.*\bonce\b/i.test(text)) return 'Run (once)';
  if (/^add\b.*\ballowlist\b/i.test(text)) return 'Add to allowlist';
  if (/^auto-?run\b/i.test(text)) return 'Auto-run everything';
  if (/^skip\b/i.test(text)) return 'Skip';
  if (/^quit\b/i.test(text)) return 'Quit';
  return text;
}

function extractOption(line) {
  const text = normalize(line)
    .replace(/^[│┃]\s*/, '')
    .replace(/\s*[│┃]$/, '')
    .trim();
  if (!text) return null;

  const bracketMatch = text.match(BRACKET_OPTION_RE);
  if (bracketMatch) {
    return canonicalizeOption(bracketMatch[2]);
  }

  const suffixMatch = text.match(SUFFIX_OPTION_RE);
  if (!suffixMatch) return null;
  const [, label, hotkey] = suffixMatch;
  if (!HOTKEY_SUFFIX_RE.test(hotkey)) return null;
  return canonicalizeOption(label);
}

function collectOptions(lines) {
  const options = [];
  for (const line of lines) {
    const option = extractOption(line);
    if (!option || options.includes(option)) continue;
    options.push(option);
  }
  return options;
}

function buildRunMessage(lines) {
  const messageParts = [];
  let includeContinuation = false;

  for (const rawLine of lines) {
    const line = normalize(rawLine);
    if (!line || extractOption(line)) continue;

    if (RUN_QUESTION_RE.test(line)) {
      messageParts.push('Run this command?');
      includeContinuation = false;
      continue;
    }

    if (ALLOWLIST_RE.test(line)) {
      messageParts.push(line);
      includeContinuation = true;
      continue;
    }

    if (/^\$\s+/.test(line)) {
      messageParts.push(line.replace(/^\$\s+/, ''));
      includeContinuation = true;
      continue;
    }

    if (
      includeContinuation
      && /[./]/.test(line)
      && !/\b(?:ctrl\+r|review\s+changed\s+files|cursor\s+agent|hint:)\b/i.test(line)
    ) {
      messageParts.push(line);
      includeContinuation = false;
    }
  }

  return messageParts.join(' ').replace(/\s+/g, ' ').trim();
}

function parseApprovalContext(input) {
  const text = String(input?.screenText || input?.tail || input?.buffer || '');
  const recentLines = splitLines(text).slice(-40);
  const normalized = recentLines.map(normalize).filter(Boolean);
  if (normalized.length === 0) return null;

  const options = collectOptions(recentLines);
  const hasTrustCue = normalized.some((line) => TRUST_TITLE_RE.test(line) || TRUST_QUESTION_RE.test(line));
  const hasRunCue = normalized.some((line) => RUN_QUESTION_RE.test(line) || WAITING_RE.test(line) || ALLOWLIST_RE.test(line));

  const trustOptionIndex = recentLines.reduce((lastIndex, line, index) => {
    const option = extractOption(line) || '';
    return /trust this workspace|quit/i.test(option) ? index : lastIndex;
  }, -1);
  const hasInteractivePromptAfterTrust = trustOptionIndex >= 0 && recentLines.slice(trustOptionIndex + 1).some((line) => {
    const normalizedLine = normalize(line);
    return /^[▶→❯›>]\s*(?:Plan, search, build anything|Add a follow-up)\b/i.test(normalizedLine)
      || /^Composer\b/i.test(normalizedLine);
  });

  if (
    hasTrustCue
    && !hasInteractivePromptAfterTrust
    && options.some((option) => /trust this workspace|quit/i.test(option))
  ) {
    return {
      kind: 'workspace_trust',
      message: 'Trust this workspace to let Cursor Agent access and execute files here.',
      buttons: options.filter((option) => /trust this workspace|quit/i.test(option)),
    };
  }

  if (hasRunCue && options.some((option) => /run \(once\)|add to allowlist|auto-run everything|skip/i.test(option))) {
    return {
      kind: 'command_approval',
      message: buildRunMessage(recentLines) || 'Run this command?',
      buttons: options.filter((option) => /run \(once\)|add to allowlist|auto-run everything|skip/i.test(option)),
    };
  }

  if (hasTrustCue && !hasInteractivePromptAfterTrust && normalized.some((line) => TRUST_SUMMARY_RE.test(line))) {
    return {
      kind: 'workspace_trust',
      message: 'Trust this workspace to let Cursor Agent access and execute files here.',
      buttons: ['Trust this workspace', 'Quit'],
    };
  }

  return null;
}

module.exports = {
  parseApprovalContext,
};
