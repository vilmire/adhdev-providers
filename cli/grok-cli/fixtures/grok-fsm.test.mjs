// Run from the monorepo with: node --import tsx --test <this file>.
// Exercise the production FSM evaluator against provider-owned synthetic fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import loader from '../../../../oss/packages/daemon-core/src/providers/spec/fsm-loader.ts';
import evaluator from '../../../../oss/packages/daemon-core/src/providers/spec/fsm-evaluator.ts';

const spec = JSON.parse(readFileSync(new URL('../specs/1.0.json', import.meta.url), 'utf8'));
const trust = readFileSync(new URL('./replay/trust-banner.pty', import.meta.url), 'utf8');
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
