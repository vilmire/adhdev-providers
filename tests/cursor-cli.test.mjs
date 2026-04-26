import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const cursorDir = path.resolve(import.meta.dirname, '../cli/cursor-cli')
const provider = JSON.parse(fs.readFileSync(path.join(cursorDir, 'provider.json'), 'utf8'))
const scripts = require(path.join(cursorDir, 'scripts/1.0/scripts.js'))

test('cursor-cli provider launches via `cursor agent` and uses a non-interactive version command', () => {
  assert.equal(provider.binary, 'cursor')
  assert.equal(provider.spawn?.command, 'cursor')
  assert.deepEqual(provider.spawn?.args, ['agent'])
  assert.equal(provider.versionCommand, 'cursor agent --version')
})

test('cursor-cli provider uses Hermes-style echo submit and settle debounce', () => {
  assert.equal(provider.submitStrategy, 'wait_for_echo')
  assert.deepEqual(provider.timeouts, {
    idleFinishConfirm: 5000,
    statusActivityHold: 5000,
  })
})

test('cursor-cli provider exposes resume metadata compatible with UUID chat ids', () => {
  assert.equal(provider.resume?.supported, true)
  assert.equal(provider.resume?.sessionIdFormat, 'uuid')
  assert.deepEqual(provider.resume?.resumeSessionArgs, ['--resume', '{{id}}'])
  assert.deepEqual(provider.resume?.resumeArgs, ['--continue'])
  assert.equal(provider.resume?.stopStrategy, 'ctrl_c')
})

test('cursor-cli provider exposes a model control and the matching scripts', () => {
  const modelControl = Array.isArray(provider.controls)
    ? provider.controls.find((control) => control?.id === 'model')
    : null

  assert.ok(modelControl, 'expected a model control')
  assert.equal(provider.capabilities?.controls?.typedResults, true)
  assert.equal(modelControl.type, 'select')
  assert.equal(modelControl.listScript, 'listModels')
  assert.equal(modelControl.setScript, 'setModel')
  assert.equal(typeof scripts.listModels, 'function')
  assert.equal(typeof scripts.setModel, 'function')
})

test('listModels returns Cursor model options and infers the current model from about output', () => {
  const result = scripts.listModels({
    recentBuffer: `About Cursor CLI\n\nCLI Version         2026.04.17-787b533\nModel               Composer 2 Fast\nSubscription Tier   Pro\n`,
  })

  assert.equal(result.currentValue, 'composer-2-fast')
  assert.ok(Array.isArray(result.options))
  assert.ok(result.options.some((option) => option.value === 'auto'))
  assert.ok(result.options.some((option) => option.value === 'composer-2-fast'))
  assert.ok(result.options.some((option) => option.value === 'gpt-5.4-medium'))
})

test('setModel emits an interactive /model command and updates controlValues', () => {
  const result = scripts.setModel({ args: { value: 'composer-2-fast' } })

  assert.deepEqual(result, {
    ok: true,
    currentValue: 'composer-2-fast',
    controlValues: {
      model: 'composer-2-fast',
    },
    command: {
      type: 'pty_write',
      text: '/model composer-2-fast',
    },
  })
})
