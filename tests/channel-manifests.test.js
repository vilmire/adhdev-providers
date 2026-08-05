const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function runChannelValidator(...args) {
  return spawnSync(process.execPath, ['scripts/validate-channels.mjs', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

function output(result) {
  return `${result.stdout || ''}${result.stderr || ''}`;
}

// Loads the ESM channel lib and returns a valid stable/preview entry pair for
// one real artifact, plus a second valid digest for conflict fixtures.
async function makeFixtureData() {
  const lib = await import('../scripts/lib/provider-channels.mjs');
  const artifacts = lib.indexProviderArtifacts();
  const publishedAt = '2026-07-27T00:00:00.000Z';
  const previewEntry = lib.buildChannelEntry(artifacts.get('cline'), { publishedAt });
  const stableEntry = {
    ...previewEntry,
    promotedFrom: { channel: 'preview', bundleDigest: previewEntry.bundleDigest, promotedAt: publishedAt },
  };
  const otherDigest = lib.computeProviderTreeDigest(artifacts.get('codex').relDir);
  return { publishedAt, previewEntry, stableEntry, otherDigest };
}

function writeManifest(dir, channel, providers, extra = {}) {
  const manifest = {
    schemaVersion: 1,
    channel,
    publishedAt: '2026-07-27T00:00:00.000Z',
    providers,
    ...extra,
  };
  const file = path.join(dir, `${channel}.json`);
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
  return file;
}

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adhdev-channel-manifest-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('generated stable and preview channel manifests validate', () => {
  const result = runChannelValidator();
  assert.equal(result.status, 0, output(result));
});

test('valid stable+preview fixture manifests validate, including identical-digest promotion', async () => {
  const { previewEntry, stableEntry } = await makeFixtureData();
  withTempDir((dir) => {
    const preview = writeManifest(dir, 'preview', [previewEntry]);
    const stable = writeManifest(dir, 'stable', [stableEntry]);
    const result = runChannelValidator(preview, stable);
    assert.equal(result.status, 0, output(result));
  });
});

test('malformed (non-sha256) bundleDigest is rejected', async () => {
  const { previewEntry } = await makeFixtureData();
  withTempDir((dir) => {
    const file = writeManifest(dir, 'preview', [{ ...previewEntry, bundleDigest: 'md5:0123456789abcdef' }]);
    const result = runChannelValidator(file);
    assert.equal(result.status, 1, output(result));
    assert.match(output(result), /bundleDigest/);
  });
});

test('duplicate providerType+providerVersion within a channel is rejected', async () => {
  const { previewEntry } = await makeFixtureData();
  withTempDir((dir) => {
    const file = writeManifest(dir, 'preview', [previewEntry, previewEntry]);
    const result = runChannelValidator(file);
    assert.equal(result.status, 1, output(result));
    assert.match(output(result), /duplicate entry 'cline@1\.0\.0'/);
  });
});

test('conflicting duplicate (same key, different digest) is rejected', async () => {
  const { previewEntry, otherDigest } = await makeFixtureData();
  withTempDir((dir) => {
    const file = writeManifest(dir, 'preview', [previewEntry, { ...previewEntry, bundleDigest: otherDigest }]);
    const result = runChannelValidator(file);
    assert.equal(result.status, 1, output(result));
    assert.match(output(result), /conflicting duplicate entry 'cline@1\.0\.0'/);
  });
});

test('promotion with differing source digest is rejected', async () => {
  const { stableEntry, otherDigest } = await makeFixtureData();
  withTempDir((dir) => {
    const mutated = {
      ...stableEntry,
      promotedFrom: { ...stableEntry.promotedFrom, bundleDigest: otherDigest },
    };
    const file = writeManifest(dir, 'stable', [mutated]);
    const result = runChannelValidator(file);
    assert.equal(result.status, 1, output(result));
    assert.match(output(result), /promotedFrom digest mismatch/);
  });
});

test('invalid compatibility ideVersion range is rejected', async () => {
  const { previewEntry } = await makeFixtureData();
  withTempDir((dir) => {
    const mutated = { ...previewEntry, compatibility: { ideVersion: ['not-a-semver-range'] } };
    const file = writeManifest(dir, 'preview', [mutated]);
    const result = runChannelValidator(file);
    assert.equal(result.status, 1, output(result));
    assert.match(output(result), /invalid compatibility\.ideVersion range 'not-a-semver-range'/);
  });
});

test('unknown schemaVersion is rejected', async () => {
  const { previewEntry } = await makeFixtureData();
  withTempDir((dir) => {
    const file = writeManifest(dir, 'preview', [previewEntry], { schemaVersion: 99 });
    const result = runChannelValidator(file);
    assert.equal(result.status, 1, output(result));
    assert.match(output(result), /schemaVersion/);
  });
});

test('unknown channel value is rejected', async () => {
  const { previewEntry } = await makeFixtureData();
  withTempDir((dir) => {
    const file = writeManifest(dir, 'beta', [previewEntry], { channel: 'beta' });
    const result = runChannelValidator(file);
    assert.equal(result.status, 1, output(result));
    assert.match(output(result), /channel/);
  });
});

test('channel must agree between path and content', async () => {
  const { previewEntry } = await makeFixtureData();
  withTempDir((dir) => {
    // Content says "preview" but the file is named stable.json.
    const file = writeManifest(dir, 'stable', [previewEntry], { channel: 'preview' });
    const result = runChannelValidator(file);
    assert.equal(result.status, 1, output(result));
    assert.match(output(result), /channel mismatch/);
  });
});

test('artifact manifest precedence: provider.v1.json wins over legacy provider.json', async () => {
  const lib = await import('../scripts/lib/provider-channels.mjs');
  withTempDir((dir) => {
    // The daemon runtime (locateArtifactDir) and the registry publish
    // workflow both prefer provider.v1.json; the channel tooling must agree,
    // or channels pin the stale legacy version (all acp/* froze at 1.0.0).
    fs.writeFileSync(path.join(dir, 'provider.json'), JSON.stringify({ type: 'x-cli', providerVersion: '1.0.0' }));
    fs.writeFileSync(path.join(dir, 'provider.v1.json'), JSON.stringify({ type: 'x-cli', providerVersion: '1.0.1' }));
    assert.equal(lib.readArtifactManifest(dir).providerVersion, '1.0.1');
    // provider.json remains the fallback when no v1 manifest exists.
    fs.rmSync(path.join(dir, 'provider.v1.json'));
    assert.equal(lib.readArtifactManifest(dir).providerVersion, '1.0.0');
  });
});
