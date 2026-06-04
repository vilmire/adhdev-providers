'use strict';
const path = require('path');
const DIR = __dirname;
const nativeHistory = require('../../../_shared/native_history.js');
function loadModule(name) { try { return require(path.join(DIR, name)); } catch { return null; } }
module.exports.createState = () => ({ highTrafficRetry: null });
module.exports.parseSession = (state, input) => { const m = loadModule('parse_session.js'); return m ? m(state, input) : null; };
module.exports.parseOutput = (state, input) => { const m = loadModule('parse_output.js'); return m ? m(state, input) : null; };
module.exports.detectStatus = (_state, input) => { const m = loadModule('detect_status.js'); return m ? m(input) : null; };
module.exports.parseApproval = (_state, input) => { const m = loadModule('parse_approval.js'); return m ? m(input) : null; };
module.exports.readNativeHistory = nativeHistory.readAntigravityNativeHistory;
module.exports.listNativeHistory = nativeHistory.listAntigravityNativeHistory;
