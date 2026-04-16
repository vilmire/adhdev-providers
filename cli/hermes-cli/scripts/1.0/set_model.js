'use strict';

const { buildPtyWrite } = require('./helpers.js');

/**
 * Hermes CLI — setModel
 *
 * Sends `/model <value>`.
 */
module.exports = function setModel(input) {
  const value = input?.args?.value || input?.args?.model || input?.args?.VALUE;
  if (!value || typeof value !== 'string') {
    return { ok: false, error: 'Model value is required' };
  }

  return buildPtyWrite(`/model ${value.trim()}`, {
    currentValue: value.trim(),
  });
};
