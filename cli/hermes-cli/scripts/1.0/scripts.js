'use strict';
const path = require('path');
const DIR = __dirname;
const nativeHistory = require('../../../_shared/native_history.js');

function loadModule(name) {
  try {
    return require(path.join(DIR, name));
  } catch {
    return null;
  }
}

module.exports.createState = () => ({ lastGeneratingAt: 0, lastApprovalText: '' });

module.exports.parseSession = (state, input) => { const m = loadModule('parse_session.js'); return m ? m(state, input) : null; };
module.exports.parseOutput = (state, input) => {
  const mod = loadModule('parse_output.js');
  return mod ? mod(state, input) : null;
};
module.exports.detectStatus = (state, input) => {
  const mod = loadModule('detect_status.js');
  return mod ? mod(state, input) : null;
};
module.exports.parseApproval = (state, input) => {
  const mod = loadModule('parse_approval.js');
  return mod ? mod(state, input) : null;
};

module.exports.readNativeHistory = nativeHistory.readHermesNativeHistory;
module.exports.listNativeHistory = nativeHistory.listHermesNativeHistory;

module.exports.setProvider = (state, input) => {
  const mod = loadModule('set_provider.js');
  return mod ? mod(state, input) : null;
};

module.exports.setReasoning = (state, input) => {
  const mod = loadModule('set_reasoning.js');
  return mod ? mod(state, input) : null;
};

module.exports.setYolo = (state, input) => {
  const mod = loadModule('set_yolo.js');
  return mod ? mod(state, input) : null;
};

module.exports.newSession = (state, input) => {
  const mod = loadModule('new_session.js');
  return mod ? mod(state, input) : null;
};

module.exports.retryLast = (state, input) => {
  const mod = loadModule('retry_last.js');
  return mod ? mod(state, input) : null;
};

module.exports.undoLast = (state, input) => {
  const mod = loadModule('undo_last.js');
  return mod ? mod(state, input) : null;
};

module.exports.showProviders = (state, input) => {
  const mod = loadModule('show_providers.js');
  return mod ? mod(state, input) : null;
};

module.exports.rollbackList = (state, input) => {
  const mod = loadModule('rollback_list.js');
  return mod ? mod(state, input) : null;
};

module.exports.setModel = (state, input) => {
  const mod = loadModule('set_model.js');
  return mod ? mod(state, input) : null;
};

module.exports.listModels = (state, input) => {
  const mod = loadModule('list_models.js');
  return mod ? mod(state, input) : null;
};

module.exports.runSlashCommand = (state, input) => {
  const mod = loadModule('run_slash_command.js');
  return mod ? mod(state, input) : null;
};
