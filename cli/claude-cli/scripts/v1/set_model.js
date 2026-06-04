'use strict';

const MODEL_ALIASES = {
    default: 'default',
    sonnet: 'sonnet',
    opus: 'opus',
    haiku: 'haiku',
    'claude-sonnet-4-6': 'sonnet',
    'claude-opus-4': 'opus',
    'claude-haiku-3-5': 'haiku',
};

/**
 * Claude Code — setModel
 *
 * Sends `/model <alias>` via raw PTY write (no response tracking).
 */
module.exports = function setModel(input) {
    const value = input?.args?.value || input?.args?.model || input?.args?.VALUE;
    if (!value || typeof value !== 'string') {
        return { ok: false, error: 'Model value is required' };
    }

    const requestedModel = value.trim();
    const model = MODEL_ALIASES[requestedModel] || requestedModel;
    return {
        ok: true,
        currentValue: model,
        controlValues: {
            model,
        },
        command: {
            type: 'pty_write',
            text: `/model ${model}`,
        },
    };
};
