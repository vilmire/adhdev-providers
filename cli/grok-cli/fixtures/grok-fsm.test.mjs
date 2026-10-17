// Run from the monorepo with: node --import tsx --test <this file>.
// Exercise the production FSM evaluator against provider-owned synthetic fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import loader from '../../../../oss/packages/daemon-core/src/providers/spec/fsm-loader.ts';
import evaluator from '../../../../oss/packages/daemon-core/src/providers/spec/fsm-evaluator.ts';
import fsmTypes from '../../../../oss/packages/daemon-core/src/providers/spec/fsm-types.ts';
import projection from '../../../../oss/packages/daemon-core/src/providers/spec/adapter-status-projection.ts';

const spec = JSON.parse(readFileSync(new URL('../specs/1.0.json', import.meta.url), 'utf8'));
const trust = readFileSync(new URL('./replay/trust-banner.pty', import.meta.url), 'utf8');
const consent = readFileSync(new URL('./replay/consent-banner.pty', import.meta.url), 'utf8');
const consentExpected = JSON.parse(readFileSync(new URL('./replay/consent-banner.expected.json', import.meta.url), 'utf8'));
const ready = '│ ❯\nShift+Tab:mode │ Ctrl+x:shortcuts';
const evaluate = (from, screen, elapsed = 9000) => evaluator.evaluateFsm(spec, from, screen,
  { row: 0, col: 0 }, screen.trimEnd().split('\n'),
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
