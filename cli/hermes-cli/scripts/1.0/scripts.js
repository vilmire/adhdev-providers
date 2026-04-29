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

module.exports.parseOutput = (input) => {
  const mod = loadModule('parse_output.js');
  return mod ? mod(input) : null;
};
module.exports.detectStatus = (input) => {
  const mod = loadModule('detect_status.js');
  return mod ? mod(input) : null;
};
module.exports.parseApproval = (input) => {
  const mod = loadModule('parse_approval.js');
  return mod ? mod(input) : null;
};

module.exports.readNativeHistory = nativeHistory.readHermesNativeHistory;
module.exports.listNativeHistory = nativeHistory.listHermesNativeHistory;

module.exports.setProvider = (input) => {
  const mod = loadModule('set_provider.js');
  return mod ? mod(input) : null;
};

module.exports.setReasoning = (input) => {
  const mod = loadModule('set_reasoning.js');
  return mod ? mod(input) : null;
};

module.exports.setYolo = (input) => {
  const mod = loadModule('set_yolo.js');
  return mod ? mod(input) : null;
};

module.exports.newSession = (input) => {
  const mod = loadModule('new_session.js');
  return mod ? mod(input) : null;
};

module.exports.retryLast = (input) => {
  const mod = loadModule('retry_last.js');
  return mod ? mod(input) : null;
};

module.exports.undoLast = (input) => {
  const mod = loadModule('undo_last.js');
  return mod ? mod(input) : null;
};

module.exports.showProviders = (input) => {
  const mod = loadModule('show_providers.js');
  return mod ? mod(input) : null;
};

module.exports.rollbackList = (input) => {
  const mod = loadModule('rollback_list.js');
  return mod ? mod(input) : null;
};

module.exports.setModel = (input) => {
  const mod = loadModule('set_model.js');
  return mod ? mod(input) : null;
};

module.exports.listModels = (input) => {
  const mod = loadModule('list_models.js');
  return mod ? mod(input) : null;
};

module.exports.runSlashCommand = (input) => {
  const mod = loadModule('run_slash_command.js');
  return mod ? mod(input) : null;
};
