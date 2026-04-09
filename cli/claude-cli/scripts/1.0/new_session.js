'use strict';

/**
 * Claude Code — newSession
 *
 * Sends `/clear` via raw PTY write (no response tracking).
 */
module.exports = function newSession(input) {
    return {
        success: true,
        command: {
            type: 'pty_write',
            text: '/clear',
        },
    };
};
