'use strict';
const path = require('path');
const DIR  = __dirname;
function loadModule(name) { try { return require(path.join(DIR, name)); } catch { return null; } }
module.exports.parseSession = (input) => { const m = loadModule('parse_session.js'); return m ? m(input) : null; };
module.exports.parseOutput   = (input) => { const m = loadModule('parse_output.js'); return m ? m(input) : null; };
module.exports.detectStatus  = (input) => { const m = loadModule('detect_status.js'); return m ? m(input) : null; };
module.exports.parseApproval = (input) => { const m = loadModule('parse_approval.js'); return m ? m(input) : null; };
