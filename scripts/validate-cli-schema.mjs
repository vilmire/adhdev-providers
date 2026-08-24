#!/usr/bin/env node
/**
 * CLI provider JSON Schema validator — thin entrypoint.
 *
 * Validates every provider.v1.json under cli/ against
 * schemas/v1/cli/provider.schema.json. The actual logic lives in
 * validate-provider-schema.mjs (category-generic) so cli and acp validation
 * cannot drift apart; this wrapper preserves the historical CLI contract
 * (invoked by .github/workflows/validate-cli.yml).
 *
 * Exit code 0 on success, 1 on any validation failure.
 *
 * Usage:
 *   node scripts/validate-cli-schema.mjs              # all CLI providers
 *   node scripts/validate-cli-schema.mjs claude-cli   # single provider by directory name
 */
import { runValidation } from './validate-provider-schema.mjs';

process.exit(runValidation('cli', process.argv.slice(2)));
