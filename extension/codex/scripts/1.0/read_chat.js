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
    // When executed via evaluateInSession, we're in the outer vscode-webview
    // iframe. The Codex React app lives in a child iframe. Try to access it.
    let doc = document;
    let root = doc.getElementById('root');

    if (!root) {
      // Traverse into inner iframe(s)
      const iframes = doc.querySelectorAll('iframe');
      for (const iframe of iframes) {
        try {
          const innerDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (innerDoc) {
            const innerRoot = innerDoc.getElementById('root');
            if (innerRoot) {
              doc = innerDoc;
              root = innerRoot;
              break;
            }
          }
        } catch (e) { /* cross-origin, skip */ }
      }
    }

    if (!root) return JSON.stringify({ error: 'no root element' });

    const isVisible = root.offsetHeight > 0;

    const headerEl = doc.querySelector('[style*="view-transition-name: header-title"]');
    const headerText = (headerEl?.textContent || '').trim();
    const isTaskList = headerText === '작업' || headerText === 'Tasks';
    
    // If we accidentally evaluated inside the Tasks webview instead of Chat, tell Daemon to try the next matching webview
    if (isTaskList) {
      return JSON.stringify({ __adhdev_skip_iframe: true, error: 'Found Tasks webview instead of Chat' });
    }

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
    const turnEls = doc.querySelectorAll('[data-content-search-turn-key]');

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
      const threadArea = doc.querySelector('[data-thread-find-target="conversation"]');
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
    const proseMirror = doc.querySelector('.ProseMirror');
    if (proseMirror) {
      const placeholder = proseMirror.querySelector('.placeholder');
      const text = (proseMirror.textContent || '').trim();
      if (text && (!placeholder || text !== (placeholder.textContent || '').trim())) {
        inputContent = text;
      }
    }

    // ─── 3. Status ───
    let status = 'idle';
    // Filter out disabled buttons to avoid matching old historical prompts
    const buttons = Array.from(doc.querySelectorAll('button'))
      .filter(b => b.offsetWidth > 0 && !b.disabled && !b.closest('[inert]'));
    
    const getBtnLabel = (b) => {
      let t = (b.textContent || '').trim();
      return t || (b.getAttribute('aria-label') || '').trim();
    };
    
    const buttonLabels = buttons.map(getBtnLabel).map(t => t.toLowerCase());

    if (buttonLabels.some(l => l.includes('cancel') || l.includes('취소') || l.includes('stop') || l.includes('중지'))) {
      status = 'generating';
    }

    // ─── 5. Approval Modal & Status ───
    const approvalSpecificPatterns = /^(approve|always approve|deny|reject|승인|항상 승인|거부|yes|no|allow|disallow|예|아니오|허용|실행|run|proceed|accept)/i;
    let activeModal = null;

    const approvalBtns = buttons.filter(b => {
      const lbl = getBtnLabel(b);
      return lbl && lbl.length < 40 && approvalSpecificPatterns.test(lbl);
    });

    if (approvalBtns.length > 0) {
      // Grab the last matching button which is generally the active prompt at the bottom
      const targetBtn = approvalBtns[approvalBtns.length - 1];
      let p = targetBtn.parentElement;
      let messageText = '';
      
      // Traverse upward to capture the contextual text block describing the prompt
      while (p && p !== doc.body) {
        // Clone to safely remove button texts from the extracted message
        const clone = p.cloneNode(true);
        clone.querySelectorAll('button').forEach(el => el.remove());
        const t = (clone.textContent || '').replace(/\s+/g, ' ').trim();
        if (t.length > 5 && t.length < 2000) {
          messageText = t;
          break;
        }
        p = p.parentElement;
      }
      
      if (!messageText) messageText = 'Codex wants to perform an action';
      
      // Find all peer buttons inside this prompt block
      let containerBtns = p ? Array.from(p.querySelectorAll('button')).filter(b => !b.disabled && b.offsetWidth > 0) : approvalBtns;
      if (containerBtns.length === 0 || containerBtns.length > 6) containerBtns = approvalBtns;

      const actions = containerBtns.map(b => getBtnLabel(b)).filter(t => t && t.length < 40);

      if (actions.length > 0) {
        status = 'waiting_approval';
        activeModal = {
          message: messageText,
          buttons: [...new Set(actions)]
        };
      }
    }

    if (isTaskList) {
      status = messages.length === 0 ? 'idle' : status;
    }
    if (!isVisible && messages.length === 0) status = 'panel_hidden';

    // ─── 4. Model / Mode ───
    let model = '';
    let mode = '';
    const footerButtons = doc.querySelectorAll(
      '[class*="thread-composer-max-width"] button, [class*="pb-2"] button'
    );
    for (const btn of footerButtons) {
      const text = (btn.textContent || '').trim();
      if (/^(GPT-|gpt-|o\d|claude-)/i.test(text)) model = text;
      if (/^(낮음|중간|높음|low|medium|high)$/i.test(text)) mode = text;
    }

    // ─── 6. Task info ───
    const taskBtn = doc.querySelector('[aria-label*="작업"], [aria-label*="task" i]');
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
