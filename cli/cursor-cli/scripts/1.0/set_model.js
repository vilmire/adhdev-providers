'use strict';

module.exports = function setModel(input) {
  const value = input?.args?.value || input?.args?.model || input?.args?.VALUE;
  if (!value || typeof value !== 'string') {
    return { ok: false, error: 'Model value is required' };
  }

  const model = value.trim();
  return {
    ok: true,
    currentValue: model,
    controlValues: {
      model,
    },
    command: {
      type: 'pty_write',
      text: `/model ${model}`,
    },
  };
};
