/**
 * Regression tests for two Claude Code state-detection bugs:
 *
 *   b1: parse_approval falsely fires when the assistant's prose mentions
 *       phrases like "Do you want to proceed" without an active modal.
 *       The auto-approval path then injects "1" into the prompt, which
 *       interferes with the next user/task input.
 *
 *   b2: detect_status flaps from 'generating' to 'idle' for a single frame
 *       while the model is still producing tokens (briefly empty spinner
 *       between tool steps), causing the daemon to fire a spurious
 *       generating_completed event.
 *
 * Both fixes are scoped to the claude-cli provider scripts only — other
 * CLI providers (codex-cli, gemini-cli, hermes-cli) must not be affected.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const detectStatus = require('../cli/claude-cli/scripts/1.0/detect_status.js');
const parseApproval = require('../cli/claude-cli/scripts/1.0/parse_approval.js');
const { createState } = require('../cli/claude-cli/scripts/1.0/scripts.js');
const { buildScreenSnapshot } = require('../cli/claude-cli/scripts/1.0/screen_helpers.js');

// ─── b1: approval false-positive suppression ─────────────────────────────────

test('claude-cli parse_approval does NOT fire when assistant prose mentions "Do you want to proceed" but no modal is rendered', () => {
  const screenText = [
    '⏺ Here is how the approval flow typically works:',
    '   When Claude wants to run a Bash command, it will ask:',
    '   "Do you want to proceed?" and you can answer with 1, 2, or 3.',
    '',
    '⏺ Let me know if you want me to demonstrate this with a real command.',
    '',
    '────────────────────────────────────────────────────────────────────────────────',
    '❯ ',
    '────────────────────────────────────────────────────────────────────────────────',
    '  ➜ adhdev git:(main)',
    '  ⏵⏵ accept edits on (shift+tab to cycle)',
  ].join('\n');

  const input = {
    screenText,
    buffer: screenText,
    tail: screenText,
    screen: buildScreenSnapshot(screenText),
  };

  assert.equal(
    parseApproval(input),
    null,
    'prose mentioning "Do you want to proceed" outside the live frame must not trigger an approval modal',
  );
  assert.notEqual(
    detectStatus(input),
    'waiting_approval',
    'detect_status must not snap to waiting_approval when no modal is rendered',
  );
});

test('claude-cli parse_approval does NOT fire on a numbered prose list followed by an idle prompt', () => {
  // Real symptom from user logs: assistant explains options in a numbered
  // list, then the idle prompt appears. The old isButtonLine regex grabbed
  // "1. ...", "2. ...", "3. ..." as buttons; combined with the prose phrase
  // "Do you want to" elsewhere in the buffer, auto-approval would send "1".
  const screenText = [
    '⏺ I can do this in three ways:',
    '   1. Run the migration directly',
    '   2. Open a PR with the diff first',
    '   3. Print the SQL without executing',
    '',
    '⏺ Which approach do you want me to take?',
    '',
    '────────────────────────────────────────────────────────────────────────────────',
    '❯ ',
    '────────────────────────────────────────────────────────────────────────────────',
    '  ➜ adhdev git:(main)',
  ].join('\n');

  const input = {
    screenText,
    buffer: screenText,
    tail: screenText,
    screen: buildScreenSnapshot(screenText),
  };

  assert.equal(parseApproval(input), null, 'numbered prose list must not be parsed as approval buttons');
});

test('claude-cli parse_approval STILL fires for a real modal with cue + numbered buttons (positive control)', () => {
  // Positive control: same general structure as b1 fixture but with a real
  // approval cue inside the live (post-separator) frame.
  const screenText = [
    '⏺ Bash command',
    '',
    '   rm -rf /tmp/scratch',
    '   Delete the scratch directory',
    '',
    '────────────────────────────────────────────────────────────────────────────────',
    '   Do you want to proceed?',
    '   ❯ 1. Yes',
    '     2. Yes, and don’t ask again for: rm commands in /tmp',
    '     3. No, and tell Claude what to do differently (esc)',
    '────────────────────────────────────────────────────────────────────────────────',
    '  Esc to cancel · Tab to amend · ctrl+e to explain',
  ].join('\n');

  const input = {
    screenText,
    buffer: screenText,
    tail: screenText,
    screen: buildScreenSnapshot(screenText),
  };

  const modal = parseApproval(input);
  assert.notEqual(modal, null, 'a real modal with cue + numbered buttons must still be detected');
  assert.ok(Array.isArray(modal.buttons) && modal.buttons.length >= 2,
    'real modal must surface its buttons');
});

// ─── b2: generating hold hysteresis ──────────────────────────────────────────

function makeGeneratingFrame() {
  const text = [
    '⏺ Reading the file…',
    '',
    '⎿  Running `git status`',
    '',
    '✻ Cooked for 2s (340 tokens)',
    'esc to interrupt',
  ].join('\n');
  return { screenText: text, buffer: text, tail: text, screen: buildScreenSnapshot(text) };
}

function makeRedrawFrame() {
  // Brief redraw frame: spinner glyph absent, no esc-to-interrupt footer,
  // no shell chrome below the prompt. This is the single-frame redraw that
  // previously snapped detect_status to 'idle'.
  const text = [
    '⏺ Reading the file…',
    '',
    '⎿  Running `git status`',
    '',
    '',
    '',
  ].join('\n');
  return { screenText: text, buffer: text, tail: text, screen: buildScreenSnapshot(text) };
}

function makeStrongIdleFrame() {
  const text = [
    '⏺ Done — the file was updated.',
    '',
    '────────────────────────────────────────────────────────────────────────────────',
    '❯ ',
    '────────────────────────────────────────────────────────────────────────────────',
    '  ➜ adhdev git:(main)',
    '  ⏵⏵ accept edits on (shift+tab to cycle)',
  ].join('\n');
  return { screenText: text, buffer: text, tail: text, screen: buildScreenSnapshot(text) };
}

test('claude-cli detect_status holds generating across a single redraw frame inside the hold window', () => {
  const state = createState();

  // Frame 1: real generating signal — establishes lastGeneratingAt.
  assert.equal(detectStatus(state, makeGeneratingFrame()), 'generating');

  // Frame 2: redraw without spinner. Without state hysteresis this would
  // resolve to a non-generating status; with the fix it must keep 'generating'
  // because we're still well inside the hold window and don't have sustained
  // idle evidence.
  assert.equal(
    detectStatus(state, makeRedrawFrame()),
    'generating',
    'a single redraw frame must not flip status away from generating',
  );
});

test('claude-cli detect_status eventually returns idle on sustained, strong idle evidence', () => {
  const state = createState();
  assert.equal(detectStatus(state, makeGeneratingFrame()), 'generating');

  // Strong idle (idle prompt below separator + shell chrome) is the "trusted
  // immediately" path — even during the hold window it must return idle.
  assert.equal(
    detectStatus(state, makeStrongIdleFrame()),
    'idle',
    'strong idle evidence (prompt + shell chrome) must bypass the hold',
  );
});

test('claude-cli detect_status resets idle counter when generating reappears', () => {
  const state = createState();
  // Generating → redraw (held generating) → real generating again must clear
  // the consecutive-idle counter so a future short idle blip still gets held.
  assert.equal(detectStatus(state, makeGeneratingFrame()), 'generating');
  assert.equal(detectStatus(state, makeRedrawFrame()), 'generating');
  assert.equal(detectStatus(state, makeGeneratingFrame()), 'generating');
  assert.equal(state.consecutiveIdleFrames, 0,
    'a confirmed generating frame must reset the idle confirmation counter');
});
