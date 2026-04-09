'use strict';

/**
 * Claude Code — setModel
 *
 * Sends `/model <alias>` to the PTY to switch the active model.
 * Claude Code accepts aliases: sonnet, opus, haiku, or full model names.
 */
module.exports = function setModel(input) {
    const value = input?.args?.value || input?.args?.model || input?.args?.VALUE;
    if (!value || typeof value !== 'string') {
        return { success: false, error: 'Model value is required' };
    }

    return {
        success: true,
        sent: true,
        command: {
            type: 'send_message',
            text: `/model ${value.trim()}`,
        },
        effects: [
            {
                type: 'toast',
                id: `claude-cli:set-model:${Date.now()}`,
                persist: false,
                toast: {
                    level: 'info',
                    message: `Switching model to ${value.trim()}`,
                },
            },
        ],
    };
};
