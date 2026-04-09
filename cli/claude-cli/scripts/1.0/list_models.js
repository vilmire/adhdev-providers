'use strict';

/**
 * Claude Code — listModels
 *
 * Returns available model options for the model selector.
 * Claude Code accepts aliases (sonnet, opus, haiku) and full model names.
 * This list is kept up-to-date with known Claude models.
 *
 * The user can also type a full model name directly via /model in the CLI,
 * so this list serves as quick-access shortcuts, not an exhaustive catalog.
 */
module.exports = function listModels(input) {
    return {
        models: [
            { value: 'sonnet', name: 'Sonnet (latest)', group: 'Latest' },
            { value: 'opus', name: 'Opus (latest)', group: 'Latest' },
            { value: 'haiku', name: 'Haiku (latest)', group: 'Latest' },
            { value: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', group: 'Specific' },
            { value: 'claude-opus-4', name: 'Claude Opus 4', group: 'Specific' },
            { value: 'claude-haiku-3-5', name: 'Claude Haiku 3.5', group: 'Specific' },
        ],
    };
};
