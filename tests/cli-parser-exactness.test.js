'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const geminiParser = require('../cli/gemini-cli/scripts/1.0/gemini_transcript_parser.js');
const codexParseOutput = require('../cli/codex-cli/scripts/1.0/parse_output.js');
const cursorParseOutput = require('../cli/cursor-cli/scripts/1.0/parse_output.js');
const claudeParseOutput = require('../cli/claude-cli/scripts/1.0/parse_output.js');
const gooseParseOutput = require('../cli/goose-cli/scripts/1.0/parse_output.js');
const opencodeParseOutput = require('../cli/opencode-cli/scripts/1.0/parse_output.js');

function messages(result) {
  return (result.messages || []).map((message) => ({
    role: message.role,
    kind: message.kind || 'standard',
    content: message.content,
  }));
}

test('gemini parser does not treat punctuation/case-normalized text as the same prompt', () => {
  assert.equal(geminiParser.looksLikeSameText('Hello, world', 'hello world'), false);
  assert.equal(geminiParser.looksLikeSameText('공 백 유지', '공백유지'), false);
});

test('codex parser appends a prefix-like assistant update instead of substring-merging it into history', () => {
  const previousMessages = [
    { role: 'user', content: 'Summarize the exact parser behavior.' },
    { role: 'assistant', kind: 'standard', content: 'Exact parser behavior stays source-bound.' },
  ];
  const screenText = [
    '▌ Summarize the exact parser behavior.',
    '> Exact parser behavior stays source-bound and keeps the visible continuation.',
    '>',
  ].join('\n');

  const result = codexParseOutput({ screenText, buffer: screenText, messages: previousMessages });
  assert.deepEqual(messages(result).filter((message) => message.role === 'assistant'), [
    { role: 'assistant', kind: 'standard', content: 'Exact parser behavior stays source-bound.' },
    { role: 'assistant', kind: 'standard', content: 'Exact parser behavior stays source-bound and keeps the visible continuation.' },
  ]);
});

test('cursor parser appends distinct same-kind assistant content instead of replacing by role/kind key', () => {
  const previousMessages = [
    { role: 'user', content: 'Give two exact parser notes.' },
    { role: 'assistant', kind: 'standard', content: 'First exact note.' },
  ];
  const screenText = [
    '❯ Give two exact parser notes.',
    '',
    'Second exact note.',
    '❯',
  ].join('\n');

  const result = cursorParseOutput({ screenText, buffer: screenText, messages: previousMessages });
  assert.deepEqual(messages(result).filter((message) => message.role === 'assistant'), [
    { role: 'assistant', kind: 'standard', content: 'First exact note.' },
    { role: 'assistant', kind: 'standard', content: 'Second exact note.' },
  ]);
});

test('goose parser appends prefix-like assistant updates instead of substring-merging them', () => {
  const previousMessages = [
    { role: 'user', content: 'Summarize exact goose parser behavior.' },
    { role: 'assistant', content: 'Goose keeps exact parser output.' },
  ];
  const screenText = [
    '🪿 Summarize exact goose parser behavior.',
    'Goose keeps exact parser output plus this continuation.',
  ].join('\n');

  const result = gooseParseOutput({ screenText, buffer: screenText, messages: previousMessages });
  assert.match(messages(result).at(-1).content, /Goose keeps exact parser output\.\n\nGoose keeps exact parser output plus this continuation\./);
});

test('opencode parser appends prefix-like assistant updates instead of substring-merging them', () => {
  const previousMessages = [
    { role: 'user', content: 'Summarize exact opencode parser behavior.' },
    { role: 'assistant', content: 'OpenCode keeps exact parser output.' },
  ];
  const screenText = [
    '┃ Summarize exact opencode parser behavior.',
    'OpenCode keeps exact parser output plus this continuation.',
  ].join('\n');

  const result = opencodeParseOutput({ screenText, buffer: screenText, messages: previousMessages });
  assert.match(messages(result).at(-1).content, /OpenCode keeps exact parser output\.\n\nOpenCode keeps exact parser output plus this continuation\./);
});

test('claude parser keeps punctuation-distinct visible prompts distinct while still repairing terminal line-wrap boundaries', () => {
  const priorPrompt = 'Chat debug signal sent (chat-debug-20260430T182731031Z-f919c528-f19e-4117-857d-5f59536cf372-3e12c171); saved on daemon, locator copied.';
  const wrappedSamePrompt = [
    '❯ Chat debug signal sent (chat-debug-20260430T182731031Z-f919c528-f19e-4117-857',
    '  d-5f59536cf372-3e12c171); saved on daemon, locator copied.',
    '⏺ 확인됐네요.',
  ].join('\n');
  const sameResult = claudeParseOutput({
    screenText: wrappedSamePrompt,
    buffer: wrappedSamePrompt,
    messages: [
      { role: 'user', content: priorPrompt },
      { role: 'assistant', content: '확인됐네요.' },
    ],
  });
  assert.equal(messages(sameResult).filter((message) => message.role === 'user').length, 1);

  const punctuationDistinct = wrappedSamePrompt.replace('copied.', 'copied!');
  const distinctResult = claudeParseOutput({
    screenText: punctuationDistinct,
    buffer: punctuationDistinct,
    messages: [
      { role: 'user', content: priorPrompt },
      { role: 'assistant', content: '확인됐네요.' },
    ],
  });
  assert.equal(messages(distinctResult).filter((message) => message.role === 'user').length, 2);
});
