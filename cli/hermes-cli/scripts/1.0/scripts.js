/**
 * Hermes CLI Scripts — v1.0 (MVP)
 *
 * NOTE: Hermes uses a TUI. These parsers are intentionally conservative until
 * we capture real screen/buffer samples from a configured Hermes session.
 */
'use strict';

const path = require('path');
const DIR = __dirname;

function loadModule(name) {
  try { return require(path.join(DIR, name)); } catch { return null; }
}

module.exports.parseOutput   = (input) => { const m = loadModule('parse_output.js'); return m ? m(input) : null; };
module.exports.detectStatus  = (input) => { const m = loadModule('detect_status.js'); return m ? m(input) : null; };
module.exports.parseApproval = (input) => { const m = loadModule('parse_approval.js'); return m ? m(input) : null; };
