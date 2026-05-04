const test = require('node:test');
const assert = require('node:assert/strict');

const provider = require('../ide/antigravity/provider.json');

test('antigravity launches through the macOS app bundle so Electron receives CDP flags', () => {
  assert.equal(provider.type, 'antigravity');
  assert.equal(provider.processNames?.darwin, 'Antigravity');
  assert.deepEqual(provider.paths?.darwin, ['/Applications/Antigravity.app']);
  assert.equal(provider.launch?.prefer?.darwin, 'app');
  assert.deepEqual(provider.cdpPorts, [9335, 9336]);
});
