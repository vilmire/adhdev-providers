#!/usr/bin/env node
/**
 * Provider JSON Schema validator — category-generic core.
 *
 * Validates every provider.v1.json under {category}/ against
 * schemas/v1/{category}/provider.schema.json. The per-category entrypoints
 * (validate-cli-schema.mjs, validate-acp-schema.mjs) delegate here so the
 * validation logic exists exactly once.
 *
 * Exit code 0 on success, 1 on any validation failure, 2 on setup failure.
 *
 * Usage:
 *   node scripts/validate-provider-schema.mjs cli               # all CLI providers
 *   node scripts/validate-provider-schema.mjs acp gemini        # single provider by directory name
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// Per-category config. `anchors` are providers that must be present on a full
// run — without this, a directory rename/deletion leaves the validator
// reporting "passed" over whatever remains (vacuous green). For cli these are
// the production tier; for acp (all declarative-only, no production tier)
// they are long-standing providers that should never silently vanish.
const CATEGORIES = {
  cli: {
    root: 'cli',
    schema: 'schemas/v1/cli/provider.schema.json',
    anchors: new Set(['codex-cli', 'claude-cli', 'hermes-cli', 'antigravity-cli']),
    anchorLabel: 'production',
    otherLabel: 'experimental',
  },
  acp: {
    root: 'acp',
    schema: 'schemas/v1/acp/provider.schema.json',
    anchors: new Set(['claude-agent', 'gemini-cli', 'goose']),
    anchorLabel: 'anchor',
    otherLabel: 'acp',
  },
};

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

function listProviders(rootDir) {
  return readdirSync(rootDir)
    .filter((name) => name !== '_shared')
    .map((name) => ({
      name,
      dir: join(rootDir, name),
      manifest: existsSync(join(rootDir, name, 'provider.v1.json'))
        ? join(rootDir, name, 'provider.v1.json')
        : join(rootDir, name, 'provider.json'),
    }))
    .filter((entry) => statSync(entry.dir).isDirectory());
}

function validateOne(validate, entry) {
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

/**
 * Run validation for one category. `requested` narrows to specific provider
 * directory names; empty means the full set (with anchor-presence asserted).
 * Returns the process exit code.
 */
export function runValidation(category, requested = []) {
  const config = CATEGORIES[category];
  if (!config) {
    console.error(`Unknown category "${category}". Known: ${Object.keys(CATEGORIES).join(', ')}`);
    return 2;
  }

  const ajvModule = resolveDep('ajv/dist/2020.js');
  if (!ajvModule) {
    console.error('ERROR: could not resolve ajv from this repo or any parent node_modules.');
    console.error('Run `npm install` in the monorepo root (or in oss/) first.');
    return 2;
  }
  const Ajv2020 = ajvModule.default ?? ajvModule;
  const addFormatsModule = resolveDep('ajv-formats'); // optional
  const addFormats = addFormatsModule ? (addFormatsModule.default ?? addFormatsModule) : null;

  const schema = JSON.parse(readFileSync(resolve(REPO_ROOT, config.schema), 'utf-8'));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  if (addFormats) addFormats(ajv);
  const validate = ajv.compile(schema);

  const providers = listProviders(resolve(REPO_ROOT, config.root));
  const targets = requested.length
    ? providers.filter((p) => requested.includes(p.name))
    : providers;

  if (targets.length === 0) {
    console.error('No providers matched.');
    return 1;
  }

  // A full run must cover every anchor provider. Without this, an anchor that
  // disappears from the category dir (moved, renamed, accidentally deleted)
  // leaves the validator reporting "passed" over whatever remains — the same
  // vacuous-green shape as validating an empty set, just one level up. Only
  // asserted on a full run; an explicit single-provider invocation is a
  // deliberate subset.
  if (!requested.length) {
    const missingAnchors = [...config.anchors].filter(
      (name) => !targets.some((t) => t.name === name),
    );
    if (missingAnchors.length) {
      console.error(`ERROR: ${config.anchorLabel} provider(s) absent from ${config.root}/: ${missingAnchors.join(', ')}`);
      console.error(`A${config.anchorLabel === 'production' ? ' production' : 'n anchor'} provider must never silently drop out of validation.`);
      return 1;
    }
  }

  let failed = 0;
  const anchorFailed = [];
  for (const entry of targets) {
    const result = validateOne(validate, entry);
    const tier = config.anchors.has(entry.name) ? `[${config.anchorLabel}]` : `[${config.otherLabel}]`;
    if (result.ok) {
      console.log(`✓ ${tier.padEnd(15)} ${entry.name}`);
    } else {
      failed += 1;
      if (config.anchors.has(entry.name)) anchorFailed.push(entry.name);
      console.log(`✗ ${tier.padEnd(15)} ${entry.name}`);
      if (result.errors) for (const err of result.errors) console.log(err);
      if (result.error) console.log(`  ${result.error}`);
    }
  }

  console.log('');
  console.log(`Total: ${targets.length} — passed: ${targets.length - failed} — failed: ${failed}`);
  return failed > 0 ? 1 : 0;
}

// Direct invocation: node scripts/validate-provider-schema.mjs <category> [provider...]
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const [category, ...requested] = process.argv.slice(2);
  if (!category) {
    console.error('Usage: node scripts/validate-provider-schema.mjs <cli|acp> [provider...]');
    process.exit(2);
  }
  process.exit(runValidation(category, requested));
}
