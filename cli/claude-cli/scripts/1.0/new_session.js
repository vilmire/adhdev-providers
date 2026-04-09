'use strict';

/**
 * Claude Code — newSession
 *
 * Sends `/clear` to the PTY to start a fresh conversation.
 */
module.exports = function newSession(input) {
    return {
        success: true,
        sent: true,
        command: {
            type: 'send_message',
            text: '/clear',
        },
        effects: [
            {
                type: 'toast',
                id: `claude-cli:new-session:${Date.now()}`,
                persist: false,
                toast: {
                    level: 'info',
                    message: 'Starting new session',
                },
            },
        ],
    };
};
