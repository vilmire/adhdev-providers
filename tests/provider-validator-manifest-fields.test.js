const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function runValidator(...args) {
  return spawnSync(process.execPath, ['validate.js', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

test('validator accepts provider-owned transcript and mesh coordinator manifest fields', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adhdev-provider-validator-'));
  const providerPath = path.join(tempDir, 'provider.json');
  fs.writeFileSync(providerPath, JSON.stringify({
    type: 'manifest-fields-test-cli',
    name: 'Manifest Fields Test CLI',
    category: 'cli',
    providerVersion: '1.0.0',
    contractVersion: 2,
    transcriptAuthority: 'provider',
    transcriptContext: 'tail',
    spawn: { command: 'manifest-fields-test' },
    capabilities: {
      input: { multipart: false, mediaTypes: ['text'] },
      output: { richContent: false, mediaTypes: ['text'] },
      controls: { typedResults: false },
    },
    meshCoordinator: {
      supported: true,
      mcpConfig: {
        mode: 'manual',
        format: 'opencode_json',
        instructions: 'Configure the mesh MCP server manually.',
      },
    },
  }, null, 2));

  try {
    const result = runValidator(providerPath);
    const output = `${result.stdout || ''}${result.stderr || ''}`;

    assert.equal(result.status, 0, output);
    assert.doesNotMatch(output, /unknown provider field 'transcriptAuthority'/);
    assert.doesNotMatch(output, /unknown provider field 'transcriptContext'/);
    assert.doesNotMatch(output, /unknown provider field 'meshCoordinator'/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// minDaemonVersion — the auto-update daemon floor (adhdev daemon-core
// docs/design/2026-10-10-provider-auto-update.md). Optional; "x.y.z" only.
function writeManifest(fileName, extra) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adhdev-provider-validator-'));
  const providerPath = path.join(tempDir, fileName);
  fs.writeFileSync(providerPath, JSON.stringify({
    type: 'min-daemon-test-cli',
    name: 'Min Daemon Test CLI',
    category: 'cli',
    providerVersion: '1.0.0',
    contractVersion: 2,
    spawn: { command: 'min-daemon-test' },
    capabilities: {
      input: { multipart: false, mediaTypes: ['text'] },
      output: { richContent: false, mediaTypes: ['text'] },
      controls: { typedResults: false },
    },
    ...extra,
  }, null, 2));
  return { tempDir, providerPath };
}

for (const fileName of ['provider.json', 'provider.v1.json']) {
  test(`validator accepts a well-formed minDaemonVersion (${fileName})`, () => {
    const { tempDir, providerPath } = writeManifest(fileName, { minDaemonVersion: '1.0.81' });
    try {
      const result = runValidator(providerPath);
      const output = `${result.stdout || ''}${result.stderr || ''}`;
      assert.equal(result.status, 0, output);
      assert.doesNotMatch(output, /minDaemonVersion/);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test(`validator rejects a range or prerelease minDaemonVersion (${fileName})`, () => {
    for (const bad of ['>=1.0.81', '1.0.81-rc.1', 1]) {
      const { tempDir, providerPath } = writeManifest(fileName, { minDaemonVersion: bad });
      try {
        const result = runValidator(providerPath);
        const output = `${result.stdout || ''}${result.stderr || ''}`;
        assert.notEqual(result.status, 0, output);
        assert.match(output, /minDaemonVersion must be "x\.y\.z"/);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });
}
