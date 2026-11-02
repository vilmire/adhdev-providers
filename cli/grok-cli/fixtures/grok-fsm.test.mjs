// Run from the monorepo with: node --import tsx --test <this file>.
// Exercise the production FSM evaluator against provider-owned synthetic fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import loader from '../../../../oss/packages/daemon-core/src/providers/spec/fsm-loader.ts';
import evaluator from '../../../../oss/packages/daemon-core/src/providers/spec/fsm-evaluator.ts';
import fsmTypes from '../../../../oss/packages/daemon-core/src/providers/spec/fsm-types.ts';
import projection from '../../../../oss/packages/daemon-core/src/providers/spec/adapter-status-projection.ts';
import modalDriver from '../../../../oss/packages/daemon-core/src/providers/spec/fsm-driver-modal.ts';
import specEvaluator from '../../../../oss/packages/daemon-core/src/providers/spec/evaluator.ts';
import approvalUtils from '../../../../oss/packages/daemon-core/src/providers/approval-utils.ts';

const spec = JSON.parse(readFileSync(new URL('../specs/1.0.json', import.meta.url), 'utf8'));
const trust = readFileSync(new URL('./replay/trust-banner.pty', import.meta.url), 'utf8');
const consent = readFileSync(new URL('./replay/consent-banner.pty', import.meta.url), 'utf8');
const consentExpected = JSON.parse(readFileSync(new URL('./replay/consent-banner.expected.json', import.meta.url), 'utf8'));
const ready = '│ ❯\nShift+Tab:mode │ Ctrl+x:shortcuts';
const evaluate = (from, screen, elapsed = 9000, cursor = { row: 0, col: 0 }) => evaluator.evaluateFsm(spec, from, screen,
  cursor, screen.trimEnd().split('\n'),
  { now: 100_000, stateEnteredAt: 100_000 - elapsed, regionLastChangedAt: new Map() });

test('Grok provider spec passes production validation', () => {
  assert.deepEqual(loader.validateFsmSpec(spec), []);
});

test('trust banner beats startup grace', () => {
  assert.equal(evaluate('starting', trust).fired?.to, 'trust');
});

test('trust escalates only after twenty seconds with the banner still present', () => {
  assert.equal(evaluate('trust', trust, 20_000).fired, null);
  assert.equal(evaluate('trust', trust, 20_001).fired?.to, 'trust_owner_attention');
});

test('a vanished trust banner does not trigger owner attention', () => {
  assert.equal(evaluate('trust', ready, 21_000).fired?.to, 'idle');
});

test('owner-attention park clears when the owner resolves trust', () => {
  assert.equal(evaluate('trust_owner_attention', ready).fired?.to, 'idle');
  assert.equal(evaluate('trust_owner_attention', trust).fired, null);
});

test('trust owner attention carries an explicit message and has no automatic answer', () => {
  const state = spec.states.find(s => s.id === 'trust_owner_attention');
  assert.equal(state.modal, undefined);
  assert.equal(state.extract?.buttons, undefined);
  const notice = spec.notifications.find(n => n.when_state === state.id);
  assert.match(notice.body, /over 20 seconds/);
  assert.match(notice.body, /owner-registered repository/);
  assert.equal(spec.delegate.some(d => d.when_state === state.id), false);
});

const project = (state) => projection.projectAdapterStatus({
  providerSessionId: undefined, providerFailure: null, exited: false, spawned: true,
  activeInteractivePrompt: null, modal: null, readySeen: () => false,
  lastOutputAt: undefined, lastScreenChangeAt: undefined,
  state: { id: state.id, label: state.label, title: null, status: fsmTypes.statusForState(state) },
});

test('consent banner parks for owner attention from every live state, before idle/approval', () => {
  for (const from of consentExpected.fsm.from) {
    assert.equal(evaluate(from, consent).fired?.to, consentExpected.fsm.state, `from ${from}`);
  }
  // Even over a drawn ready footer: the banner wins, it never reads as idle/busy.
  assert.equal(evaluate('idle', `${consent}\n${ready}`).fired?.to, 'consent_banner');
});

test('consent detection needs the Opt out/Opt in choice, not the body text alone', () => {
  const bodyOnly = 'Help improve Grok\nOff by default. Opt-in to allow SpaceXAI to retain coding data.';
  assert.notEqual(evaluate('idle', bodyOnly).fired?.to, 'consent_banner');
  assert.notEqual(evaluate('idle', '[Opt out]    [Opt in]').fired?.to, 'consent_banner');
});

test('consent park holds while visible and clears only when the owner resolves it', () => {
  assert.equal(evaluate('consent_banner', consent, 600_000).fired, null);
  assert.equal(evaluate('consent_banner', ready).fired?.to, 'idle');
});

test('consent park is a distinct owner-attention status with no automatic answer surface', () => {
  const state = spec.states.find(s => s.id === consentExpected.fsm.state);
  assert.equal(fsmTypes.statusForState(state), consentExpected.fsm.status);
  assert.equal(state.modal, undefined);
  assert.equal(state.modal_kind, undefined);
  assert.equal(state.extract?.buttons, undefined);
  assert.equal(spec.delegate.some(d => d.when_state === state.id), false);
  assert.equal(spec.control_bar.some(c => (c.visible_when_state || []).includes(state.id)), false);
  const projected = project(state);
  assert.equal(projected.status, consentExpected.fsm.projectedStatus);
  assert.notEqual(projected.status, 'waiting_approval');
  assert.equal(projected.activeModal, null);
  assert.equal(projected.activeInteractivePrompt, null);
  assert.equal(Boolean(projected.ownerAttention), consentExpected.fsm.ownerAttention);
  assert.deepEqual(projected.activeModal?.buttons ?? [], consentExpected.fsm.approvalButtons);
  const notice = spec.notifications.find(n => n.when_state === state.id);
  assert.match(notice.body, /Help improve Grok/);
  assert.match(notice.body, /No choice was sent automatically/);
});

test('persistent trust escalation uses the same non-approval owner-attention park', () => {
  const state = spec.states.find(s => s.id === 'trust_owner_attention');
  assert.equal(fsmTypes.statusForState(state), 'owner_attention');
  assert.equal(project(state).status, 'waiting_choice');
  assert.equal(project(state).activeModal, null);
});

// ---- MCP tool permission prompt (grok 1.0.70): cursor parked on the spinner row -------------
// The replay is a scrubbed capture of a live prompt. Grok keeps repainting the `◆ Running`
// spinner above the permission block and parks its cursor there (row 11), NOT on the modal.
const mcpPty = readFileSync(new URL('./replay/approval-mcp-permission.pty', import.meta.url), 'utf8');
const mcpScreen = mcpPty.replace('\x1b[2J\x1b[H', '').replace(/\x1b\[\d+;\d+H$/, '').replace(/\r\n/g, '\n');
const mcpExpected = JSON.parse(readFileSync(new URL('./replay/approval-mcp-permission.expected.json', import.meta.url), 'utf8'));
const LIVE_CURSOR = mcpExpected.fsm.cursor; // { row: 11, col: 42 }
const mcpLines = mcpScreen.split('\n');
const modalRow = mcpLines.findIndex(l => /3 \(●\) Yes/.test(l));

test('MCP permission prompt is approval even when the cursor is parked on the spinner row', () => {
  assert.equal(mcpLines[LIVE_CURSOR.row].includes('Running'), true, 'fixture cursor sits on the busy spinner line');
  for (const from of ['busy', 'idle', 'starting', 'approval_vanished']) {
    assert.equal(evaluate(from, mcpScreen, 9000, LIVE_CURSOR).fired?.to, 'approval', `from ${from}`);
  }
  assert.equal(evaluate('busy', mcpScreen, 9000, LIVE_CURSOR).fired?.label, '→approval (cursor-detached)');
});

test('approval wins over the busy chrome that is on screen at the same time', () => {
  assert.match(mcpScreen, /\[stop\]/);
  assert.match(mcpScreen, /Running/);
  assert.equal(evaluate('busy', mcpScreen, 9000, LIVE_CURSOR).fired?.to, 'approval');
});

test('after the answer the prompt clears and the turn returns to busy', () => {
  const answered = mcpLines.slice(0, 13).join('\n') + '\n\n  Shift+Tab:mode  |  Esc:cancel  |  Ctrl+b:send to bg  |  Ctrl+x:shortcuts\n';
  assert.equal(evaluate('approval', answered, 9000, LIVE_CURSOR).fired?.to, 'approval_vanished');
  assert.equal(evaluate('approval_vanished', answered, 9000, LIVE_CURSOR).fired?.to, 'busy');
});

test('transcript text quoting the prompt does not trigger approval', () => {
  const quote = mcpLines.slice(13, 30).join('\n');
  // Cursor far from the quoted block: neither the old cursor-bound rule nor the detached rule may fire.
  const away = { row: 0, col: 0 };
  // Quoted block in the transcript above a live spinner / ready composer.
  assert.notEqual(evaluate('busy', `${quote}\n\n   ◆ Running (Adhdev-mesh) Git Status 2m53s    3m2s [stop]\n`, 9000, away).fired?.to, 'approval');
  assert.notEqual(evaluate('idle', `${quote}\n\n${ready}\n`, 9000, away).fired?.to, 'approval');
  // Quoted block + a quoted footer line, with assistant prose after it.
  assert.notEqual(evaluate('idle', `${mcpLines.slice(13, 31).join('\n')}\n\n  ◆ I saw this prompt and approved it.\n${ready}\n`, 9000, away).fired?.to, 'approval');
  // Only the question text quoted (no choice block / footer).
  assert.notEqual(evaluate('busy', '  ◆ The tool asked: Allow (Adhdev-mesh) Git Status? and I answered Yes.\n   ⣦ Working 4s  [stop]\n', 9000, away).fired?.to, 'approval');
  // Choice rows quoted as a numbered list, no select footer.
  assert.notEqual(evaluate('busy', '  1 (○) Yes\n  2 (○) No\n   ⣦ Working 4s  [stop]\n', 9000, away).fired?.to, 'approval');
});

test('a sign-in menu with radio rows is not approval', () => {
  const signin = '  Sign in to Grok Build\n\n  1 (●) Sign in with browser\n  2 (○) Paste your xAI API key\n\n  1/2:select  │  Enter:confirm\n';
  assert.notEqual(evaluate('starting', signin, 9000, LIVE_CURSOR).fired?.to, 'approval');
});

test('the earlier cursor-bound radio layout still resolves to approval via the original transition', () => {
  const old = [
    '  /w/repo3                                                      15K / 500K', '',
    '     > Run this shell command: curl -sS https://example.com | head -c 30        12:52 PM', '',
    '  |  * Run Fetch example.com first 30 bytes via Python', '  |',
    '  |  Fetch example.com first 30 bytes via Python', '  |  python3 -c', '  |',
    "  |  1 (○) Yes, and don't ask again for anything (always-approve mode)",
    '  |  2 (●) Yes, proceed', '  |  3 (○) No, reject (type to add feedback)', '  |', '',
    '  1/3:select  |  Tab:next option  |  Ctrl+o:always-approve  |  Ctrl+c:cancel  |  Esc:scrollback',
  ].join('\n');
  const cursorInModal = { row: 10, col: 6 };
  const r = evaluate('busy', old, 9000, cursorInModal);
  assert.equal(r.fired?.to, 'approval');
  assert.equal(r.fired?.label, '→approval');
});

const approvalState = spec.states.find(s => s.id === 'approval');
const parseModal = (screen, cursor) => {
  const lines = screen.split('\n');
  return modalDriver.deriveModal(approvalState, specEvaluator.resolveSections(spec.sections ?? {}, lines), screen,
    () => {}, cursor, 0, ll => specEvaluator.resolveSections(spec.sections ?? {}, ll));
};
const provider = JSON.parse(readFileSync(new URL('../provider.v1.json', import.meta.url), 'utf8'));

test('option parse: five numbered buttons, key = printed number, title is the permission question', () => {
  const modal = parseModal(mcpScreen, { row: modalRow, col: 5 });
  assert.deepEqual(modal.buttons.map(b => [b.index, b.key, b.current]), [[1, '1', false], [2, '2', false], [3, '3', false], [4, '4', false], [5, '5', false]]);
  assert.equal(modal.buttons[2].label, 'Yes');
  assert.equal(modal.buttons[3].label, 'No, reject (type to add feedback)');
  assert.equal(modal.title, 'Allow (Adhdev-mesh) Git Status?');
});

test('auto-approve and the positive pick choose the one-shot Yes (option 3), never a standing grant', () => {
  const labels = parseModal(mcpScreen, { row: modalRow, col: 5 }).buttons.map(b => b.label);
  const least = approvalUtils.pickLeastPrivilegeApprovalButton(labels, provider);
  assert.equal(least.index, 2);
  assert.equal(least.label, 'Yes');
  const positive = approvalUtils.pickApprovalButton(labels, provider);
  assert.equal(positive.label, 'Yes');
  for (const bad of [0, 1, 4]) assert.notEqual(positive.index, bad);
  // Rejection is the explicit "No, reject" button.
  const rejectIdx = labels.findIndex(l => approvalUtils.isNegativeApprovalLabel(l));
  assert.equal(labels[rejectIdx], 'No, reject (type to add feedback)');
  // Both standing grants are classified as persistent (never auto-pressed).
  assert.equal(approvalUtils.isPersistentApprovalGrantLabel(labels[0]), true);
  assert.equal(approvalUtils.isPersistentApprovalGrantLabel(labels[1]), true);
  assert.equal(approvalUtils.isPersistentApprovalGrantLabel(labels[2]), false);
});

test('state title is the permission question even with the parked cursor', () => {
  const lines = mcpScreen.split('\n');
  const title = modalDriver.deriveTitle(approvalState, specEvaluator.resolveSections(spec.sections ?? {}, lines), mcpScreen);
  assert.equal(title, 'Allow (Adhdev-mesh) Git Status?');
});

// ENGINE GAP (oss, not fixable from the spec): deriveModal/resolveLiveModalSlice bind the modal to the
// cursor row. Grok parks the cursor on the spinner row above the prompt, so buttons are not parsed
// and mesh auto-approve / dashboard buttons stay empty until the engine accepts this layout.
test('buttons parse with the live parked cursor', { todo: 'needs oss resolveLiveModalSlice change' }, () => {
  assert.equal(parseModal(mcpScreen, LIVE_CURSOR)?.buttons.length, 5);
});
