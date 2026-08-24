#!/usr/bin/env node
/**
 * ACP provider JSON Schema validator — thin entrypoint.
 *
 * Validates every provider.v1.json under acp/ against
 * schemas/v1/acp/provider.schema.json. The actual logic lives in
 * validate-provider-schema.mjs (category-generic) so cli and acp validation
 * cannot drift apart. Invoked by .github/workflows/validate-acp.yml.
 *
 * Exit code 0 on success, 1 on any validation failure.
 *
 * Usage:
 *   node scripts/validate-acp-schema.mjs              # all ACP providers
 *   node scripts/validate-acp-schema.mjs gemini       # single provider by directory name
 */
import { runValidation } from './validate-provider-schema.mjs';

process.exit(runValidation('acp', process.argv.slice(2)));
