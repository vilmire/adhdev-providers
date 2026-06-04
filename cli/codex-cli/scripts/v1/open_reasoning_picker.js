'use strict';

/**
 * open_reasoning_picker — Send /reasoning to the Codex CLI PTY.
 * Codex CLI's /reasoning command opens the reasoning-level picker in the terminal.
 */
module.exports = function openReasoningPicker() {
  return {
    ok: true,
    command: { type: 'pty_write', text: '/reasoning', enterCount: 2 },
    effects: [{ type: 'toast', toast: { level: 'info', message: 'Opened Codex reasoning picker in the terminal.' } }],
  };
};
