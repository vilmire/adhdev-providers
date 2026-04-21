const test = require('node:test');
const assert = require('node:assert/strict');

const provider = require('../cli/claude-cli/provider.json');
const listModels = require('../cli/claude-cli/scripts/1.0/list_models.js');
const setModel = require('../cli/claude-cli/scripts/1.0/set_model.js');
const parseOutput = require('../cli/claude-cli/scripts/1.0/parse_output.js');

test('claude-cli provider.json keeps only the frequently used bar controls', () => {
  assert.deepEqual(
    (provider.controls || []).map(control => control.id),
    ['model', 'effort'],
  );
});

test('claude-cli list_models includes default and infers current sonnet model from footer', () => {
  const result = listModels({
    screenText: [
      'Claude Code v2.1.84',
      'Sonnet 4.6 with high effort · Claude Pro',
      '❯',
    ].join('\n'),
  });

  assert.equal(result.currentValue, 'sonnet');
  assert.deepEqual(result.options[0], { value: 'default', label: 'default' });
});

test('claude-cli list_models infers default from set-model confirmation line even when a footer alias is also present', () => {
  const result = listModels({
    screenText: [
      '❯ /model default',
      '⎿  Set model to Sonnet 4.7 (default)',
      'Sonnet 4.7 with high effort · Claude Pro',
      '❯',
    ].join('\n'),
  });

  assert.equal(result.currentValue, 'default');
});

test('claude-cli list_models ignores older default confirmation lines outside the recent tail', () => {
  const oldLines = Array.from({ length: 20 }, (_, index) => `older line ${index + 1}`)
  const result = listModels({
    screenText: [
      '⎿  Set model to Sonnet 4.7 (default)',
      ...oldLines,
      'Opus 4.7 with high effort · Claude Pro',
      '❯',
    ].join('\n'),
  });

  assert.equal(result.currentValue, 'opus');
});

test('claude-cli set_model returns controlValues for optimistic UI updates', () => {
  const result = setModel({ args: { value: 'opus' } });

  assert.equal(result.ok, true);
  assert.equal(result.currentValue, 'opus');
  assert.deepEqual(result.controlValues, { model: 'opus' });
  assert.deepEqual(result.command, { type: 'pty_write', text: '/model opus' });
});

test('claude-cli parse_output surfaces default model from a recent confirmation line', () => {
  const result = parseOutput({
    screenText: [
      '❯ /model default',
      '⎿  Set model to Sonnet 4.7 (default)',
      'Sonnet 4.7 with high effort · Claude Pro',
      '  ➜ remote_vs git:(main) ✗                                   ● high · /effort',
    ].join('\n'),
    buffer: [
      '❯ /model default',
      '⎿  Set model to Sonnet 4.7 (default)',
      '❯',
    ].join('\n'),
    messages: [],
  });

  assert.deepEqual(result.controlValues, { model: 'default', effort: 'high' });
});

test('claude-cli parse_output keeps the current footer alias when an older default confirmation line is no longer recent', () => {
  const oldLines = Array.from({ length: 20 }, (_, index) => `older line ${index + 1}`)
  const result = parseOutput({
    screenText: [
      '⎿  Set model to Sonnet 4.7 (default)',
      ...oldLines,
      'Opus 4.7 with high effort · Claude Pro',
      '  ➜ remote_vs git:(main) ✗                                   ● high · /effort',
    ].join('\n'),
    buffer: [
      '❯ /model opus',
      '⎿  Set model to Opus 4.7',
      '❯',
    ].join('\n'),
    messages: [],
  });

  assert.deepEqual(result.controlValues, { model: 'opus', effort: 'high' });
});
