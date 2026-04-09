'use strict';

/**
 * Claude Code — listModels
 *
 * Returns available model options for the model selector.
 * Claude Code accepts aliases (sonnet, opus, haiku) and full model names.
 *
 * IMPORTANT: ControlsBar uses `item.name || item.id || item.value` as both
 * the display label AND the value sent to setModel. So we return plain strings
 * that Claude Code actually accepts.
 */
module.exports = function listModels(input) {
    return {
        models: [
            'sonnet',
            'opus',
            'haiku',
            'claude-sonnet-4-6',
            'claude-opus-4',
            'claude-haiku-3-5',
        ],
    };
};
