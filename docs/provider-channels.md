# Provider artifact channels (Stage 1 — schema/data only)

This repo is the single source of truth for provider artifacts. Release
channels (`stable`, `preview`) are **data namespaces** inside this repo —
`channels/<channel>.json` manifests — not branches and not separate repos.

Stage 1 delivers only the versioned manifest schema, the canonical digest
semantics, the validator, and the initial manifests. There is **no runtime
loading or activation** yet; daemon lifecycle, the turn reducer, and
status/dashboard surfaces are untouched.

## Files

- `schemas/v1/channels/channel-manifest.schema.json` — JSON Schema (draft 2020-12) for channel manifests.
- `channels/stable.json`, `channels/preview.json` — generated manifests; immutable once published.
- `scripts/lib/provider-channels.mjs` — shared digest/validation core.
- `scripts/validate-channels.mjs` — validator CLI (also runs as part of `node validate.js`).
- `scripts/generate-channels.mjs` — regenerates the manifests from the provider artifacts.
- `tests/channel-manifests.test.js` — scoped fixtures/tests.

## Manifest model

Each entry carries `providerType`, `providerVersion`, `category`, the
canonical `bundleDigest` (`sha256:<64 lowercase hex>`), a typed
`digestAlgorithm`, optional `compatibility` bounds (`contractVersion`,
`ideVersion` SemVer ranges declared by the artifact), `publishedAt`, and
optional `promotedFrom` provenance.

Validation fails closed on:

- unknown `schemaVersion` or `channel` (anything other than `stable`/`preview`);
- channel not explicit in **both** path and content (`channels/stable.json`
  must declare `"channel": "stable"`; ambiguity never defaults to preview);
- malformed or non-sha256 `bundleDigest`;
- duplicate `providerType`+`providerVersion` within a channel, whether the
  duplicate is identical or conflicting (different digest);
- invalid `compatibility.ideVersion` SemVer ranges;
- `promotedFrom` records whose source digest differs from the entry digest,
  or whose source channel equals the destination channel;
- entries whose digest cannot be recomputed from the tracked artifact tree,
  or whose metadata disagrees with the artifact manifest.

## Canonical digest semantics — `adhdev-provider-tree-sha256-v1`

The packaging primitive that will eventually produce canonical provider
bundles does not exist yet. Stage 1 therefore defines an interim, fully
deterministic digest over the provider artifact directory **as tracked by
git** (`git ls-files`):

```
for each tracked file under <category>/<dir>, sorted byte-wise by relative POSIX path:
    hash.update(relative path UTF-8 bytes); hash.update(NUL)
    hash.update(decimal byte length);       hash.update(NUL)
    hash.update(raw file bytes)
bundleDigest = "sha256:" + lowercase hex(sha256)
```

Because only git-tracked files are hashed and this repo declares no text/eol
conversion attributes, the same canonical tree yields exactly one digest
across machines; untracked or ignored files can never perturb it. The
validator **recomputes** the digest and rejects mismatches — digests are
verified, never trusted from the manifest alone, and never fabricated.

### Migration path (typed placeholder, fails closed)

`digestAlgorithm` names the construction explicitly. A later packaging stage
will introduce a canonical-bundle algorithm (e.g.
`adhdev-canonical-bundle-sha256-v1`). The schema enumerates allowed
algorithms, so unknown algorithms are rejected: existing manifests keep
validating against the algorithm they were written with, and migration to
the bundle algorithm is an explicit schema/version step, not a silent
reinterpretation.

## Initial channel contents

`node scripts/generate-channels.mjs` builds both manifests from the provider
artifacts (directories with a `provider.json`/`provider.v1.json`). When both
exist, **`provider.v1.json` wins** — the same v1-first precedence the daemon
runtime (`locateArtifactDir`) and the registry publish workflow use; a
v0-first read pins the channel to the stale legacy version. Source of
truth for `providerType`/`providerVersion`/`category`/`compatibility` is the
artifact manifest itself — note this can be newer than the summary in
`registry.json` (e.g. `claude-cli`). Registry entries without an artifact
directory (e.g. `aider-cli`, `gemini-cli` CLI) are excluded because they
cannot carry a verifiable digest.

- `preview` holds every verified artifact.
- `stable` is the current known baseline: the same verified entries, each
  recorded as `promotedFrom: { channel: "preview", bundleDigest: <identical> }`.

## Constraints encoded for later stages (not implemented here)

- Channel manifests are **immutable**; corrections ship as a new manifest.
- Promotion preview→stable **copies the identical `bundleDigest`** and never
  rebuilds.
- Stable activation will **fail closed to last-known-good**.
- Bundle cache/activation will be **content-addressed and atomic**.
- Runtime channel and config-dir isolation belongs to Stage 2.

## Commands

```sh
node scripts/generate-channels.mjs     # regenerate manifests from artifacts
node scripts/validate-channels.mjs     # validate channels/*.json
node validate.js                       # full provider scan incl. channels
node --test tests/channel-manifests.test.js
```
