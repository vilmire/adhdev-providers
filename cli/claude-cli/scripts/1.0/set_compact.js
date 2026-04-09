'use strict';

/**
 * Claude Code — setCompact
 *
 * Sends `/compact` via raw PTY write (no response tracking).
 */
module.exports = function setCompact(input) {
    return {
        success: true,
        command: {
            type: 'pty_write',
            text: '/compact',
        },
    };
};
