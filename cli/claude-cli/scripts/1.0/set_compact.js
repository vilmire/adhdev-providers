'use strict';

/**
 * Claude Code — setCompact
 *
 * Sends `/compact` to the PTY to toggle compact output mode.
 */
module.exports = function setCompact(input) {
    return {
        success: true,
        sent: true,
        command: {
            type: 'send_message',
            text: '/compact',
        },
        effects: [
            {
                type: 'toast',
                id: `claude-cli:compact:${Date.now()}`,
                persist: false,
                toast: {
                    level: 'info',
                    message: 'Toggled compact mode',
                },
            },
        ],
    };
};
