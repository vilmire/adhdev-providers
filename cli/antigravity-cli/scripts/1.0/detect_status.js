'use strict';

const parseApproval = require('./parse_approval.js');

function textOf(input) {
  const candidates = [input?.screenText, input?.recentBuffer, input?.buffer];
  for (const value of candidates) {
    const text = String(value || '').replace(/\u0007/g, '');
    if (text.trim()) return text;
  }
  return '';
}

function hasSettledIdlePrompt(text) {
  const source = String(text || '').replace(/\u0007/g, '');
  if (!source.trim()) return false;
  const promptIndex = source.lastIndexOf('\n>');
  const fallbackPromptIndex = source.trimStart().startsWith('>') ? 0 : -1;
  const index = promptIndex >= 0 ? promptIndex : fallbackPromptIndex;
  if (index < 0) return false;
  const tail = source.slice(index);
  return /^\s*>\s*(?:\n|$)/m.test(tail) && /\?\s+for\s+shortcuts/i.test(tail) && !/esc to cancel/i.test(tail);
}

function hasFeedbackPrompt(text) {
  const source = String(text || '').replace(/\u0007/g, '');
  return /how's the cli experience so far\?/i.test(source)
    && /\[0\]\s+skip/i.test(source);
}

function hasHighTrafficError(text) {
  return /servers?\s+are\s+experiencing\s+high\s+traffic/i.test(String(text || ''));
}

// Patterns that mean the model is actively producing output. If any of these
// are visible in the live buffer the status is generating regardless of how
// the prompt line looks — antigravity's screen paints can briefly show what
// looks like a settled `> ` prompt between tool result paints, and acting on
// that as idle is what causes the "idle blip → coordinator thinks the run
// finished" bug.
const ACTIVE_GENERATION_PATTERNS = [
  /esc to cancel/i,
  /\bThinking\b/i,
  /\bRunning\b/i,
  /\bUsing\s+Tool/i,
  /\bPrioritizing\s+Tool/i,
  // Braille spinner glyphs that the antigravity CLI paints while busy.
  /[⠀-⣿]/,
];

function hasActiveGenerationSignal(text) {
  if (!text) return false;
  return ACTIVE_GENERATION_PATTERNS.some((re) => re.test(text));
}

module.exports = function detectStatus(input) {
  const text = textOf(input);
  if (!text.trim()) return 'idle';
  if (hasFeedbackPrompt(text)) return 'waiting_approval';
  if (hasHighTrafficError(text)) return 'error';
  if (parseApproval(input)) return 'waiting_approval';

  // Always check the active-generation signals FIRST. If any spinner / tool
  // activity / "esc to cancel" appears anywhere in the visible text we are
  // mid-turn — every prompt-pattern check below is then a false positive.
  if (hasActiveGenerationSignal(text)) return 'generating';

  // The settled-prompt check is also strict: BOTH recentBuffer AND
  // settledBuffer must show the settled pattern. Earlier we OR'd them which
  // meant a single transient frame showing `> ` was enough to flip the
  // status to idle, and once the daemon emitted that idle the coordinator
  // could fire a premature "completed" notification.
  if (hasSettledIdlePrompt(input?.recentBuffer) && hasSettledIdlePrompt(input?.settledBuffer)) {
    return 'idle';
  }
  // No active-generation signal AND no clean settled prompt → stay
  // generating-safe: when the screen is ambiguous prefer not to report
  // completion. The fallback returns 'generating' (rather than 'idle')
  // because a wrong-direction false report breaks coordinator completion
  // semantics, while a brief over-report just delays the idle by one poll.
  if (/(^|\n)\s*>\s*(\n|$)/m.test(text) && /\?\s+for\s+shortcuts/i.test(text)) {
    return 'idle';
  }
  return 'generating';
};
