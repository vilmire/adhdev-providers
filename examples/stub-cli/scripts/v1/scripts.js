'use strict';

/**
 * stub-cli scripts/v1/scripts.js — script entry for the worked example.
 * Contract: docs/provider-contract/cli/v1.md §4 (idiomatic structure).
 *
 * The daemon probes exactly this filename (scripts.js) inside the resolved
 * scriptDir. Only parseSession is exported: detectStatus and parseApproval
 * are synthesized by the daemon from the declarative tui block in
 * provider.json, and a script export would override that synthesis (script
 * always wins). parseSession cannot be synthesized without a
 * tui.transcriptPty block, which is why this file ships a real one.
 *
 * The sibling-file split (loadModule idiom) keeps handlers individually
 * testable and mirrors what production providers (e.g. hermes-cli) do.
 */

var path = require('path');
var DIR = __dirname;

function loadModule(name) {
  try { return require(path.join(DIR, name)); }
  catch { return null; }
}

var parseSession = loadModule('./parse_session.js');

module.exports.parseSession = function (state, input) {
  return parseSession ? parseSession(state, input) : null;
};
