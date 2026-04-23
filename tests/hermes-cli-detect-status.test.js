const test = require('node:test');
const assert = require('node:assert/strict');
const detectStatus = require('../cli/hermes-cli/scripts/1.0/detect_status.js');

test('hermes-cli stays generating when a short ellipsis status line is visible above an inline prompt footer', () => {
  const screenText = [
    '⚕ Hermes Agent v0.8.0',
    '( ˘⌣˘) calibrating...',
    '⚕ ❯ type a message + Enter to interrupt, Ctrl+C to cancel',
  ].join('\n');

  assert.equal(detectStatus({ screenText }), 'generating');
});

test('hermes-cli stays generating when a short ellipsis status line is visible above the regular prompt', () => {
  const screenText = [
    '⚕ Hermes Agent v0.10.0',
    '(¬_¬) calibrating...',
    'Type your message or /help for commands.',
    '❯',
  ].join('\n');

  assert.equal(detectStatus({ screenText }), 'generating');
});

test('hermes-cli ignores older ing... lines outside the 5-line prompt-adjacent window', () => {
  const screenText = [
    '⚕ Hermes Agent v0.10.0',
    'calibrating...',
    'older history line 1',
    'older history line 2',
    'older history line 3',
    'older history line 4',
    'Type your message or /help for commands.',
    '❯',
  ].join('\n');

  assert.equal(detectStatus({ screenText }), 'idle');
});

test('hermes-cli stays generating when an ing... status line is visible in the 5 lines above the user input', () => {
  const screenText = [
    'history line 1',
    'history line 2',
    'history line 3',
    'planning...',
    'Type your message or /help for commands.',
    '❯',
  ].join('\n');

  assert.equal(detectStatus({ screenText }), 'generating');
});

test('hermes-cli ignores non-ing ellipsis text above the prompt', () => {
  const screenText = [
    'history line',
    'done...',
    'Type your message or /help for commands.',
    '❯',
  ].join('\n');

  assert.equal(detectStatus({ screenText }), 'idle');
});

test('hermes-cli stays generating when prompt-adjacent status text includes trailing metrics and footer noise', () => {
  const screenText = [
    '(°ロ°) ruminating...                           1m 49s)              🔍 recall:)  ⚕ gpt-5.4 │ 271K/1.1M │ [███░░░░░░░] 26% │ 1h 58m',
    '────────────────────────────────────────────────────────────────────────────────',
    '⚕ ❯ type a message + Enter to interrupt, Ctrl+C to cancel',
    '────────────────────────────────────────────────────────────────────────────────',
  ].join('\n');

  assert.equal(detectStatus({ screenText, isWaitingForResponse: false }), 'generating');
});

test('hermes-cli reports idle only for a bare prompt without generating markers', () => {
  const screenText = [
    'Type your message or /help for commands.',
    '❯',
  ].join('\n');

  assert.equal(detectStatus({ screenText }), 'idle');
});

test('hermes-cli ignores stale generating markers that remain in older scrollback below an idle prompt', () => {
  const screenText = [
    'Initializing agent...',
    '⚕ ❯ type a message + Enter to interrupt, Ctrl+C to cancel',
    ...Array.from({ length: 24 }, (_, index) => `history line ${index + 1}`),
    'Welcome to Hermes Agent! Type your message or /help for commands.',
    '❯',
    'Resume this session with:',
    'hermes --resume 20260414_021144_e38454',
    'Session: 20260414_021144_e38454',
  ].join('\n');

  assert.equal(detectStatus({ screenText }), 'idle');
});

test('hermes-cli stays generating when tool output fills the 20-line window and interrupt footer has scrolled off', () => {
  // Simulate: interrupt footer is more than 20 lines above current scroll position.
  // No generating markers visible in last 20 lines, no bare prompt — should stay generating.
  const screenText = Array.from({ length: 20 }, (_, i) => `bash output line ${i + 1}`).join('\n');

  assert.equal(detectStatus({ screenText }), 'generating');
});

test('hermes-cli stays generating when startup text is still in the 20-line window alongside the interrupt footer', () => {
  // Hermes just received a prompt seconds after startup, so the idle ❯ and
  // "Resume this session with:" text are still within the 20-line window.
  // The interrupt footer proves generation is active — must not false-complete.
  const screenText = [
    '❯',
    'Resume this session with:',
    'hermes --resume 20260415_010000_abc123',
    'Session: 20260415_010000_abc123',
    '● Write a poem about otters.',
    '⚕ ❯ type a message + Enter to interrupt, Ctrl+C to cancel',
  ].join('\n');

  assert.equal(detectStatus({ screenText }), 'generating');
});

test('hermes-cli returns to idle when a stale prompt is visible and no live generation markers remain, even if isWaitingForResponse is still true', () => {
  const screenText = [
    'Welcome to Hermes Agent! Type your message or /help for commands.',
    '❯',
  ].join('\n');

  assert.equal(detectStatus({ screenText, isWaitingForResponse: true }), 'idle');
});

test('hermes-cli ignores stale dangerous-command approval lines when a normal idle prompt appears after them', () => {
  const screenText = [
    '╭────────────────────────────────────────────────────────────╮',
    '│ ⚠️ Dangerous Command                                      │',
    '│                                                            │',
    '│ node -e "dangerous"                                       │',
    '│                                                            │',
    '│ ❯ Allow once                                               │',
    '│   Allow for this session                                   │',
    '│   Add to permanent allowlist                               │',
    '│   Deny                                                     │',
    '│   Show full command                                        │',
    '│                                                            │',
    '│ script execution via -e/-c flag                            │',
    '╰────────────────────────────────────────────────────────────╯',
    'history line 1',
    'history line 2',
    'Welcome to Hermes Agent! Type your message or /help for commands.',
    '❯',
  ].join('\n');

  assert.equal(detectStatus({ screenText }), 'idle');
});

test('hermes-cli stays generating when startup text remains visible but the active turn has only plan/tool lines', () => {
  const screenText = [
    'Welcome to Hermes Agent! Type your message or /help for commands.',
    '❯',
    'Resume this session with:',
    'hermes --resume 20260415_184430_97ac2b',
    'Session: 20260415_184430_97ac2b',
    '● Please do all of the following in this workspace: (+11 lines)',
    '┊ 📋 plan 4 task(s) 0.0s',
    '┊ 💻 $ pwd 0.5s',
  ].join('\n');

  assert.equal(detectStatus({ screenText }), 'generating');
});

test('hermes-cli returns to idle when a completed assistant box is followed by the prompt', () => {
  const screenText = [
    'Welcome to Hermes Agent! Type your message or /help for commands.',
    '● Reply with exactly OK and nothing else.',
    'Initializing agent...',
    '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
    'OK',
    '╰──────────────────────────────────────────────────────────────────────────────╯',
    '⚕ gpt-5.4 │ 11.7K/1.1M │ [░░░░░░░░░░] 1% │',
    '❯',
  ].join('\n');

  assert.equal(detectStatus({ screenText }), 'idle');
});

test('hermes-cli returns to idle after a completed assistant box even if isWaitingForResponse is still true', () => {
  const screenText = [
    '⚡ Interrupted during API call.',
    '● In one short paragraph, summarize what you just executed.',
    '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
    'I created and ran tmp/adhdev_cli_verify.py in the workspace.',
    '╰──────────────────────────────────────────────────────────────────────────────╯',
    '⚕ gpt-5.4 │ 13.4K/1.1M │ [░░░░░░░░░░] 1% │',
    '❯',
  ].join('\n');

  assert.equal(detectStatus({ screenText, isWaitingForResponse: true }), 'idle');
});

test('hermes-cli stays generating while an assistant box is still open even if the prompt is already visible', () => {
  const screenText = [
    'Welcome to Hermes Agent! Type your message or /help for commands.',
    '● Summarize the workspace status in one sentence.',
    '╭─ ⚕ Hermes ───────────────────────────────────────────────────────────────────╮',
    'The workspace looks healthy so far.',
    'Still checking a couple more files...',
    '❯',
  ].join('\n');

  assert.equal(detectStatus({ screenText, isWaitingForResponse: true }), 'generating');
});
