/**
 * Gemini CLI Scripts — v1.0
 */
'use strict';
const path = require('path');
const DIR  = __dirname;
function loadModule(name) { try { return require(path.join(DIR, name)); } catch { return null; } }

module.exports.createState = () => ({ lastGeneratingAt: 0, lastApprovalText: '' });

module.exports.parseSession = (state, input) => { const m = loadModule('parse_session.js'); return m ? m(state, input) : null; };
module.exports.parseOutput   = (state, input) => { const m = loadModule('parse_output.js'); return m ? m(state, input) : null; };
module.exports.detectStatus  = (state, input) => { const m = loadModule('detect_status.js'); return m ? m(state, input) : null; };
module.exports.parseApproval = (state, input) => { const m = loadModule('parse_approval.js'); return m ? m(state, input) : null; };
