/**
 * Provider channel manifest core (Stage 1 — schema/data only, no runtime activation).
 *
 * Canonical digest semantics — 'adhdev-provider-tree-sha256-v1'
 * -----------------------------------------------------------
 * Stage 1 predates the canonical bundle packaging primitive, so the digest is
 * computed over the provider artifact directory as tracked by git:
 *
 *   input = for each file in `git ls-files -z -- <category>/<dir>` sorted by
 *           byte-wise path order:
 *             relative POSIX path (UTF-8) + NUL
 *             decimal byte length of file content + NUL
 *             raw file content bytes
 *   bundleDigest = "sha256:" + lowercase hex sha256(input)
 *
 * Properties:
 *   - Deterministic across machines: only git-tracked files are hashed, and
 *     this repo declares no text/eol attributes, so checkout bytes are
 *     canonical. Untracked or ignored files can never change the digest.
 *   - Fails closed: any tracked symlink or unreadable file aborts hashing.
 *   - Typed for migration: the `digestAlgorithm` manifest field names this
 *     algorithm explicitly. A later packaging stage will add a
 *     canonical-bundle algorithm; validators reject unknown algorithms, so
 *     old manifests keep validating against the algorithm they were written
 *     with instead of being silently reinterpreted.
 *
 * Channel model (encoded for future stages, not implemented here):
 *   - Channels (stable/preview) are data namespaces in this repo, not branches.
 *   - Manifests are immutable; promotion preview→stable copies the identical
 *     bundleDigest and never rebuilds.
 *   - Stable activation will fail closed to last-known-good; bundle cache and
 *     activation will be content-addressed and atomic (Stage 2+, with runtime
 *     channel and config-dir isolation).
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, '..', '..');

export const DIGEST_ALGORITHM = 'adhdev-provider-tree-sha256-v1';
export const CHANNELS = ['stable', 'preview'];
export const CATEGORIES = ['ide', 'extension', 'cli', 'acp'];

const SCHEMA_PATH = resolve(REPO_ROOT, 'schemas/v1/channels/channel-manifest.schema.json');

const require = createRequire(import.meta.url);

/**
 * Load a dependency from the surrounding workspace, following the convention
 * of scripts/validate-cli-schema.mjs (sibling oss/ checkout first), with the
 * monorepo root node_modules as fallback. Returns null when unavailable.
 */
function loadWorkspaceModule(relPath) {
  for (const base of [resolve(REPO_ROOT, '..', 'oss', 'node_modules'), resolve(REPO_ROOT, '..', 'node_modules')]) {
    try {
      return require(resolve(base, relPath));
    } catch {
      // try next base
    }
  }
  return null;
}

export function loadAjv() {
  const mod = loadWorkspaceModule('ajv/dist/2020.js');
  return mod ? mod.default : null;
}

export function loadAjvFormats() {
  const mod = loadWorkspaceModule('ajv-formats');
  return mod ? (mod.default || mod) : null;
}

export function loadSemver() {
  return loadWorkspaceModule('semver');
}

/** Compute the canonical tree digest for a provider directory relative to REPO_ROOT. */
export function computeProviderTreeDigest(relDir) {
  let listing;
  try {
    listing = execFileSync('git', ['ls-files', '-z', '--', relDir], { cwd: REPO_ROOT, encoding: 'buffer' });
  } catch (error) {
    throw new Error(`git ls-files failed for '${relDir}': ${error.message}`);
  }
  const paths = listing.toString('utf8').split('\0').filter(Boolean).sort();
  if (paths.length === 0) {
    throw new Error(`no git-tracked files under '${relDir}'`);
  }
  const hash = createHash('sha256');
  for (const relPath of paths) {
    const abs = join(REPO_ROOT, relPath);
    const stat = statSync(abs);
    if (!stat.isFile()) {
      throw new Error(`non-regular tracked file '${relPath}' (symlinks/special files are not supported)`);
    }
    const bytes = readFileSync(abs);
    hash.update(relPath, 'utf8');
    hash.update('\0');
    hash.update(String(bytes.length), 'utf8');
    hash.update('\0');
    hash.update(bytes);
  }
  return `sha256:${hash.digest('hex')}`;
}

/**
 * Read the artifact manifest in a provider directory. The v1 manifest wins
 * when both exist: it is the current contract and the same precedence the
 * daemon runtime (locateArtifactDir) and the registry publish workflow use.
 * Reading provider.json first silently pins the channel to the stale legacy
 * version (this froze every acp/* provider at 1.0.0 while their v1 manifests
 * had moved on).
 */
export function readArtifactManifest(dir) {
  for (const name of ['provider.v1.json', 'provider.json']) {
    const file = join(dir, name);
    if (!existsSync(file)) continue;
    try {
      return JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Index all provider artifacts in the repo: providerType → metadata.
 * Only directories with a readable provider manifest and a `type` field are
 * artifacts; entries without one cannot carry a verifiable digest and are
 * therefore excluded from channels (fail closed).
 */
export function indexProviderArtifacts() {
  const index = new Map();
  for (const category of CATEGORIES) {
    const categoryDir = join(REPO_ROOT, category);
    if (!existsSync(categoryDir)) continue;
    for (const entry of readdirSync(categoryDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
      const relDir = `${category}/${entry.name}`;
      const manifest = readArtifactManifest(join(categoryDir, entry.name));
      if (!manifest || typeof manifest.type !== 'string') continue;
      const ideVersion = Array.isArray(manifest.compatibility)
        ? [...new Set(manifest.compatibility
            .map((c) => (c && typeof c.ideVersion === 'string' ? c.ideVersion.trim() : ''))
            .filter(Boolean))].sort()
        : undefined;
      index.set(manifest.type, {
        providerType: manifest.type,
        providerVersion: typeof manifest.providerVersion === 'string' ? manifest.providerVersion : undefined,
        category: manifest.category,
        name: typeof manifest.name === 'string' ? manifest.name : undefined,
        contractVersion: typeof manifest.contractVersion === 'number' ? manifest.contractVersion : undefined,
        ideVersion: ideVersion && ideVersion.length ? ideVersion : undefined,
        relDir,
      });
    }
  }
  return index;
}

function isValidDateTime(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

/**
 * Validate one channel manifest file. Returns an array of error strings
 * (empty = valid). `filePath` may live outside the repo (test fixtures); the
 * filename must still be `<channel>.json` so the channel is explicit in both
 * path and content.
 */
export function validateChannelManifest(filePath) {
  const errors = [];
  const fail = (msg) => errors.push(msg);

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    return [`JSON parse error: ${error.message}`];
  }

  // --- JSON Schema validation (fail closed on unknown schema version/channel).
  const Ajv2020 = loadAjv();
  if (!Ajv2020) return ['could not locate ajv (looked in ../oss/node_modules and ../node_modules)'];
  const addFormats = loadAjvFormats();
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  if (addFormats) addFormats(ajv);
  const schemaValidate = ajv.compile(JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')));
  if (!schemaValidate(manifest)) {
    for (const e of schemaValidate.errors) {
      fail(`schema: ${e.instancePath || '/'} ${e.message}`);
    }
    // Schema-level failures (unknown schemaVersion/channel, malformed digest)
    // make semantic checks unreliable; stop here.
    return errors;
  }

  // --- Channel must be explicit in BOTH path and content, and agree.
  const base = filePath.split(/[\\/]/).pop();
  const expectedBase = `${manifest.channel}.json`;
  if (base !== expectedBase) {
    fail(`channel mismatch: manifest channel '${manifest.channel}' must match filename '${expectedBase}' (got '${base}')`);
  }

  if (!isValidDateTime(manifest.publishedAt)) {
    fail(`invalid publishedAt '${manifest.publishedAt}' (expected ISO 8601 date-time)`);
  }

  const semver = loadSemver();
  if (!semver) return [...errors, 'could not locate semver (looked in ../oss/node_modules and ../node_modules)'];

  let artifacts;
  try {
    artifacts = indexProviderArtifacts();
  } catch (error) {
    return [...errors, `artifact index failed: ${error.message}`];
  }

  const seen = new Map(); // key -> bundleDigest
  for (const [i, entry] of manifest.providers.entries()) {
    const at = `providers[${i}] (${entry.providerType || '?'}@${entry.providerVersion || '?'})`;

    // Duplicate providerType+providerVersion within a channel. Identical
    // re-declaration and conflicting re-declaration are both rejected; the
    // message distinguishes them.
    const key = `${entry.providerType}@${entry.providerVersion}`;
    if (seen.has(key)) {
      const prev = seen.get(key);
      fail(prev === entry.bundleDigest
        ? `duplicate entry '${key}' in channel '${manifest.channel}'`
        : `conflicting duplicate entry '${key}' in channel '${manifest.channel}' (bundleDigest ${prev} vs ${entry.bundleDigest})`);
      continue;
    }
    seen.set(key, entry.bundleDigest);

    if (!isValidDateTime(entry.publishedAt)) {
      fail(`${at}: invalid publishedAt '${entry.publishedAt}'`);
    }

    // Compatibility bounds must be parseable.
    if (entry.compatibility && Array.isArray(entry.compatibility.ideVersion)) {
      for (const range of entry.compatibility.ideVersion) {
        if (semver.validRange(range) === null) {
          fail(`${at}: invalid compatibility.ideVersion range '${range}'`);
        }
      }
    }

    // Promotion provenance: copies the identical digest, never rebuilds.
    if (entry.promotedFrom) {
      if (entry.promotedFrom.channel === manifest.channel) {
        fail(`${at}: promotedFrom source channel '${entry.promotedFrom.channel}' must differ from manifest channel '${manifest.channel}'`);
      }
      if (entry.promotedFrom.bundleDigest !== entry.bundleDigest) {
        fail(`${at}: promotedFrom digest mismatch — source ${entry.promotedFrom.bundleDigest} differs from entry ${entry.bundleDigest} (promotion copies the identical bundleDigest)`);
      }
      if (entry.promotedFrom.promotedAt !== undefined && !isValidDateTime(entry.promotedFrom.promotedAt)) {
        fail(`${at}: invalid promotedFrom.promotedAt '${entry.promotedFrom.promotedAt}'`);
      }
    }

    // The entry must correspond to a real artifact whose manifest agrees.
    const artifact = artifacts.get(entry.providerType);
    if (!artifact) {
      fail(`${at}: unknown providerType '${entry.providerType}' (no artifact directory declares this type)`);
      continue;
    }
    if (artifact.category !== entry.category) {
      fail(`${at}: category '${entry.category}' does not match artifact category '${artifact.category}'`);
    }
    if (artifact.providerVersion !== entry.providerVersion) {
      fail(`${at}: providerVersion '${entry.providerVersion}' does not match artifact manifest '${artifact.providerVersion}'`);
    }

    // Recompute the canonical digest and compare — digests are verified,
    // never trusted from the manifest alone.
    if (entry.digestAlgorithm !== DIGEST_ALGORITHM) {
      fail(`${at}: unsupported digestAlgorithm '${entry.digestAlgorithm}'`);
      continue;
    }
    let computed;
    try {
      computed = computeProviderTreeDigest(artifact.relDir);
    } catch (error) {
      fail(`${at}: digest computation failed — ${error.message}`);
      continue;
    }
    if (computed !== entry.bundleDigest) {
      fail(`${at}: bundleDigest mismatch — manifest ${entry.bundleDigest} != computed ${computed}`);
    }
  }

  return errors;
}

/** Build a channel entry from artifact metadata (used by the generator and tests). */
export function buildChannelEntry(artifact, { publishedAt, promotedFrom } = {}) {
  const entry = {
    providerType: artifact.providerType,
    providerVersion: artifact.providerVersion,
    category: artifact.category,
    bundleDigest: computeProviderTreeDigest(artifact.relDir),
    digestAlgorithm: DIGEST_ALGORITHM,
    publishedAt,
  };
  if (artifact.name) entry.name = artifact.name;
  const compatibility = {};
  if (artifact.contractVersion !== undefined) compatibility.contractVersion = artifact.contractVersion;
  if (artifact.ideVersion !== undefined) compatibility.ideVersion = artifact.ideVersion;
  if (Object.keys(compatibility).length) entry.compatibility = compatibility;
  if (promotedFrom) entry.promotedFrom = promotedFrom;
  return entry;
}
