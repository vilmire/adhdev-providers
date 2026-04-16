'use strict';

function cleanAnsi(text) {
  return String(text || '')
    .replace(/\u0007/g, '')
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

function extractCurrentModel(text) {
  const source = cleanAnsi(text);
  const matches = Array.from(source.matchAll(/⚕\s+([^|\n\r]+?)\s+│/g));
  const value = matches.length > 0 ? matches[matches.length - 1][1] : '';
  return String(value || '').trim() || undefined;
}

function extractProviderSessionId(text) {
  const source = cleanAnsi(text);
  const matches = Array.from(source.matchAll(/Session(?:\s+ID)?:\s+([A-Za-z0-9_-]+)/g));
  const value = matches.length > 0 ? matches[matches.length - 1][1] : '';
  return String(value || '').trim() || undefined;
}

function buildPtyWrite(text, extra) {
  const payload = extra && typeof extra === 'object' ? { ...extra } : {};
  payload.ok = true;
  payload.command = { type: 'pty_write', text: String(text || '').trim() };
  return payload;
}

module.exports = {
  buildPtyWrite,
  cleanAnsi,
  extractCurrentModel,
  extractProviderSessionId,
};
