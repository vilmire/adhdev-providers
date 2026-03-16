#!/usr/bin/env node
/**
 * ADHDev Provider Validator
 * 
 * Usage:
 *   node validate.js                     # 전체 검증
 *   node validate.js ide/my-ide/provider.js  # 단일 파일 검증
 */
const fs = require('fs');
const path = require('path');

const REQUIRED_FIELDS = ['type', 'name', 'category'];
const VALID_CATEGORIES = ['ide', 'extension', 'cli', 'acp'];
const USED_PORTS = new Map();
const USED_TYPES = new Map();

let errors = 0;
let warnings = 0;
let validated = 0;

function validate(filePath) {
  const rel = path.relative(process.cwd(), filePath);
  
  // 1. Syntax check
  try {
    delete require.cache[require.resolve(filePath)];
  } catch {}
  
  let mod;
  try {
    mod = require(filePath);
  } catch (e) {
    console.error(`❌ ${rel}: syntax error — ${e.message}`);
    errors++;
    return;
  }

  // 2. Required fields
  for (const field of REQUIRED_FIELDS) {
    if (!mod[field]) {
      console.error(`❌ ${rel}: missing required field '${field}'`);
      errors++;
      return;
    }
  }

  // 3. Valid category
  if (!VALID_CATEGORIES.includes(mod.category)) {
    console.error(`❌ ${rel}: invalid category '${mod.category}' (must be: ${VALID_CATEGORIES.join(', ')})`);
    errors++;
    return;
  }

  // 4. Unique type
  if (USED_TYPES.has(mod.type)) {
    console.error(`❌ ${rel}: duplicate type '${mod.type}' (also in ${USED_TYPES.get(mod.type)})`);
    errors++;
    return;
  }
  USED_TYPES.set(mod.type, rel);

  // 5. IDE-specific checks
  if (mod.category === 'ide') {
    if (!mod.cdpPorts || !Array.isArray(mod.cdpPorts) || mod.cdpPorts.length < 2) {
      console.warn(`⚠  ${rel}: IDE missing cdpPorts [primary, fallback]`);
      warnings++;
    } else {
      for (const port of mod.cdpPorts) {
        if (USED_PORTS.has(port)) {
          console.error(`❌ ${rel}: CDP port ${port} conflicts with ${USED_PORTS.get(port)}`);
          errors++;
        }
        USED_PORTS.set(port, rel);
      }
    }

    if (!mod.cli) {
      console.warn(`⚠  ${rel}: IDE missing 'cli' field`);
      warnings++;
    }

    if (!mod.paths) {
      console.warn(`⚠  ${rel}: IDE missing 'paths' (install detection won't work)`);
      warnings++;
    }
  }

  // 6. ACP-specific checks
  if (mod.category === 'acp') {
    if (!mod.spawn || !mod.spawn.command) {
      console.warn(`⚠  ${rel}: ACP missing spawn.command`);
      warnings++;
    }
  }

  // 7. Scripts check
  if (mod.category === 'ide' || mod.category === 'extension') {
    const hasRead = mod.scripts?.readChat || mod.scripts?.webviewReadChat;
    const hasSend = mod.scripts?.sendMessage || mod.scripts?.webviewSendMessage;
    if (!hasRead) {
      console.warn(`⚠  ${rel}: no readChat/webviewReadChat script`);
      warnings++;
    }
    if (!hasSend) {
      console.warn(`⚠  ${rel}: no sendMessage/webviewSendMessage script`);
      warnings++;
    }
  }

  // 8. Webview IDE consistency
  if (mod.category === 'ide' && mod.webviewMatchText) {
    if (!mod.scripts?.webviewReadChat) {
      console.warn(`⚠  ${rel}: has webviewMatchText but no webviewReadChat script`);
      warnings++;
    }
  }

  validated++;
  console.log(`✅ ${rel}: ${mod.type} (${mod.category}) — ${mod.name}`);
}

function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
      scanDir(full);
    } else if (entry.name === 'provider.js') {
      validate(full);
    }
  }
}

// ─── Main ───
const args = process.argv.slice(2);

if (args.length > 0) {
  // Validate specific file(s)
  for (const arg of args) {
    const filePath = path.resolve(arg);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${arg}`);
      errors++;
      continue;
    }
    validate(filePath);
  }
} else {
  // Validate all
  console.log('🔍 Validating all providers...\n');
  scanDir(process.cwd());
}

console.log(`\n━━━ Result: ${validated} passed, ${errors} errors, ${warnings} warnings ━━━`);
process.exit(errors > 0 ? 1 : 0);
