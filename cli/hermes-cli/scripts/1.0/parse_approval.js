'use strict';

function cleanAnsi(text) {
  return String(text || '')
    .replace(/\u0007/g, '')
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

module.exports = function parseApproval(input) {
  const text = cleanAnsi(input?.screenText || input?.buffer || input?.tail || '');
  if (!text.trim()) return null;
  const isDangerousPrompt = /Dangerous Command/i.test(text)
    && /Allow once|Allow for this session|Add to permanent allowlist|Deny/i.test(text);
  if (!isDangerousPrompt) return null;

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^Auto-approved:/i.test(line))
    .slice(-20);

  return {
    message: lines.join(' ').slice(0, 220) || 'Approval required',
    buttons: ['Allow once', 'Allow for this session', 'Add to permanent allowlist', 'Deny'],
  };
};
