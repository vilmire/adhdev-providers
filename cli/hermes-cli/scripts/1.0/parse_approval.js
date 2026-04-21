'use strict';

function cleanAnsi(text) {
  return String(text || '')
    .replace(/\u0007/g, '')
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

function normalizeLines(text) {
  return cleanAnsi(text)
    .split(/\r?\n/)
    .map((line) => String(line || '').trim())
    .map((line) => line
      .replace(/^[│┃]\s?/, '')
      .replace(/\s*[│┃]$/, '')
      .replace(/^❯\s*/, '')
      .trim())
    .filter(Boolean);
}

module.exports = function parseApproval(input) {
  const text = cleanAnsi(input?.screenText || input?.buffer || input?.tail || '');
  if (!text.trim()) return null;

  const legacyDangerousPrompt = /Dangerous Command/i.test(text)
    && /Allow once|Allow for this session|Add to permanent allowlist|Deny/i.test(text);
  if (legacyDangerousPrompt) {
    const lines = normalizeLines(text)
      .filter((line) => !/^Auto-approved:/i.test(line))
      .slice(-20);
    return {
      message: lines.join(' ').slice(0, 220) || 'Approval required',
      buttons: ['Allow once', 'Allow for this session', 'Add to permanent allowlist', 'Deny'],
    };
  }

  const modernPrompt = /requires approval/i.test(text)
    && /Approve delete|Do not delete|Other \(type your answer\)/i.test(text);
  if (!modernPrompt) return null;

  const lines = normalizeLines(text).slice(-30);
  const messageLines = lines
    .filter((line) => /requires approval|approve the delete\?/i.test(line))
    .map((line) => line.replace(/^❓\s*/, '').replace(/\s*\(\s*\)\s*$/, '').trim());
  const uniqueMessageParts = [];
  for (const line of messageLines) {
    if (!line) continue;
    if (uniqueMessageParts.includes(line)) continue;
    if (uniqueMessageParts.some((part) => part.includes(line) || line.includes(part))) continue;
    uniqueMessageParts.push(line);
  }
  const message = uniqueMessageParts.join(' ').replace(/\s+/g, ' ').trim();

  const buttons = [];
  for (const line of lines) {
    const match = line.match(/^(Approve delete|Do not delete|Other \(type your answer\))$/i);
    if (!match) continue;
    const label = match[1];
    if (!buttons.includes(label)) buttons.push(label);
  }

  if (buttons.length === 0) return null;
  return {
    message: message || 'Approval required',
    buttons,
  };
};
