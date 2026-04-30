'use strict';

function toBoolean(value) {
  if (value === true || value === false) return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['1', 'true', 'on', 'yes', 'fast'].includes(normalized)) return true;
  if (['0', 'false', 'off', 'no', 'standard'].includes(normalized)) return false;
  return null;
}

module.exports = function setFast(input = {}) {
  const value = toBoolean(input.args?.value ?? input.value ?? input.currentValue);
  if (value === null) {
    return {
      ok: false,
      error: 'setFast requires a boolean-like value',
    };
  }

  return {
    ok: true,
    currentValue: value,
    controlValues: { fast: value },
    command: {
      type: 'pty_write',
      text: value ? '/fast on' : '/fast off',
      enterCount: 2,
    },
  };
};
