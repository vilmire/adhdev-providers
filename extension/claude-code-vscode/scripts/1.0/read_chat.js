/**
 * Claude Code (VS Code) — read_chat
 *
 * 구현 근거:
 * - Codex 익스텐션: 웹뷰 → 자식 iframe → #root 탐색, 풍부 텍스트 추출 패턴
 * - Antigravity IDE: htmlToMd / 블록 태그 보행, 상태는 Stop/취소 버튼·애니메이션 힌트
 * - Cline: 최종 JSON 계약(agentType, messages[], status, activeModal)
 *
 * 주의: Anthropic UI는 자주 바뀌므로, 19280 DevConsole에서 DOM 맞춤이 필요할 수 있음.
 */
(() => {
  try {
    function resolveDoc() {
      let doc = document;
      let root = doc.getElementById('root');
      if (root) {
        const inner = doc.querySelector('iframe');
        if (inner) {
          try {
            const d = inner.contentDocument || inner.contentWindow?.document;
            if (d?.getElementById('root')) return d;
          } catch (e) { /* cross-origin */ }
        }
        return doc;
      }
      for (const iframe of doc.querySelectorAll('iframe')) {
        try {
          const innerDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (!innerDoc) continue;
          if (innerDoc.getElementById('root')) return innerDoc;
          for (const inner2 of innerDoc.querySelectorAll('iframe')) {
            try {
              const d2 = inner2.contentDocument || inner2.contentWindow?.document;
              if (d2?.getElementById('root')) return d2;
            } catch (e2) { /* skip */ }
          }
          if (innerDoc.querySelector('.ProseMirror, [role="log"], main')) return innerDoc;
        } catch (e) { /* skip */ }
      }
      for (const iframe of doc.querySelectorAll('iframe')) {
        try {
          const d = iframe.contentDocument || iframe.contentWindow?.document;
          if (d?.body && (d.body.innerText || '').length > 50) return d;
        } catch (e) { /* skip */ }
      }
      return doc;
    }

    const doc = resolveDoc();
    const root = doc.getElementById('root') || doc.body;
    if (!root) return JSON.stringify({ error: 'no root/body' });

    const isVisible = root.offsetHeight > 0;

    const BLOCK_TAGS = new Set(['DIV', 'P', 'BR', 'LI', 'TR', 'SECTION', 'ARTICLE', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE']);
    function extractCodeText(node) {
      if (node.nodeType === 3) return node.textContent || '';
      if (node.nodeType !== 1) return '';
      if (node.tagName === 'BR') return '\n';
      const parts = [];
      for (const child of node.childNodes) {
        const isBlock = child.nodeType === 1 && BLOCK_TAGS.has(child.tagName);
        const text = extractCodeText(child);
        if (text) {
          if (isBlock && parts.length > 0) parts.push('\n');
          parts.push(text);
          if (isBlock) parts.push('\n');
        }
      }
      return parts.join('').replace(/\n{2,}/g, '\n');
    }
    function childrenToMd(node) {
      if (node.nodeType === 3) return node.textContent || '';
      if (node.nodeType !== 1) return '';
      const tag = node.tagName;
      if (tag === 'STYLE' || tag === 'SCRIPT' || tag === 'SVG') return '';
      if (tag === 'PRE') {
        const codeEl = node.querySelector('code');
        const lang = codeEl ? (codeEl.className.match(/language-(\w+)/)?.[1] || '') : '';
        const code = extractCodeText(codeEl || node);
        return '\n```' + lang + '\n' + code.trim() + '\n```\n';
      }
      if (tag === 'CODE') {
        if (node.parentElement && node.parentElement.tagName === 'PRE') return node.textContent || '';
        return '`' + (node.textContent || '').trim() + '`';
      }
      if (tag === 'P' || tag === 'DIV') return '\n' + Array.from(node.childNodes).map(childrenToMd).join('') + '\n';
      if (tag === 'BR') return '\n';
      return Array.from(node.childNodes).map(childrenToMd).join('');
    }
    function getCleanMd(el) {
      const clone = el.cloneNode(true);
      clone.querySelectorAll('button, [role="button"], style, script, svg, .codicon').forEach((n) => n.remove());
      return childrenToMd(clone).replace(/\n{3,}/g, '\n\n').trim();
    }

    const messages = [];
    const seen = new Set();
    const pushMsg = (role, content, ts) => {
      const c = (content || '').replace(/\s{3,}/g, '\n').trim();
      if (!c || c.length < 2) return;
      const h = role + ':' + c.slice(0, 160);
      if (seen.has(h)) return;
      seen.add(h);
      messages.push({ role, content: c.slice(0, 12000), timestamp: ts || Date.now() });
    };

    const scroll =
      doc.querySelector('[role="log"]') ||
      doc.querySelector('[class*="conversation" i], [class*="messages" i], [class*="thread" i]') ||
      doc.querySelector('main') ||
      root;

    const roleSelectors = [
      ['[data-role="user"]', 'user'],
      ['[data-role="assistant"]', 'assistant'],
      ['[data-message-role="user" i]', 'user'],
      ['[data-message-role="assistant" i]', 'assistant'],
      ['[data-turn="user" i]', 'user'],
      ['[data-turn="assistant" i]', 'assistant'],
    ];
    for (const [sel, role] of roleSelectors) {
      try {
        scroll.querySelectorAll(sel).forEach((el, i) => {
          if (!el.offsetHeight) return;
          const md = getCleanMd(el);
          pushMsg(role, md || (el.textContent || '').trim(), Date.now() - i * 1000);
        });
      } catch (e) { /* ignore */ }
    }

    if (messages.length === 0) {
      const articles = scroll.querySelectorAll('[role="article"], article');
      articles.forEach((el, i) => {
        if (!el.offsetHeight) return;
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        const cls = (el.className && String(el.className).toLowerCase()) || '';
        let role = 'assistant';
        if (aria.includes('user') || cls.includes('user')) role = 'user';
        const md = getCleanMd(el);
        pushMsg(role, md || (el.textContent || '').trim(), Date.now() - i * 1000);
      });
    }

    if (messages.length === 0) {
      const candidates = scroll.querySelectorAll(
        '.ProseMirror, [class*="markdown" i], [class*="prose" i], [class*="message" i], .leading-relaxed'
      );
      candidates.forEach((el, i) => {
        if (!el.offsetHeight || el.offsetHeight < 24) return;
        const t = getCleanMd(el) || (el.textContent || '').trim();
        if (t.length < 8) return;
        const low = (el.className && String(el.className).toLowerCase()) || '';
        const role = low.includes('user') ? 'user' : 'assistant';
        pushMsg(role, t, Date.now() - i * 500);
      });
    }

    let status = 'idle';
    const btnText = (b) => (b.textContent || '').trim().toLowerCase();
    const buttons = Array.from(doc.querySelectorAll('button, [role="button"], vscode-button')).filter(
      (b) => b.offsetWidth > 0
    );
    const labels = buttons.map(btnText);
    if (labels.some((t) => /^(stop|cancel task)/i.test(t) || t.includes('stop'))) status = 'generating';
    if (doc.querySelector('[aria-busy="true"], [data-busy="true"]')) status = 'generating';

    const approvalHints = /allow|approve|accept|deny|reject|run command|yes|no|dismiss|continue/i;
    if (labels.some((t) => approvalHints.test(t) && t.length < 48)) status = 'waiting_approval';

    if (!isVisible && messages.length === 0) status = 'panel_hidden';

    let inputContent = '';
    const input =
      doc.querySelector('.ProseMirror[contenteditable="true"]') ||
      doc.querySelector('[data-testid="chat-input"]') ||
      doc.querySelector('textarea');
    if (input) inputContent = input.value || input.textContent || '';

    let model = '';
    const modelEl = doc.querySelector('[class*="model" i][class*="select" i], [aria-label*="model" i]');
    if (modelEl) model = (modelEl.textContent || '').trim().slice(0, 120);

    let activeModal = null;
    if (status === 'waiting_approval') {
      const btns = buttons
        .map((b) => (b.textContent || '').trim())
        .filter((t) => t && t.length < 50 && approvalHints.test(t));
      if (btns.length) activeModal = { message: 'Claude Code needs confirmation', buttons: [...new Set(btns)] };
    }

    return JSON.stringify({
      agentType: 'claude-code-vscode',
      agentName: 'Claude Code',
      extensionId: 'anthropic.claude-code',
      status,
      isVisible,
      messages: messages.slice(-40),
      inputContent,
      model,
      mode: '',
      activeModal,
    });
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e) });
  }
})();
