/**
 * Provider Helpers — 공유 유틸리티
 * 
 * 각 provider.js에서 require해 사용할 수 있는 공통 함수들.
 * 사용은 선택사항 — 각 provider.js는 독립적이어도 됨.
 * 
 * 사용법 (provider.js 내부):
 *   const { getWebviewDoc, htmlToMd, waitFor } = require('../../_helpers/index.js');
 */

/**
 * Extension webview iframe의 contentDocument 접근
 * @param {string} [selector='iframe'] - iframe 셀렉터
 * @returns {string} CDP evaluate용 JS 코드 (document 변수를 설정)
 */
function getWebviewDoc(selector = 'iframe') {
  return `
    const _iframe = document.querySelector('${selector}');
    const _doc = _iframe ? (_iframe.contentDocument || _iframe.contentWindow?.document) : document;
  `;
}

/**
 * React Fiber 데이터 추출 헬퍼 코드
 * 특정 엔트리 포인트에서 시작해 memoizedState를 순회
 * @param {string[]} entrySelectors - 엔트리 포인트 CSS 셀렉터
 * @param {number} [maxDepth=200] - Fiber 트리 최대 순회 깊이
 * @returns {string} CDP evaluate용 JS 코드 (변수 _fiberData를 설정)
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
 * 텍스트 입력 + Enter 전송 코드 생성
 * @param {string} varName - 텍스트가 저장된 변수명
 * @param {string} selectorExpr - 에디터 요소 참조 JS 표현식
 * @returns {string} CDP evaluate용 JS 코드
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
 * 요소 대기 코드 생성
 * @param {string} selector - CSS 셀렉터
 * @param {number} [timeout=5000] - 최대 대기 시간 (ms)
 * @returns {string} CDP evaluate용 JS 코드 (표현식 → 요소 또는 null)
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
 * HTML → Markdown 변환 함수 (CDP 코드 문자열)
 * 대시보드가 ReactMarkdown+remarkGfm을 사용하므로 HTML을 GFM으로 변환 필요
 * @returns {string} htmlToMd, childrenToMd 함수 선언 코드
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
 * 노이즈 텍스트 필터링 (상태 메시지, MCP 등)
 * @param {string} text - 원본 텍스트
 * @returns {boolean} true면 노이즈
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
