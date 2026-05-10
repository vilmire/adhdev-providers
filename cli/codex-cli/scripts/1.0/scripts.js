/**
 * Codex CLI Scripts — v1.0
 */
'use strict';
const path = require('path');
const DIR  = __dirname;
const nativeHistory = require('../../../_shared/native_history.js');
function loadModule(name) { try { return require(path.join(DIR, name)); } catch { return null; } }

module.exports.createState = () => ({ lastGeneratingAt: 0, lastApprovalText: '' });

module.exports.parseSession = (state, input) => { const m = loadModule('parse_session.js'); return m ? m(state, input) : null; };
module.exports.parseOutput   = (state, input) => { const m = loadModule('parse_output.js'); return m ? m(state, input) : null; };
module.exports.detectStatus  = (state, input) => { const m = loadModule('detect_status.js'); return m ? m(state, input) : null; };
module.exports.parseApproval = (state, input) => { const m = loadModule('parse_approval.js'); return m ? m(state, input) : null; };
module.exports.readNativeHistory = nativeHistory.readCodexNativeHistory;
module.exports.listNativeHistory = nativeHistory.listCodexNativeHistory;
module.exports.listModels = (state, input) => { const m = loadModule('list_models.js'); return m ? m(state, input) : null; };
module.exports.setFast = (state, input) => { const m = loadModule('set_fast.js'); return m ? m(state, input) : null; };
module.exports.openModelPicker = (state, input) => { const m = loadModule('open_model_picker.js'); return m ? m(state, input) : null; };
