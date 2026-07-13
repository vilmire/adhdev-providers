// Guards the claude-cli 4.0 spec `sections/modal.until` anchor against the
// AUTOAPPROVE wedge: a Bash approval whose wrapped command preview lands a shell
// redirect at line start (`>/dev/null 2>&1`). An over-broad anchor whose char
// class contained a bare `>` mistook that redirect for the input prompt and
// terminated the modal section ABOVE the `❯ 1. Yes / 2. No` choices, so button
// extraction fell below min_count → current_modal=null → auto-approve bailed
// every frame → the delegated worker stalled in approval for ~144s.
//
// The fix narrows the anchor so a bare `>` terminates the modal ONLY as a real
// input prompt (`>` at end-of-line or before whitespace), never as a redirect.
// This test is self-contained (reads the JSON spec, no provider scripts) so it
// runs in the providers repo's own `node --test` sweep.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const specPath = path.join(__dirname, '..', 'cli', 'claude-cli', 'specs', '4.0.json');
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const until = new RegExp(spec.sections.modal.until);

test('modal `until` does NOT treat a leading shell redirect as the modal terminator', () => {
  assert.equal(until.test(' >/dev/null 2>&1'), false);
  assert.equal(until.test('>/dev/null'), false);
  assert.equal(until.test('>&2'), false);
  assert.equal(until.test('>file.txt'), false);
  // Note: the reported wedge — and the overwhelmingly common redirect form —
  // is `>`-immediately-followed-by-a-non-space (`>/dev/null`, `>&2`, `>file`),
  // which is now excluded. A space-form `> out.log` is intentionally NOT
  // excluded: it is syntactically indistinguishable from a real bare input
  // prompt (`> ` followed by typed text), and the input prompt MUST keep
  // terminating the modal. Erring toward keeping the prompt anchor is correct.
});

test('modal `until` still terminates at a genuine bare input prompt', () => {
  assert.equal(until.test('> '), true);
  assert.equal(until.test('>'), true);
});

test('modal `until` still terminates at cursor/shell-prompt glyphs but never at a numbered choice row', () => {
  assert.equal(until.test(' ❯ '), true);
  assert.equal(until.test('   ➜ oss git:(main)'), true);
  assert.equal(until.test(' ❯ 1. Yes'), false); // numbered choice → negative lookahead excludes
  assert.equal(until.test('   2. No'), false);
});

test('the approval command-preview scenario keeps its Yes/No choices below the redirect line', () => {
  // Reconstruct the modal section the daemon would slice: from the modal anchor
  // down to the first `until` hit. Assert the redirect line does NOT cut it off
  // before the choices.
  const screen = [
    '⏺ Bash(rm -rf build',
    ' >/dev/null 2>&1)',
    '',
    'Do you want to proceed?',
    ' ❯ 1. Yes',
    '   2. No',
  ];
  const firstTerminator = screen.findIndex((l) => until.test(l));
  // No line in this block should terminate the modal (choices use `\d+.` which
  // the negative lookahead excludes; the redirect is no longer a terminator).
  assert.equal(firstTerminator, -1, `unexpected modal terminator at line ${firstTerminator}: ${screen[firstTerminator]}`);
});
