'use strict';

const { execFileSync } = require('child_process');
const { extractCurrentModel, modelsFromDebugOutput } = require('./control_helpers.js');

module.exports = function listModels(input = {}) {
  const text = input.recentBuffer || input.screenText || input.buffer || input.rawBuffer || '';
  let debugOutput = typeof input.debugModelsOutput === 'string' ? input.debugModelsOutput : '';

  if (!debugOutput && input.runCodexDebugModels !== false) {
    try {
      debugOutput = execFileSync('codex', ['debug', 'models'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5000,
      });
    } catch (error) {
      debugOutput = `${error.stdout || ''}
${error.stderr || ''}`;
    }
  }

  return {
    options: modelsFromDebugOutput(debugOutput),
    currentValue: extractCurrentModel(text),
  };
};
