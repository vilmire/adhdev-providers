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

module.exports = function detectStatus(input) {
  const text = textOf(input);
  if (!text.trim()) return 'idle';
  if (parseApproval(input)) return 'waiting_approval';
  if (/\bThinking for\b/i.test(text)) return 'generating';
  if (/esc to cancel/i.test(text)) return 'generating';
  if (/(^|\n)\s*>\s*(\n|$)/m.test(text)) return 'idle';
  if (/\?\s+for\s+shortcuts/i.test(text)) return 'idle';
  return 'idle';
};