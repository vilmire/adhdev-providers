#!/usr/bin/env node
/**
 * ADHDev Provider Validator
 * 
 * Usage:
 *   node validate.js                              # validate all providers
 *   node validate.js ide/my-ide/provider.json     # validate a single file
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
  const providerDir = path.dirname(filePath);
  
  // 1. Parse JSON
  let mod;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    mod = JSON.parse(raw);
  } catch (e) {
    console.error(`❌ ${rel}: parse error — ${e.message}`);
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

  // 7. CLI-specific checks
  if (mod.category === 'cli') {
    if (!mod.spawn || !mod.spawn.command) {
      console.warn(`⚠  ${rel}: CLI missing spawn.command`);
      warnings++;
    }
  }

  // 8. Script directory checks (IDE/Extension/CLI with compatibility)
  if (mod.defaultScriptDir) {
    const defaultDir = path.join(providerDir, mod.defaultScriptDir);
    if (!fs.existsSync(defaultDir)) {
      console.error(`❌ ${rel}: defaultScriptDir '${mod.defaultScriptDir}' not found`);
      errors++;
    } else {
      // Check for scripts.js or individual script files
      const hasScriptsJs = fs.existsSync(path.join(defaultDir, 'scripts.js'));
      const jsFiles = fs.readdirSync(defaultDir).filter(f => f.endsWith('.js') && f !== 'scripts.js');

      if (!hasScriptsJs && jsFiles.length === 0) {
        console.warn(`⚠  ${rel}: defaultScriptDir '${mod.defaultScriptDir}' has no scripts`);
        warnings++;
      }

      // For IDE/Extension: check readChat + sendMessage presence
      if (mod.category === 'ide' || mod.category === 'extension') {
        if (hasScriptsJs) {
          // Validate scripts.js exports
          try {
            delete require.cache[require.resolve(path.join(defaultDir, 'scripts.js'))];
            const scripts = require(path.join(defaultDir, 'scripts.js'));
            const hasRead = scripts.readChat || scripts.webviewReadChat;
            const hasSend = scripts.sendMessage || scripts.webviewSendMessage;
            if (!hasRead) {
              console.warn(`⚠  ${rel}: no readChat/webviewReadChat in scripts.js`);
              warnings++;
            }
            if (!hasSend) {
              console.warn(`⚠  ${rel}: no sendMessage/webviewSendMessage in scripts.js`);
              warnings++;
            }
          } catch (e) {
            console.warn(`⚠  ${rel}: scripts.js load error — ${e.message}`);
            warnings++;
          }
        } else {
          // Check individual files (supports both read_chat.js and webview_read_chat.js naming)
          const hasRead = jsFiles.includes('read_chat.js') || jsFiles.includes('webview_read_chat.js');
          const hasSend = jsFiles.includes('send_message.js') || jsFiles.includes('webview_send_message.js');
          if (!hasRead) {
            console.warn(`⚠  ${rel}: no read_chat.js or webview_read_chat.js found`);
            warnings++;
          }
          if (!hasSend) {
            console.warn(`⚠  ${rel}: no send_message.js or webview_send_message.js found`);
            warnings++;
          }
        }
      }
    }
  }

  // 9. Compatibility array validation
  if (Array.isArray(mod.compatibility)) {
    for (const entry of mod.compatibility) {
      if (!entry.ideVersion) {
        console.warn(`⚠  ${rel}: compatibility entry missing 'ideVersion'`);
        warnings++;
      }
      if (!entry.scriptDir) {
        console.warn(`⚠  ${rel}: compatibility entry missing 'scriptDir'`);
        warnings++;
      } else {
        const compatDir = path.join(providerDir, entry.scriptDir);
        if (!fs.existsSync(compatDir)) {
          console.error(`❌ ${rel}: compatibility scriptDir '${entry.scriptDir}' not found`);
          errors++;
        }
      }
    }
  }

  // 10. Extension-specific checks
  if (mod.category === 'extension') {
    if (!mod.extensionIdPattern) {
      console.warn(`⚠  ${rel}: extension missing 'extensionIdPattern' (webview discovery won't work)`);
      warnings++;
    }
  }

  // 11. Webview IDE consistency
  if (mod.category === 'ide' && mod.webviewMatchText) {
    if (!mod.defaultScriptDir) {
      console.warn(`⚠  ${rel}: has webviewMatchText but no defaultScriptDir`);
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
      if (entry.name === 'node_modules' || entry.name === 'docs') continue;
      scanDir(full);
    } else if (entry.name === 'provider.json') {
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
