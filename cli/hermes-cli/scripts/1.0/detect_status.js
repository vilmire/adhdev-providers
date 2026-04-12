/**
 * Hermes CLI — detect_status (MVP)
 */
'use strict';

function textOf(input) {
  return [input?.tail, input?.screenText, input?.buffer, input?.rawBuffer]
    .filter(Boolean)
    .map(String)
    .join('\n');
}

module.exports = function detectStatus(input) {
  const t = textOf(input);
  if (!t.trim()) return 'idle';

  // Approval-ish prompts
  if (/(\(y\/n\)|\[Y\/n\]|Enter to confirm|Always allow|Allow once|Approve)/i.test(t)) {
    return 'waiting_approval';
  }

  // Generating / busy
  if (/(Thinking|Planning|Analyzing|Searching|Working|Drafting|Synthesizing|Inspecting)/i.test(t)) {
    return 'generating';
  }
  // Hermes status bar includes elapsed like "59s" and "ctx".
  if (/\bctx\b/i.test(t) && /\b\d+s\b/.test(t)) {
    return 'generating';
  }
  if (/[\u2800-\u28ff]{2,}/.test(t)) {
    return 'generating';
  }

  // Ready prompt glyph
  if (/^❯\s*$/m.test(t)) {
    return 'ready';
  }

  // Default
  return 'ready';
};
