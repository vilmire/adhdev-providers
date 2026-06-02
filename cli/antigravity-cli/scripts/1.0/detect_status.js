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

// Restrict the search to the *current* render — the tail of the buffer
// starting from the last separator line. Earlier-turn output and
// scrolled-out tool activity are not evidence the model is still
// generating; only signals visible in the live frame count.
function liveFrameTail(text) {
  if (!text) return '';
  // Antigravity paints two horizontal separator lines around the prompt bar.
  // The most recent "──────…\n>" marks the start of the live frame; anything
  // above it is scrollback (previous turn output).
  const sepRe = /─{40,}\s*\n\s*>\s*(?:\n|─{40,})/g;
  let lastIdx = -1;
  let m;
  while ((m = sepRe.exec(text)) !== null) lastIdx = m.index;
  if (lastIdx >= 0) return text.slice(lastIdx);
  // Fallback to a tail-only window so 8KB of scrollback can't claim the
  // active signal forever.
  return text.length > 1200 ? text.slice(-1200) : text;
}

function hasActiveGenerationSignal(text) {
  if (!text) return false;
  const frame = liveFrameTail(text);
  return ACTIVE_GENERATION_PATTERNS.some((re) => re.test(frame));
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

  // No active-generation signal → trust the settled-prompt check. We OR
  // recentBuffer and settledBuffer here: with the active-signal guard above
  // it is no longer possible for a transient paint blip to fire idle while
  // generation is still happening (the spinner glyph or "esc to cancel"
  // would have short-circuited us into generating). Requiring BOTH buffers
  // to settle was too strict and trapped real completions in generating
  // forever — observed when the user's answer was fully rendered but the
  // status never flipped back to idle.
  if (hasSettledIdlePrompt(input?.recentBuffer) || hasSettledIdlePrompt(input?.settledBuffer)) {
    return 'idle';
  }
  // Plain settled-prompt fallback on the full text (legacy path).
  if (/(^|\n)\s*>\s*(\n|$)/m.test(text) && /\?\s+for\s+shortcuts/i.test(text)) {
    return 'idle';
  }
  // Genuinely ambiguous: no spinner, no settled prompt. Default to
  // generating — coordinator false completion is a worse failure than a
  // delayed idle that the next poll will resolve.
  return 'generating';
};
