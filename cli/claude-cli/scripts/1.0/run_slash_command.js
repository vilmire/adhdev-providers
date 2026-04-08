'use strict';

module.exports = function runSlashCommand(input) {
    const rawValue = input?.args?.VALUE ?? input?.args?.value;
    const command = typeof rawValue === 'string' ? rawValue.trim() : '';

    if (!command) {
        return {
            success: false,
            error: 'Slash command value is required',
        };
    }

    const allowed = new Set(['/init', '/help']);
    if (!allowed.has(command)) {
        return {
            success: false,
            error: `Unsupported Claude Code slash command: ${command}`,
        };
    }

    return {
        success: true,
        sent: true,
        command: {
            type: 'send_message',
            text: command,
        },
        effects: [
            {
                type: 'toast',
                id: `claude-cli:quick-action:${command}`,
                persist: false,
                toast: {
                    level: 'info',
                    message: `Claude Code quick action: ${command}`,
                },
            },
        ],
    };
};
