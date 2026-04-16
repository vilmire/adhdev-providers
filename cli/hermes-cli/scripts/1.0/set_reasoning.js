'use strict';

const { buildPtyWrite } = require('./helpers.js');

const VALID_LEVELS = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh']);

module.exports = function setReasoning(input) {
  const value = input?.args?.value || input?.args?.VALUE;
  if (!value || typeof value !== 'string') {
    return { ok: false, error: 'Reasoning level is required' };
  }

  const level = value.trim().toLowerCase();
  if (!VALID_LEVELS.has(level)) {
    return { ok: false, error: `Invalid reasoning level: ${level}` };
  }

  return buildPtyWrite(`/reasoning ${level}`, {
    controlValues: {
      reasoning: level,
    },
  });
};
