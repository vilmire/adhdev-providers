/**
 * Codex CLI Scripts — v1.0
 */
'use strict';
const path = require('path');
const DIR  = __dirname;
const nativeHistory = require('../../../_shared/native_history.js');
function loadModule(name) { try { return require(path.join(DIR, name)); } catch { return null; } }

module.exports.parseSession = (input) => { const m = loadModule('parse_session.js'); return m ? m(input) : null; };
module.exports.parseOutput   = (input) => { const m = loadModule('parse_output.js'); return m ? m(input) : null; };
module.exports.detectStatus  = (input) => { const m = loadModule('detect_status.js'); return m ? m(input) : null; };
module.exports.parseApproval = (input) => { const m = loadModule('parse_approval.js'); return m ? m(input) : null; };
module.exports.readNativeHistory = nativeHistory.readCodexNativeHistory;
module.exports.listNativeHistory = nativeHistory.listCodexNativeHistory;
module.exports.listModels = (input) => { const m = loadModule('list_models.js'); return m ? m(input) : null; };
module.exports.setFast = (input) => { const m = loadModule('set_fast.js'); return m ? m(input) : null; };
module.exports.openModelPicker = (input) => { const m = loadModule('open_model_picker.js'); return m ? m(input) : null; };
