/**
 * Codex Extension — read_chat (v2 — rich content extraction)
 *
 * Structure (Codex — openai.chatgpt):
 *   - Root: #root (React app via ProseMirror)
 *   - Messages: data-content-search-turn-key="UUID" per turn
 *   - Unit: data-content-search-unit-key="UUID:index:role"
 *   - Thread: data-thread-find-target="conversation"
 *   - Input: .ProseMirror (contentEditable)
 *   - Model: footer button text (e.g. "GPT-5.4")
 *   - Status indicators: button aria-labels, presence of cancel button
 *
 * Rich content support:
 *   - Code blocks (PRE/CODE → ```lang\n...\n```)
 *   - Tables (TABLE → markdown table)
 *   - Lists (UL/OL → bullet/numbered items)
 *   - Inline code (CODE → `...`)
 *   - Block elements (P, DIV, H1-H6 → newlines)
 *   - Bold/Italic preservation
 *
 * Runs inside webview frame via evaluateInWebviewFrame.
 */
(() => {
  try {
    const root = document.getElementById('root');
    if (!root) return JSON.stringify({ error: 'no root element' });

    const isVisible = root.offsetHeight > 0;

    const headerEl = document.querySelector('[style*="view-transition-name: header-title"]');
    const headerText = (headerEl?.textContent || '').trim();
    const isTaskList = headerText === '작업' || headerText === 'Tasks';

    // ─── Rich content extractor ───
    const BLOCK_TAGS = new Set(['DIV', 'P', 'BR', 'LI', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'HR', 'SECTION', 'ARTICLE']);

    function extractRichContent(container) {
      let out = '';

      function extractCode(node) {
        if (node.nodeType === 3) return node.textContent || '';
        if (node.nodeType !== 1) return '';
        if (node.tagName === 'BR') return '\n';
        const parts = [];
        for (const c of node.childNodes) {
          const isBlock = c.nodeType === 1 && BLOCK_TAGS.has(c.tagName);
          const tx = extractCode(c);
          if (tx) {
            if (isBlock && parts.length > 0) parts.push('\n');
            parts.push(tx);
            if (isBlock) parts.push('\n');
          }
        }
        return parts.join('').replace(/\n{3,}/g, '\n\n');
      }

      function extractTable(table) {
        const rows = [];
        for (const tr of table.querySelectorAll('tr')) {
          const cells = [];
          for (const cell of tr.querySelectorAll('th, td')) {
            cells.push((cell.textContent || '').trim().replace(/\|/g, '\\|'));
          }
          rows.push(cells);
        }
        if (rows.length === 0) return '';

        const colCount = Math.max(...rows.map(r => r.length));
        const lines = [];

        // Header row
        const header = rows[0] || [];
        while (header.length < colCount) header.push('');
        lines.push('| ' + header.join(' | ') + ' |');
        lines.push('| ' + header.map(() => '---').join(' | ') + ' |');

        // Data rows
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          while (row.length < colCount) row.push('');
          lines.push('| ' + row.join(' | ') + ' |');
        }
        return lines.join('\n');
      }

      function extractList(list) {
        const items = [];
        const isOrdered = list.tagName === 'OL';
        let idx = 1;
        for (const li of list.querySelectorAll(':scope > li')) {
          const prefix = isOrdered ? `${idx++}. ` : '- ';
          const text = (li.textContent || '').trim();
          if (text) items.push(prefix + text);
        }
        return items.join('\n');
      }

      function walk(node) {
        if (node.nodeType === 3) {
          out += node.textContent;
          return;
        }
        if (node.nodeType !== 1) return;
        const el = node;
        const tag = el.tagName;
        const cls = (el.className && typeof el.className === 'string') ? el.className : '';

        // ─ Codex code block wrapper (div.bg-token-text-code-block-background)
        if (tag === 'DIV' && cls.includes('bg-token-text-code-block-background')) {
          const langLabel = el.querySelector('.sticky .truncate, .sticky div:first-child');
          const lang = langLabel ? (langLabel.textContent || '').trim() : '';
          const codeEl = el.querySelector('code');
          const codeText = codeEl ? extractCode(codeEl).trim() : (el.textContent || '').trim();
          const cleanCode = (lang && codeText.startsWith(lang))
            ? codeText.substring(lang.length).trim()
            : codeText;
          out += '\n```' + lang + '\n' + cleanCode + '\n```\n';
          return;
        }

        // ─ Code block (PRE — standard fallback)
        if (tag === 'PRE') {
          const codeEl = el.querySelector('code');
          const lang = codeEl
            ? (codeEl.className.match(/language-(\w+)/)?.[1] || '')
            : '';
          const codeText = extractCode(codeEl || el).trim();
          out += '\n```' + lang + '\n' + codeText + '\n```\n';
          return;
        }

        // ─ Codex inline code (span._inlineMarkdown.font-mono)
        if (tag === 'SPAN' && cls.includes('font-mono') && cls.includes('inline-markdown')) {
          out += '`' + (el.textContent || '') + '`';
          return;
        }

        // ─ Inline code (CODE not inside PRE)
        if (tag === 'CODE') {
          out += '`' + (el.textContent || '') + '`';
          return;
        }

        // ─ Table
        if (tag === 'TABLE') {
          const md = extractTable(el);
          if (md) {
            if (out && !out.endsWith('\n')) out += '\n';
            out += md + '\n';
          }
          return;
        }

        // ─ Lists
        if (tag === 'UL' || tag === 'OL') {
          const md = extractList(el);
          if (md) {
            if (out && !out.endsWith('\n')) out += '\n';
            out += md + '\n';
          }
          return;
        }

        // ─ Headings
        if (/^H[1-6]$/.test(tag)) {
          const level = parseInt(tag[1]);
          if (out && !out.endsWith('\n')) out += '\n';
          out += '#'.repeat(level) + ' ' + (el.textContent || '').trim() + '\n';
          return;
        }

        // ─ Horizontal rule
        if (tag === 'HR') {
          out += '\n---\n';
          return;
        }

        // ─ BR
        if (tag === 'BR') {
          out += '\n';
          return;
        }

        // ─ Bold / Italic / Strong
        if (tag === 'STRONG' || tag === 'B') {
          out += '**' + (el.textContent || '') + '**';
          return;
        }
        if (tag === 'EM' || tag === 'I') {
          out += '*' + (el.textContent || '') + '*';
          return;
        }

        // ─ Block elements (P, DIV, BLOCKQUOTE, SECTION, etc.)
        if (BLOCK_TAGS.has(tag)) {
          if (out && !out.endsWith('\n')) out += '\n';
          if (tag === 'BLOCKQUOTE') out += '> ';
        }

        // Recurse children
        for (const child of el.childNodes) walk(child);

        // After block element, ensure newline
        if (BLOCK_TAGS.has(tag) && out && !out.endsWith('\n')) {
          out += '\n';
        }
      }

      walk(container);
      return out
        .replace(/\n{3,}/g, '\n\n')    // collapse excessive newlines
        .replace(/^\n+/, '')            // trim leading
        .replace(/\n+$/, '')            // trim trailing
        .trim();
    }

    // ─── 1. Messages ───
    const messages = [];
    const turnEls = document.querySelectorAll('[data-content-search-turn-key]');

    for (const turnEl of turnEls) {
      const turnKey = turnEl.getAttribute('data-content-search-turn-key');
      const unitEls = turnEl.querySelectorAll('[data-content-search-unit-key]');

      for (const unitEl of unitEls) {
        const unitKey = unitEl.getAttribute('data-content-search-unit-key') || '';
        const parts = unitKey.split(':');
        const role = parts.length >= 3 ? parts[parts.length - 1] : 'assistant';

        const content = extractRichContent(unitEl);

        if (!content || content.length < 1) continue;
        const trimmed = content.length > 3000 ? content.substring(0, 3000) + '…' : content;

        messages.push({
          role: role === 'user' ? 'user' : 'assistant',
          content: trimmed,
          timestamp: Date.now() - (turnEls.length - messages.length) * 1000,
          _turnKey: turnKey,
        });
      }
    }

    // Fallback
    if (messages.length === 0 && !isTaskList) {
      const threadArea = document.querySelector('[data-thread-find-target="conversation"]');
      if (threadArea) {
        const text = extractRichContent(threadArea);
        if (text.length > 0) {
          messages.push({
            role: 'assistant',
            content: text.substring(0, 3000),
            timestamp: Date.now(),
          });
        }
      }
    }

    // ─── 2. Input field ───
    let inputContent = '';
    const proseMirror = document.querySelector('.ProseMirror');
    if (proseMirror) {
      const placeholder = proseMirror.querySelector('.placeholder');
      const text = (proseMirror.textContent || '').trim();
      if (text && (!placeholder || text !== (placeholder.textContent || '').trim())) {
        inputContent = text;
      }
    }

    // ─── 3. Status ───
    let status = 'idle';
    const buttons = Array.from(document.querySelectorAll('button'))
      .filter(b => b.offsetWidth > 0);
    const buttonTexts = buttons.map(b => (b.textContent || '').trim().toLowerCase());
    const buttonLabels = buttons.map(b => (b.getAttribute('aria-label') || '').toLowerCase());

    if (buttonTexts.includes('cancel') || buttonTexts.includes('취소') ||
        buttonLabels.some(l => l.includes('cancel') || l.includes('취소') || l.includes('stop') || l.includes('중지'))) {
      status = 'generating';
    }

    const approvalPatterns = /^(approve|accept|allow|confirm|run|proceed|yes|승인|허용|실행)/i;
    if (buttonTexts.some(b => approvalPatterns.test(b)) ||
        buttonLabels.some(l => approvalPatterns.test(l))) {
      status = 'waiting_approval';
    }

    if (isTaskList) {
      status = messages.length === 0 ? 'idle' : status;
    }
    if (!isVisible && messages.length === 0) status = 'panel_hidden';

    // ─── 4. Model / Mode ───
    let model = '';
    let mode = '';
    const footerButtons = document.querySelectorAll(
      '[class*="thread-composer-max-width"] button, [class*="pb-2"] button'
    );
    for (const btn of footerButtons) {
      const text = (btn.textContent || '').trim();
      if (/^(GPT-|gpt-|o\d|claude-)/i.test(text)) model = text;
      if (/^(낮음|중간|높음|low|medium|high)$/i.test(text)) mode = text;
    }

    // ─── 5. Approval modal ───
    let activeModal = null;
    if (status === 'waiting_approval') {
      const approvalBtns = buttons
        .map(b => (b.textContent || '').trim())
        .filter(t => t && t.length > 0 && t.length < 40 &&
          /approve|accept|allow|confirm|run|proceed|cancel|deny|reject|승인|허용|실행|취소|거부/i.test(t));
      if (approvalBtns.length > 0) {
        activeModal = {
          message: 'Codex wants to perform an action',
          buttons: [...new Set(approvalBtns)],
        };
      }
    }

    // ─── 6. Task info ───
    const taskBtn = document.querySelector('[aria-label*="작업"], [aria-label*="task" i]');
    const taskInfo = taskBtn ? (taskBtn.textContent || '').trim() : '';

    return JSON.stringify({
      agentType: 'codex',
      agentName: 'Codex',
      extensionId: 'openai.chatgpt',
      status,
      isVisible,
      isTaskList,
      title: headerText || 'Codex',
      messages: messages.slice(-30),
      inputContent,
      model,
      mode,
      taskInfo,
      activeModal,
    });
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e) });
  }
})()
