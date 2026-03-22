/**
 * Codex Extension — read_chat
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
 * Runs inside webview frame via evaluateInWebviewFrame.
 */
(() => {
  try {
    const root = document.getElementById('root');
    if (!root) return JSON.stringify({ error: 'no root element' });

    const isVisible = root.offsetHeight > 0;

    // Header — indicates current view (task list vs chat)
    const headerEl = document.querySelector('[style*="view-transition-name: header-title"]');
    const headerText = (headerEl?.textContent || '').trim();
    const isTaskList = headerText === '작업' || headerText === 'Tasks';

    // ─── 1. Messages ───
    const messages = [];
    const turnEls = document.querySelectorAll('[data-content-search-turn-key]');

    for (const turnEl of turnEls) {
      const turnKey = turnEl.getAttribute('data-content-search-turn-key');
      const unitEls = turnEl.querySelectorAll('[data-content-search-unit-key]');

      for (const unitEl of unitEls) {
        const unitKey = unitEl.getAttribute('data-content-search-unit-key') || '';
        // Format: "UUID:index:role"
        const parts = unitKey.split(':');
        const role = parts.length >= 3 ? parts[parts.length - 1] : 'assistant';

        // Extract content preserving code blocks
        let content = '';
        const preBlocks = unitEl.querySelectorAll('pre');

        if (preBlocks.length > 0) {
          // Structured extraction with code blocks
          const walk = (node) => {
            if (node.nodeType === 3) {
              content += node.textContent;
              return;
            }
            if (node.nodeType !== 1) return;
            const el = node;
            if (el.tagName === 'PRE') {
              const codeEl = el.querySelector('code');
              const lang = codeEl ? (codeEl.className.match(/language-(\w+)/)?.[1] || '') : '';
              const codeText = (codeEl || el).textContent || '';
              content += '\n```' + lang + '\n' + codeText.trim() + '\n```\n';
              return;
            }
            if (el.tagName === 'BR') { content += '\n'; return; }
            if (el.tagName === 'P' || el.tagName === 'DIV') {
              if (content && !content.endsWith('\n')) content += '\n';
            }
            for (const child of el.childNodes) walk(child);
          };
          walk(unitEl);
          content = content.trim();
        } else {
          content = (unitEl.textContent || '').trim();
        }

        // Skip empty or very short messages
        if (!content || content.length < 1) continue;

        // Trim long content
        if (content.length > 3000) content = content.substring(0, 3000) + '…';

        messages.push({
          role: role === 'user' ? 'user' : 'assistant',
          content,
          timestamp: Date.now() - (turnEls.length - messages.length) * 1000,
          _turnKey: turnKey,
        });
      }
    }

    // Fallback: if no data-content-search elements, try generic parsing
    if (messages.length === 0 && !isTaskList) {
      const threadArea = document.querySelector('[data-thread-find-target="conversation"]');
      if (threadArea) {
        const text = (threadArea.textContent || '').trim();
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
      // Only get text if it's not just the placeholder
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

    // Cancel button = generating
    if (buttonTexts.includes('cancel') || buttonTexts.includes('취소') ||
        buttonLabels.some(l => l.includes('cancel') || l.includes('취소'))) {
      status = 'generating';
    }

    // Approval patterns
    const approvalPatterns = /^(approve|accept|allow|confirm|run|proceed|yes|승인|허용|실행)/i;
    if (buttonTexts.some(b => approvalPatterns.test(b)) ||
        buttonLabels.some(l => approvalPatterns.test(l))) {
      status = 'waiting_approval';
    }

    // If on task list, override status
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
      // Model: GPT-*, o*, claude-*
      if (/^(GPT-|gpt-|o\d|claude-)/i.test(text)) {
        model = text;
      }
      // Mode/effort: 낮음/중간/높음 or low/medium/high
      if (/^(낮음|중간|높음|low|medium|high)$/i.test(text)) {
        mode = text;
      }
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

    // ─── 6. Task info (running tasks count) ───
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
