'use strict';

/**
 * Claude Code — setEffort
 *
 * Sends `/effort <level>` via raw PTY write (no response tracking).
 */
module.exports = function setEffort(input) {
    const value = input?.args?.value || input?.args?.VALUE;
    if (!value || typeof value !== 'string') {
        return { ok: false, error: 'Effort level is required' };
    }

    const level = value.trim().toLowerCase();
    const valid = ['low', 'medium', 'high', 'max'];
    if (!valid.includes(level)) {
        return { ok: false, error: `Invalid effort level: ${level}. Valid: ${valid.join(', ')}` };
    }

    return {
        ok: true,
        currentValue: level,
        command: {
            type: 'pty_write',
            text: `/effort ${level}`,
        },
        controlValues: {
            effort: level,
        },
    };
};
