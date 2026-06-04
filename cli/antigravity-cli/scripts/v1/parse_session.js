'use strict';

const parseOutput = require('./parse_output.js');
const { normalizeParseOutputSession } = require('../../../_shared/parse_session.js');

module.exports = function parseSession(stateOrInput, maybeInput) {
  const output = arguments.length >= 2
    ? parseOutput(stateOrInput, maybeInput || {})
    : parseOutput(stateOrInput || {});
  return normalizeParseOutputSession(output, {
    resultFields: {
      ...(typeof output?.retryPrompt === 'string' ? { retryPrompt: output.retryPrompt } : {}),
      ...(typeof output?.retryDelayMs === 'number' ? { retryDelayMs: output.retryDelayMs } : {}),
      ...(typeof output?.retryAttempt === 'number' ? { retryAttempt: output.retryAttempt } : {}),
      ...(typeof output?.retryMaxAttempts === 'number' ? { retryMaxAttempts: output.retryMaxAttempts } : {}),
      ...(typeof output?.errorMessage === 'string' ? { errorMessage: output.errorMessage } : {}),
      ...(typeof output?.errorReason === 'string' ? { errorReason: output.errorReason } : {}),
    },
  });
};
