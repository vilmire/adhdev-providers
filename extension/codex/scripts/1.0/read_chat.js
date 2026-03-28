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
    const isTaskList = headerText === 'Tasks' || headerText === 'Tasks';
    
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
    // Include roles, inputs, custom vscode tags, and generic interactive lists used by multiple-choice forms
    const selectors = [
      'button', '[role="radio"]', '[role="button"]', '[role="option"]', '[role="menuitem"]',
      'input[type="radio"] + label', 'input[type="radio"] ~ span', 'input[type="checkbox"] + label',
      'vscode-button', 'vscode-radio', 'vscode-checkbox', 'vscode-option', 'li'
    ].join(', ');
    
    const buttons = Array.from(doc.querySelectorAll(selectors))
      .filter(b => b.offsetWidth > 0 && !b.disabled && !b.closest('[inert]'));
    
    const getBtnLabel = (b) => {
      let t = (b.textContent || '').trim();
      return t || (b.getAttribute('aria-label') || '').trim();
    };
    
    const buttonLabels = buttons.map(getBtnLabel).map(t => t.toLowerCase());

    if (buttonLabels.some(l => l.includes('cancel') || l.includes('cancel') || l.includes('stop') || l.includes('stop'))) {
      status = 'generating';
    }

    // ─── 5. Universal Approval Modal Detection (Language-Agnostic) ───
    // The approval/interaction panel in Codex is rendered OUTSIDE the chat scroll area,
    // typically in a sibling "request-input-panel" region at the bottom.
    // We must scan the ENTIRE document body to find it.
    let activeModal = null;

    // Look for the request-input-panel area first (contains radio options + submit/skip)
    // The approval panel lives in the outer webview document, NOT inside the inner iframe (doc).
    // Use `document` (the webview frame root) to find it, same as explore_dom.js does.
    const searchDocs = [document, doc]; // outer first, then inner iframe
    let requestPanel = null;
    for (const d of searchDocs) {
      requestPanel = d.querySelector('[class*="request-input-panel"]');
      if (requestPanel) break;
      // Also search all textareas for the class
      const tas = d.querySelectorAll('textarea');
      for (const ta of tas) {
        if (ta.className && ta.className.includes('request-input-panel')) {
          requestPanel = ta;
          break;
        }
      }
      if (requestPanel) break;
    }
    // Walk up from the request-input-panel to find the full approval card
    let approvalArea = null;
    if (requestPanel) {
      let p = requestPanel;
      for (let i = 0; i < 12 && p && p.parentElement; i++) {
        p = p.parentElement;
        const btns = p.querySelectorAll('button').length;
        const radios = p.querySelectorAll('[role="radio"], [role="option"]').length;
        const total = btns + radios;
        if (btns >= 4) {
          // Found the approval card with enough interactive elements
          approvalArea = p;
          break;
        }
      }
    }




    if (approvalArea) {
      // ─── Codex Approval Panel (request-input-panel based) ───
      // The approval form has:
      //   - Option items as plain divs (e.g., "1.\nyes", "2.\nyes,...", "3.\nno,...")
      //   - Action buttons (e.g., "skip", "Submit⏎") as <button> elements
      // We need to extract BOTH for the dashboard.
      
      // Find parent container that has all options (level 3 from textarea, btns >= 4)
      // approvalArea is already set to this level.
      
      // Get the prompt message (from grandparent that starts with "Do you want...")
      let messageText = '';
      let msgParent = approvalArea.parentElement;
      for (let i = 0; i < 5 && msgParent; i++) {
        const t = (msgParent.innerText || '').trim();
        if (t.length > 20 && /[?？]/.test(t.substring(0, 200))) {
          // Found a parent whose text starts with a question
          messageText = t.split('\n')[0].trim();
          break;
        }
        msgParent = msgParent.parentElement;
      }
      if (!messageText) {
        // Fallback: use the approvalArea parent's text, first sentence
        const parentText = (approvalArea.parentElement?.innerText || approvalArea.innerText || '').trim();
        const firstLine = parentText.split('\n')[0].trim();
        messageText = firstLine.length > 5 ? firstLine : 'Agent requires an interaction';
      }

      // Extract option labels from the panel's direct/nested children
      const allBtns = Array.from(approvalArea.querySelectorAll('button'))
        .filter(b => b.offsetWidth > 0 && !b.disabled)
        .map(b => (b.textContent || '').trim())
        .filter(t => t.length > 0 && t.length < 150);

      // Extract numbered option text items (the entire panel text, split by option numbering)
      const panelText = (approvalArea.innerText || '').trim();
      // Parse "1.\nyes\n2.\nyes,...\n3.\nno,...\nskip\nSubmit⏎" format
      const optionMatches = panelText.match(/\d+\.\n[^\n]+(?:\n[^\d][^\n]*)*/g) || [];
      let options = optionMatches.map(o => o.replace(/\n/g, '').trim()).filter(o => o.length > 0);
      
      // Clean: remove any trailing button labels that got captured in the last option
      const btnLabelsSet = new Set(allBtns);
      options = options.map(opt => {
        let changed = true;
        while (changed) {
          changed = false;
          for (const bl of btnLabelsSet) {
            if (opt.endsWith(bl)) {
              opt = opt.slice(0, -bl.length).trim();
              changed = true;
            }
          }
        }
        return opt;
      }).filter(o => o.length > 0);

      // Merge numbered options from both sources (buttons + text parsing)
      const allNumbered = [...new Set([...allBtns.filter(b => /^\d+\./.test(b)), ...options])];
      allNumbered.sort((a, b) => (parseInt(a) || 999) - (parseInt(b) || 999));
      const actionBtns = allBtns.filter(b => !/^\d+\./.test(b));

      // Combine: sorted numbered options first, then action buttons (deduped)
      const uniqueActions = [...new Set([...allNumbered, ...actionBtns])];

      if (uniqueActions.length > 0) {
        status = 'waiting_approval';
        activeModal = {
          message: messageText,
          buttons: uniqueActions
        };
      }
    } // end if (approvalArea)

    if (isTaskList) {
      status = messages.length === 0 ? 'idle' : status;
    }
    if (!isVisible && messages.length === 0) status = 'panel_hidden';

    // ─── 4. Model / Mode ───
    // Language-agnostic detection via DOM structure.
    // Model: button text matching model name patterns (GPT-*, o1-*, claude-* — always English).
    // Mode: non-model aria-haspopup="menu" button in composer area (language-agnostic).
    let model = '';
    let mode = '';
    for (const d of [doc, document]) {
      // Search in composer area, or common footer containers
      const searchRoots = [
        d.querySelector('[class*="thread-composer-max-width"]'),
        d.querySelector('[class*="thread-composer"]'),
        d.querySelector('[class*="pb-2"]'),
        d.body,
      ].filter(Boolean);

      for (const searchRoot of searchRoots) {
        if (model && mode) break;

        // aria-haspopup="menu" buttons — dropdown triggers for model/mode
        if (!model || !mode) {
          const menuBtns = Array.from(searchRoot.querySelectorAll('button[aria-haspopup="menu"]'))
            .filter(b => b.offsetWidth > 0);
          for (const btn of menuBtns) {
            const text = (btn.textContent || '').trim();
            if (!model && /^(GPT-|gpt-|o\d|claude-|sonnet|opus)/i.test(text)) {
              model = text;
            } else if (!mode && text.length > 0 && text.length < 30) {
              mode = text;
            }
          }
        }

        // Fallback: any visible button with model-like text
        if (!model) {
          const allBtns = Array.from(searchRoot.querySelectorAll('button'))
            .filter(b => b.offsetWidth > 0);
          for (const btn of allBtns) {
            const text = (btn.textContent || '').trim();
            if (/^(GPT-|gpt-|o\d|claude-|sonnet|opus)/i.test(text)) {
              model = text;
              break;
            }
          }
        }

        if (model) break; // found model, no need to keep searching this scope
      }
      if (model) break; // found in this frame
    }

    // ─── 6. Task info ───
    const taskBtn = doc.querySelector('[aria-label*="Tasks"], [aria-label*="task" i]');
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
