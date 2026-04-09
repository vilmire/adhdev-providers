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
;(async () => {
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
    const isTaskList = headerText === 'Tasks';
    const hasComposer = !!doc.querySelector('.ProseMirror');
    const globalCache = globalThis.__adhdevCodexReadChatCache || (globalThis.__adhdevCodexReadChatCache = {});
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

    function sanitizeMessageContent(raw) {
      const lines = String(raw || '')
        .split('\n')
        .map((line) => line.trimEnd());
      const filtered = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          if (filtered.length > 0 && filtered[filtered.length - 1] !== '') filtered.push('');
          continue;
        }

        if (/^\d{1,2}:\d{2}\s?(AM|PM)$/i.test(trimmed)) continue;
        if (/^Worked for \d+/i.test(trimmed)) continue;
        if (/^Working for \d+/i.test(trimmed)) continue;
        if (/^Ran \d+ command(s)?$/i.test(trimmed)) continue;
        if (/^Approved by user$/i.test(trimmed)) continue;
        if (/^Using tool:/i.test(trimmed)) continue;
        if (/^Applied patch$/i.test(trimmed)) continue;

        filtered.push(line);
      }

      return filtered
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }

    function parseUnitIndex(unitKey) {
      const parts = String(unitKey || '').split(':');
      const raw = parts.length >= 2 ? parts[parts.length - 2] : '0';
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    function buildMessage(turnKey, unitEl) {
      const unitKey = unitEl.getAttribute('data-content-search-unit-key') || '';
      const parts = unitKey.split(':');
      const role = parts.length >= 3 ? parts[parts.length - 1] : 'assistant';
      const content = sanitizeMessageContent(extractRichContent(unitEl));
      if (!content || content.length < 1) return null;

      const kind = (() => {
        if (unitEl.querySelector('[class*="reason" i], [class*="think" i], [data-testid*="thought" i]')) {
          return 'thought';
        }
        if (unitEl.querySelector('[class*="tool" i], [data-testid*="tool" i], [aria-label*="tool" i]')) {
          return 'tool';
        }
        if (
          unitEl.querySelector('[class*="terminal" i], [data-testid*="terminal" i]') ||
          /^```(?:bash|sh|zsh|shell|console)/i.test(content)
        ) {
          return 'terminal';
        }
        return undefined;
      })();

      const message = {
        role: role === 'user' ? 'user' : 'assistant',
        content,
        index: 0,
        _turnKey: turnKey || '',
        _unitKey: unitKey,
        _unitIndex: parseUnitIndex(unitKey),
      };
      if (kind) message.kind = kind;
      return message;
    }

    function collectVisibleMessages() {
      const collected = [];
      const turnEls = Array.from(doc.querySelectorAll('[data-content-search-turn-key]'));
      for (const turnEl of turnEls) {
        const turnKey = turnEl.getAttribute('data-content-search-turn-key') || '';
        const unitEls = turnEl.querySelectorAll('[data-content-search-unit-key]');
        for (const unitEl of unitEls) {
          const message = buildMessage(turnKey, unitEl);
          if (message) collected.push(message);
        }
      }
      return collected;
    }

    function upsertMessages(cache, nextMessages) {
      for (const message of nextMessages) {
        const key = message._unitKey || `${message._turnKey}:${message._unitIndex}:${message.role}`;
        const existing = cache.byUnit[key];
        if (!existing || existing.content !== message.content || existing.kind !== message.kind) {
          cache.byUnit[key] = message;
        }
      }
    }

    function getTurnKeys(messages) {
      return [...new Set(messages.map((message) => message._turnKey).filter(Boolean))];
    }

    function isSyntheticTurnKey(turnKey) {
      return typeof turnKey === 'string' && /^turn-index-\d+$/i.test(turnKey);
    }

    function isUuidLikeTurnKey(turnKey) {
      return typeof turnKey === 'string' && /^[0-9a-f]{8}-[0-9a-f-]{8,}$/i.test(turnKey);
    }

    function shouldResetForVisibleTurnShift(cache, visibleTurnKeys) {
      if (!Array.isArray(cache.visibleTurnKeys) || cache.visibleTurnKeys.length === 0) return false;
      if (visibleTurnKeys.length === 0) return false;
      const prevVisible = new Set(cache.visibleTurnKeys.filter((turnKey) => !isSyntheticTurnKey(turnKey)));
      const nextVisible = visibleTurnKeys.filter((turnKey) => !isSyntheticTurnKey(turnKey));
      if (prevVisible.size === 0 || nextVisible.length === 0) return false;
      return !nextVisible.some((turnKey) => prevVisible.has(turnKey));
    }

    function purgeSyntheticFallbackTurns(cache, visibleTurnKeys) {
      const hasVisibleRealTurns = visibleTurnKeys.some((turnKey) => !isSyntheticTurnKey(turnKey));
      if (!hasVisibleRealTurns) return;
      for (const [key, message] of Object.entries(cache.byUnit)) {
        if (isSyntheticTurnKey(message?._turnKey)) {
          delete cache.byUnit[key];
        }
      }
    }

    function cacheOverlapsVisibleTurns(cache, visibleTurnKeys) {
      if (visibleTurnKeys.length === 0) return true;
      const cachedTurnKeys = new Set(
        Object.values(cache.byUnit)
          .map((message) => message._turnKey)
          .filter(Boolean)
      );
      if (cachedTurnKeys.size === 0) return true;
      return visibleTurnKeys.some((turnKey) => cachedTurnKeys.has(turnKey));
    }

    function resetCache(cache) {
      cache.byUnit = {};
      cache.harvested = false;
    }

    function getOrderedMessages(cache) {
      const ordered = Object.values(cache.byUnit);
      ordered.sort((a, b) => {
        if (a._turnKey !== b._turnKey) {
          const aSynthetic = isSyntheticTurnKey(a._turnKey);
          const bSynthetic = isSyntheticTurnKey(b._turnKey);
          if (aSynthetic !== bSynthetic) return aSynthetic ? -1 : 1;

          const aUuid = isUuidLikeTurnKey(a._turnKey);
          const bUuid = isUuidLikeTurnKey(b._turnKey);
          if (aUuid !== bUuid) return aUuid ? 1 : -1;

          return String(a._turnKey || '').localeCompare(String(b._turnKey || ''));
        }
        return (a._unitIndex || 0) - (b._unitIndex || 0);
      });
      return ordered.map((message, index) => ({
        role: message.role,
        content: message.content,
        index,
        _turnKey: message._turnKey,
        ...(message.kind ? { kind: message.kind } : {}),
      }));
    }

    function findThreadScroller() {
      const firstTurn = doc.querySelector('[data-content-search-turn-key]');
      if (firstTurn) {
        const byTurn = firstTurn.closest('[class*="vertical-scroll-fade-mask-top"][class*="overflow-y-auto"]');
        if (byTurn) return byTurn;
      }
      const byConversation = doc.querySelector('[data-thread-find-target="conversation"]')?.closest('[class*="overflow-y-auto"]');
      if (byConversation) return byConversation;
      return doc.querySelector('[class*="vertical-scroll-fade-mask-top"][class*="overflow-y-auto"]');
    }

    async function harvestVirtualizedMessages(cache) {
      const scroller = findThreadScroller();
      if (!scroller) return;
      if (scroller.scrollHeight <= scroller.clientHeight + 32) return;

      const originalTop = scroller.scrollTop;
      let stableCount = 0;
      let lastTop = scroller.scrollTop;

      for (let step = 0; step < 24; step++) {
        upsertMessages(cache, collectVisibleMessages());
        if (scroller.scrollTop <= 0) break;

        const delta = Math.max(Math.floor(scroller.clientHeight * 0.9), 320);
        const nextTop = Math.max(0, scroller.scrollTop - delta);
        if (nextTop === scroller.scrollTop || scroller.scrollTop === lastTop) {
          stableCount += 1;
          if (stableCount >= 2) break;
        } else {
          stableCount = 0;
        }
        lastTop = scroller.scrollTop;
        scroller.scrollTop = nextTop;
        scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
        await sleep(120);
      }

      upsertMessages(cache, collectVisibleMessages());

      scroller.scrollTop = originalTop;
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
      await sleep(30);
    }

    // ─── 1. Messages ───
    const initialVisibleMessages = collectVisibleMessages();
    const initialVisibleTurnKeys = getTurnKeys(initialVisibleMessages);
    const conversationKey = `codex:${doc.location?.href || ''}:${headerText || 'conversation'}`;
    const cache = globalCache[conversationKey] || (globalCache[conversationKey] = { byUnit: {}, harvested: false, visibleTurnKeys: [] });
    const hasLegacyCacheShape = cache.harvested && !Array.isArray(cache.visibleTurnKeys);
    if (
      hasLegacyCacheShape
      || shouldResetForVisibleTurnShift(cache, initialVisibleTurnKeys)
      || !cacheOverlapsVisibleTurns(cache, initialVisibleTurnKeys)
    ) {
      resetCache(cache);
    }
    upsertMessages(cache, initialVisibleMessages);
    purgeSyntheticFallbackTurns(cache, initialVisibleTurnKeys);
    cache.visibleTurnKeys = initialVisibleTurnKeys;

    if (!cache.harvested && initialVisibleMessages.length > 0) {
      await harvestVirtualizedMessages(cache);
      cache.harvested = true;
    }

    const messages = getOrderedMessages(cache);

    // Fallback
    if (messages.length === 0 && !isTaskList) {
      const threadArea = doc.querySelector('[data-thread-find-target="conversation"]');
      if (threadArea) {
        const text = sanitizeMessageContent(extractRichContent(threadArea));
        if (text.length > 0) {
          messages.push({
            role: 'assistant',
            content: text,
            index: 0,
          });
        }
      }
    }

    // ─── 2. Input field ───
    let inputContent = '';
    const proseMirror = doc.querySelector('.ProseMirror');
    if (proseMirror) {
      const placeholder = proseMirror.querySelector('.placeholder');
      const text = sanitizeMessageContent((proseMirror.textContent || '').trim());
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

    // Language-agnostic generation detection via composer submit button icon.
    // Confirmed via live DOM capture:
    //   - Idle:       SVG fill="none"           (↑ send arrow icon)
    //   - Generating: SVG fill="currentColor"   (■ stop square icon)
    // The button has class containing "size-token-button-composer".
    const composerBtn = doc.querySelector('button[class*="size-token-button-composer"]');
    if (composerBtn) {
      const svg = composerBtn.querySelector('svg');
      if (svg && svg.getAttribute('fill') === 'currentColor') {
        status = 'generating';
      }
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
          buttons: uniqueActions,
          actions: uniqueActions
        };
      }
    } // end if (approvalArea)

    if (isTaskList) {
      status = messages.length === 0 ? 'idle' : status;
    }
    if (!isVisible && messages.length === 0) status = 'panel_hidden';

    // ─── 4. Model / Mode ───
    // Model: found from haspopup=menu button whose text matches model name patterns (GPT-*, o1-*, etc.)
    // Mode: Codex uses a brain icon button (no text) that requires clicking to read the dropdown.
    //       readChat cannot click dropdowns (it's a polling script), so mode is left empty here
    //       and provided by the separate listModes script.
    let model = '';
    let mode = '';
    const allMenuBtns = Array.from(doc.querySelectorAll('button[aria-haspopup="menu"]'))
      .filter(btn => btn.offsetWidth > 0 && !btn.closest('[inert]'));
    for (const btn of allMenuBtns) {
      const text = ((btn.textContent || '').trim() || (btn.getAttribute('aria-label') || '').trim()).replace(/\s+/g, ' ');
      if (/^(GPT-|gpt-|o\d|claude-|sonnet|opus)/i.test(text)) {
        model = text;
        break;
      }
    }

    // ─── 6. Task info ───
    const taskBtn = doc.querySelector('[aria-label*="Tasks"], [aria-label*="task" i]');
    const taskInfo = taskBtn ? (taskBtn.textContent || '').trim() : '';
    const title = (isTaskList && hasComposer ? 'Codex' : headerText) || 'Codex';
    return JSON.stringify({
      id: 'codex',
      agentType: 'codex',
      agentName: 'Codex',
      extensionId: 'openai.chatgpt',
      status,
      isVisible,
      isTaskList,
      title,
      messages: messages.slice(-200),
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
