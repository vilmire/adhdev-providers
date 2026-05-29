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

module.exports = function detectStatus(input) {
  const text = textOf(input);
  if (!text.trim()) return 'idle';
  if (hasFeedbackPrompt(text)) return 'waiting_approval';
  if (hasHighTrafficError(text)) return 'error';
  if (parseApproval(input)) return 'waiting_approval';
  if (hasSettledIdlePrompt(input?.recentBuffer) || hasSettledIdlePrompt(input?.settledBuffer)) return 'idle';
  if (/\bThinking for\b/i.test(text)) return 'generating';
  if (/esc to cancel/i.test(text)) return 'generating';
  if (/(^|\n)\s*>\s*(\n|$)/m.test(text)) return 'idle';
  if (/\?\s+for\s+shortcuts/i.test(text)) return 'idle';
  return 'idle';
};
