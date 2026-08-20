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
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// Resolve ajv through normal Node resolution rather than a hardcoded path.
// This repo is a submodule with no node_modules of its own, so ajv comes from
// whichever ancestor installed it — the monorepo root (npm hoists it there) or
// oss/. Probing several base paths keeps the script working from a worktree,
// the root checkout, and CI alike.
const RESOLVE_BASES = [
  import.meta.url,
  ...['..', '../oss', '../..'].map((rel) => pathToFileURL(join(REPO_ROOT, rel, 'noop.js')).href),
];

function resolveDep(specifier) {
  for (const base of RESOLVE_BASES) {
    try {
      return createRequire(base)(specifier);
    } catch {
      // try the next base
    }
  }
  return null;
}

const ajvModule = resolveDep('ajv/dist/2020.js');
if (!ajvModule) {
  console.error('ERROR: could not resolve ajv from this repo or any parent node_modules.');
  console.error('Run `npm install` in the monorepo root (or in oss/) first.');
  process.exit(2);
}
const Ajv2020 = ajvModule.default ?? ajvModule;

const addFormatsModule = resolveDep('ajv-formats'); // optional
const addFormats = addFormatsModule ? (addFormatsModule.default ?? addFormatsModule) : null;

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
