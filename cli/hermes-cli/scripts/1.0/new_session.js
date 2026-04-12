'use strict';

/**
 * Hermes CLI — newSession
 *
 * Hermes supports /new (and /reset). Prefer /new.
 */
module.exports = function newSession() {
  return {
    success: true,
    command: {
      type: 'pty_write',
      text: '/new',
    },
  };
};
