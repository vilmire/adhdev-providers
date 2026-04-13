#!/usr/bin/env node
/**
 * ADHDev Provider Validator
 *
 * Usage:
 *   node validate.js                               # validate all providers
 *   node validate.js ide/my-ide/provider.json      # validate a single file
 */
const fs = require('fs');
const path = require('path');

const REQUIRED_FIELDS = ['type', 'name', 'category', 'providerVersion', 'contractVersion'];
const VALID_CATEGORIES = ['ide', 'extension', 'cli', 'acp'];
const VALUE_CONTROL_TYPES = new Set(['select', 'toggle', 'cycle', 'slider']);
const VALID_CONTROL_TYPES = new Set(['select', 'toggle', 'cycle', 'slider', 'action', 'display']);
const VALID_CONTROL_PLACEMENTS = new Set(['bar', 'header', 'menu']);
const KNOWN_PROVIDER_FIELDS = new Set([
  'type',
  'name',
  'category',
  'aliases',
  'cdpPorts',
  'targetFilter',
  'cli',
  'icon',
  'displayName',
  'install',
  'versionCommand',
  'testedVersions',
  'processNames',
  'launch',
  'paths',
  'extensionId',
  'extensionIdPattern',
  'extensionIdPattern_flags',
  'compatibility',
  'defaultScriptDir',
  'binary',
  'spawn',
  'approvalKeys',
  'patterns',
  'cleanOutput',
  'resume',
  'sessionProbe',
  'approvalPositiveHints',
  'scripts',
  'vscodeCommands',
  'inputMethod',
  'inputSelector',
  'webviewMatchText',
  'os',
  'versions',
  'overrides',
  'settings',
  'controls',
  'staticConfigOptions',
  'spawnArgBuilder',
  'auth',
  'contractVersion',
  'capabilities',
  'providerVersion',
  'status',
  'details',
  'sendDelayMs',
  'sendKey',
  'submitStrategy',
  'disableUpstream',
]);

const USED_PORTS = new Map();
const USED_TYPES = new Map();

let errors = 0;
let warnings = 0;
let validated = 0;

function normalizeIndividualScriptName(filename) {
  const stem = filename.replace(/\.js$/, '');
  return stem.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
}

function collectScriptInventory(dir) {
  const inventory = new Set();
  if (!fs.existsSync(dir)) return inventory;

  const scriptsJs = path.join(dir, 'scripts.js');
  if (fs.existsSync(scriptsJs)) {
    try {
      delete require.cache[require.resolve(scriptsJs)];
      const exported = require(scriptsJs);
      Object.keys(exported || {}).forEach((key) => inventory.add(key));
    } catch (error) {
      inventory.add(`__load_error__:${error.message}`);
    }
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.js') || entry.name === 'scripts.js') continue;
    inventory.add(normalizeIndividualScriptName(entry.name));
  }

  return inventory;
}

function mergeScriptInventory(providerDir, provider) {
  const inventory = new Set();
  const dirs = new Set();

  if (typeof provider.defaultScriptDir === 'string' && provider.defaultScriptDir.trim()) {
    dirs.add(path.join(providerDir, provider.defaultScriptDir));
  }
  if (Array.isArray(provider.compatibility)) {
    for (const entry of provider.compatibility) {
      if (entry && typeof entry.scriptDir === 'string' && entry.scriptDir.trim()) {
        dirs.add(path.join(providerDir, entry.scriptDir));
      }
    }
  }

  for (const dir of dirs) {
    for (const item of collectScriptInventory(dir)) {
      inventory.add(item);
    }
  }

  return inventory;
}

function warn(rel, message) {
  console.warn(`⚠  ${rel}: ${message}`);
  warnings++;
}

function fail(rel, message) {
  console.error(`❌ ${rel}: ${message}`);
  errors++;
}

function validateControl(rel, control, inventory) {
  const localErrors = [];
  const localWarnings = [];

  if (!control || typeof control !== 'object' || Array.isArray(control)) {
    localErrors.push('controls: each control must be an object');
    return { errors: localErrors, warnings: localWarnings };
  }

  const id = typeof control.id === 'string' && control.id.trim() ? control.id.trim() : 'unknown';
  const prefix = `controls.${id}`;

  if (!control.id || !String(control.id).trim()) localErrors.push(`${prefix}: id is required`);
  if (!control.type || !VALID_CONTROL_TYPES.has(control.type)) localErrors.push(`${prefix}: type is invalid or missing`);
  if (!control.label || !String(control.label).trim()) localErrors.push(`${prefix}: label is required`);
  if (!control.placement || !VALID_CONTROL_PLACEMENTS.has(control.placement)) {
    localErrors.push(`${prefix}: placement must be one of ${Array.from(VALID_CONTROL_PLACEMENTS).join(', ')}`);
  }

  if (control.dynamic && !control.listScript) {
    localErrors.push(`${prefix}: dynamic controls require listScript`);
  }
  if (VALUE_CONTROL_TYPES.has(control.type) && !control.setScript) {
    localErrors.push(`${prefix}: ${control.type} controls require setScript`);
  }
  if (control.type === 'action' && !control.invokeScript) {
    localErrors.push(`${prefix}: action controls require invokeScript`);
  }
  if (control.type === 'slider') {
    if (typeof control.min !== 'number' || typeof control.max !== 'number') {
      localErrors.push(`${prefix}: slider controls require numeric min and max`);
    } else if (control.min > control.max) {
      localErrors.push(`${prefix}: slider min cannot exceed max`);
    }
  }
  if (control.readFrom !== undefined && (typeof control.readFrom !== 'string' || !control.readFrom.trim())) {
    localErrors.push(`${prefix}: readFrom must be a non-empty string when provided`);
  }

  for (const scriptName of [control.listScript, control.setScript, control.invokeScript]) {
    if (!scriptName) continue;
    if (!inventory.has(scriptName)) {
      localWarnings.push(`${prefix}: referenced script '${scriptName}' not found in compatibility/default script inventory`);
    }
  }

  return { errors: localErrors, warnings: localWarnings };
}

function validateProvider(providerDir, rel, mod) {
  for (const field of REQUIRED_FIELDS) {
    if (mod[field] === undefined || mod[field] === null || mod[field] === '') {
      fail(rel, `missing required field '${field}'`);
      return;
    }
  }

  if (!VALID_CATEGORIES.includes(mod.category)) {
    fail(rel, `invalid category '${mod.category}' (must be: ${VALID_CATEGORIES.join(', ')})`);
    return;
  }

  if (USED_TYPES.has(mod.type)) {
    fail(rel, `duplicate type '${mod.type}' (also in ${USED_TYPES.get(mod.type)})`);
    return;
  }
  USED_TYPES.set(mod.type, rel);

  if (typeof mod.providerVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(mod.providerVersion)) {
    warn(rel, `providerVersion should be semver (got ${JSON.stringify(mod.providerVersion)})`);
  }
  if (typeof mod.contractVersion !== 'number') {
    fail(rel, `contractVersion must be a number (got ${JSON.stringify(mod.contractVersion)})`);
  } else if (mod.contractVersion < 2) {
    warn(rel, `contractVersion ${mod.contractVersion} is older than the current typed contract baseline (2)`);
  }

  for (const key of Object.keys(mod)) {
    if (!KNOWN_PROVIDER_FIELDS.has(key)) {
      warn(rel, `unknown provider field '${key}'`);
    }
  }

  if (mod.category === 'ide') {
    if (!Array.isArray(mod.cdpPorts) || mod.cdpPorts.length < 2) {
      warn(rel, 'IDE missing cdpPorts [primary, fallback]');
    } else {
      for (const port of mod.cdpPorts) {
        if (USED_PORTS.has(port)) {
          fail(rel, `CDP port ${port} conflicts with ${USED_PORTS.get(port)}`);
        }
        USED_PORTS.set(port, rel);
      }
    }
    if (!mod.cli) warn(rel, "IDE missing 'cli' field");
    if (!mod.paths) warn(rel, "IDE missing 'paths' (install detection won't work)");
  }

  if (mod.category === 'extension') {
    if (!mod.extensionId && !mod.extensionIdPattern) {
      warn(rel, "extension missing 'extensionId' or 'extensionIdPattern' (discovery may fail)");
    }
  }

  if (mod.category === 'cli' || mod.category === 'acp') {
    if (!mod.spawn || typeof mod.spawn !== 'object' || !mod.spawn.command) {
      fail(rel, `${mod.category.toUpperCase()} missing spawn.command`);
    }
  }

  if (mod.defaultScriptDir) {
    const defaultDir = path.join(providerDir, mod.defaultScriptDir);
    if (!fs.existsSync(defaultDir)) {
      fail(rel, `defaultScriptDir '${mod.defaultScriptDir}' not found`);
    }
  } else if (mod.category === 'ide' || mod.category === 'extension') {
    warn(rel, 'defaultScriptDir missing for IDE/extension provider');
  }

  if (Array.isArray(mod.compatibility)) {
    for (const entry of mod.compatibility) {
      if (!entry.ideVersion) warn(rel, "compatibility entry missing 'ideVersion'");
      if (!entry.scriptDir) {
        warn(rel, "compatibility entry missing 'scriptDir'");
      } else {
        const compatDir = path.join(providerDir, entry.scriptDir);
        if (!fs.existsSync(compatDir)) {
          fail(rel, `compatibility scriptDir '${entry.scriptDir}' not found`);
        }
      }
    }
  }

  const inventory = mergeScriptInventory(providerDir, mod);
  const loadErrors = [...inventory].filter((name) => name.startsWith('__load_error__:'));
  for (const message of loadErrors) {
    warn(rel, `scripts.js load error — ${message.replace('__load_error__:', '')}`);
  }

  const controls = Array.isArray(mod.controls) ? mod.controls : [];
  const controlIds = new Set();
  for (const control of controls) {
    const result = validateControl(rel, control, inventory);
    result.errors.forEach((message) => fail(rel, message));
    result.warnings.forEach((message) => warn(rel, message));
    if (control && typeof control.id === 'string') {
      if (controlIds.has(control.id)) fail(rel, `duplicate control id '${control.id}'`);
      controlIds.add(control.id);
    }
  }

  const hasModelScripts = inventory.has('listModels') && inventory.has('setModel');
  const hasModeScripts = inventory.has('listModes') && inventory.has('setMode');
  const hasNewSession = inventory.has('newSession');
  if ((hasModelScripts || hasModeScripts || hasNewSession) && controls.length === 0) {
    warn(rel, 'provider exports typed control scripts but declares no controls');
  }

  validated++;
  console.log(`✅ ${rel}: ${mod.type} (${mod.category}) — ${mod.name}`);
}

function validate(filePath) {
  const rel = path.relative(process.cwd(), filePath);
  const providerDir = path.dirname(filePath);

  let mod;
  try {
    mod = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (error) {
    fail(rel, `parse error — ${error.message}`);
    return;
  }

  validateProvider(providerDir, rel, mod);
}

function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
      if (entry.name === 'node_modules' || entry.name === 'docs') continue;
      scanDir(full);
    } else if (entry.name === 'provider.json') {
      validate(full);
    }
  }
}

const args = process.argv.slice(2);

if (args.length > 0) {
  for (const arg of args) {
    const filePath = path.resolve(arg);
    if (!fs.existsSync(filePath)) {
      fail(arg, 'file not found');
      continue;
    }
    validate(filePath);
  }
} else {
  console.log('🔍 Validating all providers...\n');
  scanDir(process.cwd());
}

console.log(`\n━━━ Result: ${validated} passed, ${errors} errors, ${warnings} warnings ━━━`);
process.exit(errors > 0 ? 1 : 0);
