'use strict';

/**
 * Hermes CLI — listModels
 *
 * Hermes supports `/model <provider:model>` inside chat.
 * We return a small curated list that is known to work well on OpenRouter.
 *
 * NOTE: This is not exhaustive; it's an MVP list.
 */
module.exports = function listModels() {
  return {
    options: [
      { value: 'google/gemini-3-flash-preview', label: 'google/gemini-3-flash-preview' },
      { value: 'google/gemini-3.1-flash-lite-preview', label: 'google/gemini-3.1-flash-lite-preview' },
      { value: 'openai/gpt-5.4-mini', label: 'openai/gpt-5.4-mini' },
      { value: 'openai/gpt-5.3-codex', label: 'openai/gpt-5.3-codex' },
      { value: 'anthropic/claude-sonnet-4.6', label: 'anthropic/claude-sonnet-4.6' }
    ]
  };
};
