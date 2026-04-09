'use strict';

/**
 * Claude Code — setEffort
 *
 * Sends `/effort <level>` to the PTY to change effort level.
 * Valid levels: low, medium, high, max
 */
module.exports = function setEffort(input) {
    const value = input?.args?.value || input?.args?.VALUE;
    if (!value || typeof value !== 'string') {
        return { success: false, error: 'Effort level is required' };
    }

    const level = value.trim().toLowerCase();
    const valid = ['low', 'medium', 'high', 'max'];
    if (!valid.includes(level)) {
        return { success: false, error: `Invalid effort level: ${level}. Valid: ${valid.join(', ')}` };
    }

    return {
        success: true,
        sent: true,
        command: {
            type: 'send_message',
            text: `/effort ${level}`,
        },
        controlValues: {
            effort: level,
        },
        effects: [
            {
                type: 'toast',
                id: `claude-cli:set-effort:${Date.now()}`,
                persist: false,
                toast: {
                    level: 'info',
                    message: `Effort → ${level}`,
                },
            },
        ],
    };
};
