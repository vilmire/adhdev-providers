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
    models: [
      'google/gemini-3-flash-preview',
      'google/gemini-3.1-flash-lite-preview',
      'openai/gpt-5.4-mini',
      'openai/gpt-5.3-codex',
      'anthropic/claude-sonnet-4.6'
    ]
  };
};
