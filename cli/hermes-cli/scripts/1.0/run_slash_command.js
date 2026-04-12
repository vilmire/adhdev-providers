'use strict';

/**
 * Hermes CLI — runSlashCommand
 * Generic helper to send a slash command.
 */
module.exports = function runSlashCommand(input) {
  const cmd = input?.args?.command || input?.args?.cmd || input?.args?.value;
  if (!cmd || typeof cmd !== 'string') {
    return { success: false, error: 'command is required' };
  }

  const text = cmd.trim().startsWith('/') ? cmd.trim() : `/${cmd.trim()}`;

  return {
    success: true,
    command: {
      type: 'pty_write',
      text,
    },
  };
};
