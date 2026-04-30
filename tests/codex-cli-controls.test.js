const test = require('node:test');
const assert = require('node:assert/strict');

const provider = require('../cli/codex-cli/provider.json');
const parseOutput = require('../cli/codex-cli/scripts/1.0/parse_output.js');
const listModels = require('../cli/codex-cli/scripts/1.0/list_models.js');
const setFast = require('../cli/codex-cli/scripts/1.0/set_fast.js');
const openModelPicker = require('../cli/codex-cli/scripts/1.0/open_model_picker.js');

test('codex-cli provider exposes explicit controls without unsafe model/reasoning selectors', () => {
  assert.deepEqual(
    (provider.controls || []).map(control => [control.id, control.type]),
    [
      ['model', 'display'],
      ['reasoning', 'display'],
      ['fast', 'toggle'],
      ['model_picker', 'action'],
    ],
  );
  assert.equal(provider.capabilities.controls.typedResults, true);

  const model = provider.controls.find(control => control.id === 'model');
  const reasoning = provider.controls.find(control => control.id === 'reasoning');
  assert.equal(model.setScript, undefined);
  assert.equal(reasoning.setScript, undefined);
  assert.equal(model.readFrom, 'model');
  assert.equal(reasoning.readFrom, 'reasoning');
});

test('codex-cli parse_output surfaces model, reasoning, and fast from session header', () => {
  const result = parseOutput({
    screenText: [
      '╭──────────────────────────────────────────────────────────╮',
      '│ >_ OpenAI Codex (v0.125.0)                              │',
      '│                                                          │',
      '│ model: gpt-5.5 high   fast   /model to change           │',
      '│ directory: …/adhdev                                      │',
      '│ permissions: YOLO mode                                  │',
      '╰──────────────────────────────────────────────────────────╯',
      '› Summarize recent commits',
      'gpt-5.5 high fast · /private/tmp/workspace',
    ].join('\n'),
    buffer: '',
    messages: [],
  });

  assert.deepEqual(result.controlValues, {
    model: 'gpt-5.5',
    reasoning: 'high',
    fast: true,
  });
});

test('codex-cli list_models parses debug models JSON and current footer value', () => {
  const result = listModels({
    screenText: 'gpt-5.4 low · /private/tmp/workspace',
    debugModelsOutput: [
      'WARNING: failed to clean up stale arg0 temp dirs: Permission denied (os error 13)',
      JSON.stringify({
        models: [
          {
            slug: 'gpt-5.5',
            display_name: 'GPT-5.5',
            description: 'Frontier model',
            default_reasoning_level: 'medium',
            supported_reasoning_levels: [{ effort: 'low' }, { effort: 'medium' }, { effort: 'high' }, { effort: 'xhigh' }],
            additional_speed_tiers: ['fast'],
            visibility: 'list',
          },
          {
            slug: 'gpt-5.4',
            display_name: 'GPT-5.4',
            description: 'Codex model',
            default_reasoning_level: 'low',
            supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }],
            additional_speed_tiers: [],
            visibility: 'list',
          },
        ],
      }),
    ].join('\n'),
  });

  assert.equal(result.currentValue, 'gpt-5.4');
  assert.deepEqual(result.options, [
    { value: 'gpt-5.5', label: 'GPT-5.5', description: 'default: medium · reasoning: low/medium/high/xhigh · fast' },
    { value: 'gpt-5.4', label: 'GPT-5.4', description: 'default: low · reasoning: low/high' },
  ]);
});

test('codex-cli set_fast maps toggle values to deterministic /fast commands', () => {
  const on = setFast({ args: { value: true } });
  assert.equal(on.ok, true);
  assert.equal(on.currentValue, true);
  assert.deepEqual(on.controlValues, { fast: true });
  assert.deepEqual(on.command, { type: 'pty_write', text: '/fast on', enterCount: 2 });

  const off = setFast({ args: { value: false } });
  assert.equal(off.ok, true);
  assert.equal(off.currentValue, false);
  assert.deepEqual(off.controlValues, { fast: false });
  assert.deepEqual(off.command, { type: 'pty_write', text: '/fast off', enterCount: 2 });
});

test('codex-cli model action sends only the documented native picker command', () => {
  assert.deepEqual(openModelPicker(), {
    ok: true,
    command: { type: 'pty_write', text: '/model', enterCount: 2 },
    effects: [{ type: 'toast', toast: { level: 'info', message: 'Opened Codex model picker in the terminal.' } }],
  });
});
