#!/usr/bin/env node
/**
 * CLI provider JSON Schema validator.
 *
 * Validates every provider.v1.json under cli/ against
 * schemas/v1/cli/provider.schema.json.
 *
 * Exit code 0 on success, 1 on any validation failure.
 *
 * Usage:
 *   node scripts/validate-cli-schema.mjs              # all CLI providers
 *   node scripts/validate-cli-schema.mjs claude-cli   # single provider by directory name
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const require = createRequire(import.meta.url);

// Load ajv from oss/ workspace where it already exists.
let Ajv2020;
let addFormats;
try {
  Ajv2020 = require(resolve(REPO_ROOT, '../oss/node_modules/ajv/dist/2020.js')).default;
} catch (e) {
  console.error('ERROR: could not locate ajv at ../oss/node_modules. Run `cd oss && npm install` first.');
  console.error(e.message);
  process.exit(2);
}
try {
  addFormats = require(resolve(REPO_ROOT, '../oss/node_modules/ajv-formats')).default;
} catch {
  addFormats = null; // optional
}

const SCHEMA_PATH = resolve(REPO_ROOT, 'schemas/v1/cli/provider.schema.json');
const CLI_ROOT = resolve(REPO_ROOT, 'cli');

const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
if (addFormats) addFormats(ajv);
const validate = ajv.compile(schema);

const PRODUCTION_PROVIDERS = new Set(['codex-cli', 'claude-cli', 'hermes-cli', 'antigravity-cli']);

function listProviders() {
  return readdirSync(CLI_ROOT)
    .filter((name) => name !== '_shared')
    .map((name) => ({
      name,
      dir: join(CLI_ROOT, name),
      manifest: existsSync(join(CLI_ROOT, name, 'provider.v1.json'))
        ? join(CLI_ROOT, name, 'provider.v1.json')
        : join(CLI_ROOT, name, 'provider.json'),
    }))
    .filter((entry) => statSync(entry.dir).isDirectory());
}

function validateOne(entry) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(entry.manifest, 'utf-8'));
  } catch (e) {
    return { ok: false, error: `JSON parse: ${e.message}` };
  }
  const ok = validate(raw);
  return ok
    ? { ok: true }
    : {
        ok: false,
        errors: validate.errors.map((e) => `  ${e.instancePath || '/'}: ${e.message}`),
      };
}

const requested = process.argv.slice(2);
const providers = listProviders();
const targets = requested.length
  ? providers.filter((p) => requested.includes(p.name))
  : providers;

if (targets.length === 0) {
  console.error('No providers matched.');
  process.exit(1);
}

let failed = 0;
const productionFailed = [];
for (const entry of targets) {
  const result = validateOne(entry);
  const tier = PRODUCTION_PROVIDERS.has(entry.name) ? '[production]' : '[experimental]';
  if (result.ok) {
    console.log(`✓ ${tier.padEnd(15)} ${entry.name}`);
  } else {
    failed += 1;
    if (PRODUCTION_PROVIDERS.has(entry.name)) productionFailed.push(entry.name);
    console.log(`✗ ${tier.padEnd(15)} ${entry.name}`);
    if (result.errors) for (const err of result.errors) console.log(err);
    if (result.error) console.log(`  ${result.error}`);
  }
}

console.log('');
console.log(`Total: ${targets.length} — passed: ${targets.length - failed} — failed: ${failed}`);
if (productionFailed.length) {
  console.error('');
  console.error(`Production providers failed: ${productionFailed.join(', ')}`);
  console.error('Production providers must pass v1 schema. Fix manifest or update schema.');
}

process.exit(failed === 0 ? 0 : 1);
