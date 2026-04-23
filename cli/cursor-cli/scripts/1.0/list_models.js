'use strict';

const KNOWN_MODELS = [
  { value: 'auto', label: 'Auto' },
  { value: 'composer-2-fast', label: 'Composer 2 Fast' },
  { value: 'composer-2', label: 'Composer 2' },
  { value: 'composer-1.5', label: 'Composer 1.5' },
  { value: 'gpt-5.4-medium', label: 'GPT-5.4' },
  { value: 'gpt-5.4-medium-fast', label: 'GPT-5.4 Fast' },
  { value: 'claude-4.6-sonnet-medium', label: 'Claude Sonnet 4.6' },
  { value: 'claude-opus-4-7-high', label: 'Claude Opus 4.7' },
  { value: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro' },
];

const MODEL_NAME_TO_ID = new Map([
  ['auto', 'auto'],
  ['composer 2 fast', 'composer-2-fast'],
  ['composer 2', 'composer-2'],
  ['composer 1.5', 'composer-1.5'],
  ['gpt-5.4', 'gpt-5.4-medium'],
  ['gpt-5.4 fast', 'gpt-5.4-medium-fast'],
  ['claude sonnet 4.6', 'claude-4.6-sonnet-medium'],
  ['claude opus 4.7', 'claude-opus-4-7-high'],
  ['gemini 3.1 pro', 'gemini-3.1-pro'],
]);

function extractCurrentModel(text) {
  const normalized = String(text || '').replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '');
  const explicit = normalized.match(/^[ \t]*Model[ \t]+(.+)$/im);
  if (explicit) {
    const id = MODEL_NAME_TO_ID.get(explicit[1].trim().toLowerCase());
    if (id) return id;
  }

  for (const option of KNOWN_MODELS) {
    const labelRegex = new RegExp(`\\b${option.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (labelRegex.test(normalized)) return option.value;
  }
  return '';
}

module.exports = function listModels(input) {
  const text = input?.recentBuffer || input?.screenText || input?.buffer || '';
  return {
    options: KNOWN_MODELS,
    currentValue: extractCurrentModel(text),
  };
};
