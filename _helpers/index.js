/**
 * Provider Helpers — Shared utilities
 * 
 * Common functions available via require in each provider.js.
 * Usage is optional — each provider.js can be self-contained.
 * 
 * Usage (inside provider.js):
 *   const { getWebviewDoc, htmlToMd, waitFor } = require('../../_helpers/index.js');
 */

/**
 * Access contentDocument of extension webview iframe
 * @param {string} [selector='iframe'] - iframe selector
 * @returns {string} JS code for CDP evaluate (sets document variable)
 */
function getWebviewDoc(selector = 'iframe') {
  return `
    const _iframe = document.querySelector('${selector}');
    const _doc = _iframe ? (_iframe.contentDocument || _iframe.contentWindow?.document) : document;
  `;
}

/**
 * React Fiber data extraction helper code
 * Traverse memoizedState starting from specific entry points
 * @param {string[]} entrySelectors - Entry point CSS selectors
 * @param {number} [maxDepth=200] - Max Fiber tree traversal depth
 * @returns {string} JS code for CDP evaluate (sets _fiberData variable)
 */
function getFiber(entrySelectors, maxDepth = 200) {
  const sels = JSON.stringify(entrySelectors);
  return `
    let _fiberData = null;
    const _entryPoints = ${sels};
    for (const sel of _entryPoints) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const fk = Object.keys(el).find(k => k.startsWith('__reactFiber'));
      if (!fk) continue;
      let fib = el[fk];
      for (let d = 0; d < ${maxDepth} && fib; d++) {
        if (fib.memoizedState) {
          let s = fib.memoizedState;
          while (s) {
            try {
              const memo = s.memoizedState;
              if (memo && typeof memo === 'object') {
                _fiberData = memo;
                break;
              }
            } catch(e) {}
            s = s.next;
          }
        }
        if (_fiberData) break;
        fib = fib.return;
      }
      if (_fiberData) break;
    }
  `;
}

/**
 * Generate text input + Enter submission code
 * @param {string} varName - Variable name containing the text
 * @param {string} selectorExpr - JS expression referencing the editor element
 * @returns {string} JS code for CDP evaluate
 */
function typeAndSubmit(varName, selectorExpr) {
  return `
    const _editor = ${selectorExpr};
    if (_editor) {
      _editor.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      document.execCommand('insertText', false, ${varName});
      _editor.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
      const _enterOpts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true };
      _editor.dispatchEvent(new KeyboardEvent('keydown', _enterOpts));
      _editor.dispatchEvent(new KeyboardEvent('keypress', _enterOpts));
      _editor.dispatchEvent(new KeyboardEvent('keyup', _enterOpts));
    }
  `;
}

/**
 * Generate element wait code
 * @param {string} selector - CSS selector
 * @param {number} [timeout=5000] - Max wait time (ms)
 * @returns {string} JS code for CDP evaluate (expression → element or null)
 */
function waitFor(selector, timeout = 5000) {
  return `
    await new Promise((resolve) => {
      const _t = Date.now();
      const _check = () => {
        const el = document.querySelector('${selector}');
        if (el && el.offsetWidth > 0) return resolve(el);
        if (Date.now() - _t > ${timeout}) return resolve(null);
        setTimeout(_check, 200);
      };
      _check();
    })
  `;
}

/**
 * HTML → Markdown conversion function (CDP code string)
 * Dashboard uses ReactMarkdown+remarkGfm, so HTML must be converted to GFM
 * @returns {string} htmlToMd, childrenToMd function declaration code
 */
function htmlToMdCode() {
  return `
    function htmlToMd(node) {
      if (node.nodeType === 3) return node.textContent || '';
      if (node.nodeType !== 1) return '';
      const tag = node.tagName;
      if (tag === 'STYLE' || tag === 'SCRIPT' || tag === 'SVG') return '';
      if (tag === 'TABLE') {
        const rows = Array.from(node.querySelectorAll('tr'));
        if (rows.length === 0) return '';
        const table = rows.map(tr => Array.from(tr.querySelectorAll('th, td')).map(cell => (cell.textContent || '').trim().replace(/\\|/g, '\\\\|')));
        if (table.length === 0) return '';
        const colCount = Math.max(...table.map(r => r.length));
        const header = table[0];
        const sep = Array(colCount).fill('---');
        const body = table.slice(1);
        let md = '| ' + header.join(' | ') + ' |\\n';
        md += '| ' + sep.join(' | ') + ' |\\n';
        for (const row of body) {
          while (row.length < colCount) row.push('');
          md += '| ' + row.join(' | ') + ' |\\n';
        }
        return '\\n' + md + '\\n';
      }
      if (tag === 'UL') return '\\n' + Array.from(node.children).map(li => '- ' + childrenToMd(li).trim()).join('\\n') + '\\n';
      if (tag === 'OL') return '\\n' + Array.from(node.children).map((li, i) => (i + 1) + '. ' + childrenToMd(li).trim()).join('\\n') + '\\n';
      if (tag === 'LI') return childrenToMd(node);
      if (tag === 'H1') return '\\n# ' + childrenToMd(node).trim() + '\\n';
      if (tag === 'H2') return '\\n## ' + childrenToMd(node).trim() + '\\n';
      if (tag === 'H3') return '\\n### ' + childrenToMd(node).trim() + '\\n';
      if (tag === 'H4') return '\\n#### ' + childrenToMd(node).trim() + '\\n';
      if (tag === 'STRONG' || tag === 'B') return '**' + childrenToMd(node).trim() + '**';
      if (tag === 'EM' || tag === 'I') return '*' + childrenToMd(node).trim() + '*';
      if (tag === 'PRE') {
        const codeEl = node.querySelector('code');
        const lang = codeEl ? (codeEl.className.match(/language-(\\w+)/)?.[1] || '') : '';
        const code = (codeEl || node).textContent || '';
        return '\\n\`\`\`' + lang + '\\n' + code.trim() + '\\n\`\`\`\\n';
      }
      if (tag === 'CODE') {
        if (node.parentElement && node.parentElement.tagName === 'PRE') return node.textContent || '';
        return '\`' + (node.textContent || '').trim() + '\`';
      }
      if (tag === 'BLOCKQUOTE') return '\\n> ' + childrenToMd(node).trim().replace(/\\n/g, '\\n> ') + '\\n';
      if (tag === 'A') return '[' + childrenToMd(node).trim() + '](' + (node.getAttribute('href') || '') + ')';
      if (tag === 'BR') return '\\n';
      if (tag === 'P') return '\\n' + childrenToMd(node).trim() + '\\n';
      return childrenToMd(node);
    }
    function childrenToMd(node) {
      return Array.from(node.childNodes).map(htmlToMd).join('');
    }
  `;
}

/**
 * Noise text filtering (status messages, MCP, etc.)
 * @param {string} text - Original text
 * @returns {boolean} true if noise
 */
function isNoiseText(text) {
  const low = (text || '').trim().toLowerCase();
  if (low.length > 60) return false;
  if (/^(analyzed\s+\d|edited\s+\d|ran\s+\S|terminal\s|reading|searching)/i.test(low)) return true;
  if (/^(mcp|customizationmcp|serversexport)/i.test(low)) return true;
  return false;
}

module.exports = {
  getWebviewDoc,
  getFiber,
  typeAndSubmit,
  waitFor,
  htmlToMdCode,
  isNoiseText,
};
