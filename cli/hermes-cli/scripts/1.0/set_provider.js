'use strict';

const { buildPtyWrite } = require('./helpers.js');

module.exports = function setProvider(input) {
  const value = input?.args?.value || input?.args?.provider || input?.args?.VALUE;
  if (!value || typeof value !== 'string') {
    return { ok: false, error: 'Provider value is required' };
  }

  const provider = value.trim();
  return buildPtyWrite(`/model --provider ${provider}`, {
    controlValues: {
      provider,
    },
  });
};
