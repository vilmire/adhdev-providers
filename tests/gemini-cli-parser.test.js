'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const parseOutput = require('../cli/gemini-cli/scripts/1.0/parse_output.js');
const parseSession = require('../cli/gemini-cli/scripts/1.0/parse_session.js');
const detectStatus = require('../cli/gemini-cli/scripts/1.0/detect_status.js');

function geminiRedrawTranscript() {
  return [
    '▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄',
    ' * Reply exactly: ADHDEV_GEMINI_SMOKE_123',
    '▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
    ' workspace (/directory)                             sandbox                     /model                            quota',
    ' /private/tmp/adhdev-gemini-quality                 no sandbox                  Auto (Gemini 3)                 2% used',
    '',
    ' ⠼ Thinking... (esc to cancel, 2s)                                                                      ? for shortcuts',
    '────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────',
    ' YOLO Ctrl+Y                                                                                           1 GEMINI.md file',
    '▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄',
    ' *   Type your message or @path/to/file',
    '▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
    ' workspace (/directory)                             sandbox                     /model                            quota',
    ' /private/tmp/adhdev-gemini-quality                 no sandbox                  Auto (Gemini 3)                 2% used',
    '✦ ADHDEV_GEMINI_SMOKE_123',
    '',
    '',
    ' ⠴ Thinking... (esc to cancel, 2s)                                                                      ? for shortcuts',
    '────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────',
    ' YOLO Ctrl+Y                                                                                           1 GEMINI.md file',
    '▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄',
    ' *   Type your message or @path/to/file',
    '▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
    ' workspace (/directory)                             sandbox                     /model                            quota',
    ' /private/tmp/adhdev-gemini-quality                 no sandbox                  Auto (Gemini 3)                 2% used',
    '✦ ADHDEV_GEMINI_SMOKE_123',
    '',
    '',
    '                                                                                                        ? for shortcuts',
    '────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────',
    ' YOLO Ctrl+Y                                                                                           1 GEMINI.md file',
    '▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄',
    ' *   Type your message or @path/to/file',
    '▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
    ' workspace (/directory)                             sandbox                     /model                            quota',
    ' /private/tmp/adhdev-gemini-quality                 no sandbox                  Auto (Gemini 3)                 2% used',
  ].join('\n');
}

test('gemini-cli treats final redraw screen as idle, not a stuck generating turn', () => {
  const status = detectStatus({ screenText: geminiRedrawTranscript(), tail: geminiRedrawTranscript(), isWaitingForResponse: true });
  assert.equal(status, 'idle');
});

test('gemini-cli treats a visible Thinking row as generating even when shortcuts/footer chrome is present', () => {
  const screen = [
    '▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄',
    ' * Explain the fixture briefly',
    '▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
    '✦ Previous answer remains visible while the next turn runs.',
    ' ⠼ Thinking... (esc to cancel, 8s)                                                                      ? for shortcuts',
    '────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────',
    ' YOLO Ctrl+Y                                                                                           1 GEMINI.md file',
    '▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄',
    ' *   Type your message or @path/to/file',
    '▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
    ' workspace (/directory)                             sandbox                     /model                            quota',
    ' /private/tmp/adhdev-gemini-quality                 no sandbox                  Auto (Gemini 3)                 2% used',
  ].join('\n');

  assert.equal(detectStatus({ screenText: screen, tail: screen, isWaitingForResponse: true }), 'generating');
  assert.equal(parseOutput({ screenText: screen, rawBuffer: screen, recentBuffer: screen, isWaitingForResponse: true, messages: [] }).status, 'generating');
});

test('gemini-cli treats Thinking plus ? for shortcuts on the same row as progress, not idle', () => {
  const screen = [
    '▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄',
    ' * Summarize status detection',
    '▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
    ' ⠴ Thinking... (esc to cancel, 2s)                                                                      ? for shortcuts',
  ].join('\n');

  assert.equal(detectStatus({ screenText: screen, tail: screen }), 'generating');
});

test('gemini-cli parses current promptText plus star/diamond Gemini UI reply into one clean turn', () => {
  const result = parseOutput({
    buffer: geminiRedrawTranscript(),
    recentBuffer: geminiRedrawTranscript().slice(-1000),
    screenText: geminiRedrawTranscript(),
    rawBuffer: geminiRedrawTranscript(),
    promptText: 'Reply exactly: ADHDEV_GEMINI_SMOKE_123',
    isWaitingForResponse: true,
    messages: [],
  });

  assert.equal(result.status, 'idle');
  assert.deepEqual(result.messages.map(message => message.role), ['user', 'assistant']);
  assert.equal(result.messages[0].content, 'Reply exactly: ADHDEV_GEMINI_SMOKE_123');
  assert.equal(result.messages[1].content, 'ADHDEV_GEMINI_SMOKE_123');
});

test('gemini-cli parse_session exposes daemon ParsedSession messages for Gemini current-turn UI', () => {
  const result = parseSession({
    buffer: geminiRedrawTranscript(),
    recentBuffer: geminiRedrawTranscript().slice(-1000),
    screenText: geminiRedrawTranscript(),
    rawBuffer: geminiRedrawTranscript(),
    promptText: 'Reply exactly: ADHDEV_GEMINI_SMOKE_123',
    isWaitingForResponse: true,
    messages: [],
  });

  assert.equal(result.status, 'idle');
  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].role, 'user');
  assert.equal(result.messages[1].role, 'assistant');
  assert.equal(result.messages[1].content, 'ADHDEV_GEMINI_SMOKE_123');
  assert.equal(result.messages[1].bubbleState, 'final');
});

test('gemini-cli keeps wrapped multi-line prompts and assistant replies from the live 0.40 redraw screen', () => {
  const screen = [
    '▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄',
    ' > Confirm the previous raw verification in one short paragraph. You must',
    ' mention tmp/adhdev_cli_verify.py, UNICODE_SENTINEL=⟦ADHDEV-CLI-VERIFY⟧, and',
    ' the square sequence 1,4,9,16,25 without changing the glyphs.',
    '▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
    '✦ The verification of tmp/adhdev_cli_verify.py is confirmed. The script was',
    ' successfully created and executed, producing the literal output',
    ' SQUARES=1,4,9,16,25 and the exact marker UNICODE_SENTINEL=⟦ADHDEV-CLI-VERIFY⟧',
    ' without changing the glyphs.',
    '────────────────────────────────────────────────────────────────────────',
    ' YOLO Ctrl+Y                                                   1 GEMINI.md file',
    '▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄',
    ' *   Type your message or @path/to/file',
    '▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
  ].join('\n');

  const result = parseOutput({
    screenText: screen,
    recentBuffer: screen.slice(-1000),
    rawBuffer: screen,
    messages: [],
  });

  assert.equal(result.status, 'idle');
  assert.deepEqual(result.messages.map(message => message.role), ['user', 'assistant']);
  assert.match(result.messages[0].content, /UNICODE_SENTINEL=⟦ADHDEV-CLI-VERIFY⟧/);
  assert.match(result.messages[0].content, /square sequence 1,4,9,16,25/);
  assert.match(result.messages[1].content, /tmp\/adhdev_cli_verify\.py is confirmed/);
  assert.match(result.messages[1].content, /SQUARES=1,4,9,16,25/);
  assert.match(result.messages[1].content, /UNICODE_SENTINEL=⟦ADHDEV-CLI-VERIFY⟧/);
});

test('gemini-cli drops leaked terminal device-attribute artifacts instead of showing 1;2c', () => {
  const screen = [
    '▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄',
    ' * Say artifact clean',
    '?1;2c',
    '▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
    '✦ artifact clean',
    '1;2c',
    '────────────────────────────────────────────────────────────────────────',
    ' YOLO Ctrl+Y                                                   1 GEMINI.md file',
    '▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄',
    ' *   Type your message or @path/to/file',
    '▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
  ].join('\n');

  const result = parseOutput({ screenText: screen, rawBuffer: screen, messages: [] });

  assert.deepEqual(result.messages.map(message => message.role), ['user', 'assistant']);
  assert.equal(result.messages[0].content, 'Say artifact clean');
  assert.equal(result.messages[1].content, 'artifact clean');
  assert.doesNotMatch(result.messages.map(message => message.content).join('\n'), /1;2c|\?1;2c/);
});

test('gemini-cli does not treat assistant markdown bullet lines as user turns', () => {
  const screen = [
    '▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄',
    ' * List two bullets',
    '▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
    '✦ Here are two bullets:',
    '* alpha',
    '* beta',
    '────────────────────────────────────────────────────────────────────────',
    ' YOLO Ctrl+Y                                                   1 GEMINI.md file',
    '▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄',
    ' *   Type your message or @path/to/file',
    '▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
  ].join('\n');

  const result = parseOutput({ screenText: screen, rawBuffer: screen, messages: [] });

  assert.deepEqual(result.messages.map(message => message.role), ['user', 'assistant']);
  assert.equal(result.messages[0].content, 'List two bullets');
  assert.equal(result.messages[1].content, 'Here are two bullets:\n* alpha\n* beta');
});

test('gemini-cli keeps bullet-looking continuation lines inside a user input box', () => {
  const screen = [
    '▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄',
    ' * Reply exactly with these three lines, no tools:',
    ' ADHDEV_TURN_ONE_OK',
    ' * assistant bullet stays assistant',
    ' NO_ARTIFACTS_HERE',
    '▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
    '✦ ADHDEV_TURN_ONE_OK',
    '* assistant bullet stays assistant',
    'NO_ARTIFACTS_HERE',
  ].join('\n');

  const result = parseOutput({ screenText: screen, rawBuffer: screen, messages: [] });

  assert.deepEqual(result.messages.map(message => message.role), ['user', 'assistant']);
  assert.match(result.messages[0].content, /ADHDEV_TURN_ONE_OK/);
  assert.match(result.messages[0].content, /\* assistant bullet stays assistant/);
  assert.equal(result.messages[1].content, 'ADHDEV_TURN_ONE_OK\n* assistant bullet stays assistant\nNO_ARTIFACTS_HERE');
});

test('gemini-cli strips inline leaked terminal artifacts from assistant text', () => {
  const screen = [
    '▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄',
    ' * Say clean inline artifact',
    '▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
    '✦ clean [?1;2c inline artifact',
    '1;2c',
    '────────────────────────────────────────────────────────────────────────',
    ' YOLO Ctrl+Y                                                   1 GEMINI.md file',
    '▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄',
    ' *   Type your message or @path/to/file',
    '▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
  ].join('\n');

  const result = parseOutput({ screenText: screen, rawBuffer: screen, messages: [] });

  assert.deepEqual(result.messages.map(message => message.role), ['user', 'assistant']);
  assert.equal(result.messages[1].content, 'clean inline artifact');
  assert.doesNotMatch(result.messages.map(message => message.content).join('\n'), /1;2c|\?1;2c/);
});

test('gemini-cli uses promptText to select the current turn from repeated redraw history', () => {
  const buffer = [
    '▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄',
    ' * Old prompt',
    '▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
    '✦ old answer',
    '────────────────────────────────────────────────────────────────────────',
    '▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄',
    ' * Current prompt',
    '▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
    '✦ current answer',
    '────────────────────────────────────────────────────────────────────────',
    '▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄',
    ' * Current prompt',
    '▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
    '✦ current answer',
  ].join('\n');

  const result = parseOutput({ buffer, rawBuffer: buffer, promptText: 'Current prompt', messages: [] });

  assert.deepEqual(result.messages.map(message => message.role), ['user', 'assistant', 'user', 'assistant']);
  assert.equal(result.messages[0].content, 'Old prompt');
  assert.equal(result.messages[1].content, 'old answer');
  assert.equal(result.messages[2].content, 'Current prompt');
  assert.equal(result.messages[3].content, 'current answer');
});

test('gemini-cli preserves committed prior messages when parsing a new current turn', () => {
  const buffer = [
    '▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄',
    ' * Current prompt',
    '▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
    '✦ current answer',
  ].join('\n');

  const result = parseOutput({
    buffer,
    rawBuffer: buffer,
    promptText: 'Current prompt',
    messages: [
      { role: 'user', content: 'Previous prompt' },
      { role: 'assistant', content: 'previous answer' },
    ],
  });

  assert.deepEqual(result.messages.map(message => message.role), ['user', 'assistant', 'user', 'assistant']);
  assert.deepEqual(result.messages.map(message => message.content), [
    'Previous prompt',
    'previous answer',
    'Current prompt',
    'current answer',
  ]);
});

test('gemini-cli pairs an orphan visible assistant answer with explicit promptText once', () => {
  const screen = '✦ orphan answer from live redraw';

  const result = parseOutput({ screenText: screen, rawBuffer: screen, promptText: 'Prompt missing from screen', messages: [] });

  assert.deepEqual(result.messages.map(message => message.role), ['user', 'assistant']);
  assert.equal(result.messages[0].content, 'Prompt missing from screen');
  assert.equal(result.messages[1].content, 'orphan answer from live redraw');
});

test('gemini-cli appends promptText as a user turn instead of pairing it with a prior complete answer', () => {
  const screen = [
    '▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄',
    ' * Old prompt',
    '▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
    '✦ old answer',
  ].join('\n');

  const result = parseOutput({ screenText: screen, rawBuffer: screen, promptText: 'New prompt', messages: [] });

  assert.deepEqual(result.messages.map(message => message.role), ['user', 'assistant', 'user']);
  assert.deepEqual(result.messages.map(message => message.content), ['Old prompt', 'old answer', 'New prompt']);
});

test('gemini-cli parses framed input rows without confusing the frame for content', () => {
  const screen = [
    '╭────────────────────────────────────────╮',
    '│ > Framed prompt                       │',
    '╰────────────────────────────────────────╯',
    '✦ framed answer',
    '────────────────────────────────────────────────────────────────────────',
    ' YOLO Ctrl+Y                                                   1 GEMINI.md file',
  ].join('\n');

  const result = parseOutput({ screenText: screen, rawBuffer: screen, messages: [] });

  assert.deepEqual(result.messages.map(message => message.role), ['user', 'assistant']);
  assert.equal(result.messages[0].content, 'Framed prompt');
  assert.equal(result.messages[1].content, 'framed answer');
});
