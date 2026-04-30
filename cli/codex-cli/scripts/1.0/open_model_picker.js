'use strict';

module.exports = function openModelPicker() {
  return {
    ok: true,
    command: { type: 'pty_write', text: '/model', enterCount: 2 },
    effects: [{ type: 'toast', toast: { level: 'info', message: 'Opened Codex model picker in the terminal.' } }],
  };
};
