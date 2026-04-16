'use strict';

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

    return {
        ok: true,
        currentValue: value.trim(),
        command: {
            type: 'pty_write',
            text: `/model ${value.trim()}`,
        },
    };
};
