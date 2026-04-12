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

module.exports.parseOutput      = (input) => { const m = loadModule('parse_output.js'); return m ? m(input) : null; };
module.exports.detectStatus     = (input) => { const m = loadModule('detect_status.js'); return m ? m(input) : null; };
module.exports.parseApproval    = (input) => { const m = loadModule('parse_approval.js'); return m ? m(input) : null; };
module.exports.listModels       = (input) => { const m = loadModule('list_models.js'); return m ? m(input) : null; };
module.exports.setModel         = (input) => { const m = loadModule('set_model.js'); return m ? m(input) : null; };
module.exports.newSession       = (input) => { const m = loadModule('new_session.js'); return m ? m(input) : null; };
module.exports.runSlashCommand  = (input) => { const m = loadModule('run_slash_command.js'); return m ? m(input) : null; };
