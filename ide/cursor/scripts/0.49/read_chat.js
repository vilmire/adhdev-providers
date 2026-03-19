/**
 * Cursor — read_chat
 *
 * DOM 구조 (v0.49):
 *   컴포저: [data-composer-id] + [data-composer-status]
 *   메시지 쌍: .composer-human-ai-pair-container
 *   사용자: .composer-human-message
 *   AI: direct children after first (tool/assistant)
 *   입력: .aislash-editor-input[contenteditable="true"]
 *   승인: .run-command-review-active + button/cursor-pointer 요소
 *
 * → { id, status, title, messages[], inputContent, activeModal }
 */
(() => {
  try {
    const c = document.querySelector('[data-composer-id]');
    const id = c?.getAttribute('data-composer-id') || 'active';
    const rawStatus = c?.getAttribute('data-composer-status') || 'idle';
    let status = rawStatus;
    if (rawStatus === 'thinking' || rawStatus === 'streaming') status = 'generating';
    else if (rawStatus === 'completed' || rawStatus === 'idle' || !rawStatus) status = 'idle';

    // Detect approval dialogs
    let activeModal = null;

    // Primary signal: Cursor uses .run-command-review-active on conversations container
    const reviewActive = !!document.querySelector('.run-command-review-active');

    // Also check clickable elements (Cursor uses divs with cursor-pointer, not buttons)
    // Note: Cursor concatenates button text with shortcut key labels (e.g. "SkipEsc", "Run⏎")
    const clickableEls = [...document.querySelectorAll('button, [role="button"], .cursor-pointer')].filter(b =>
      b.offsetWidth > 0 && /^(accept|reject|approve|deny|run|skip|allow|cancel)/i.test((b.textContent || b.getAttribute('aria-label') || '').trim())
    );

    if (reviewActive || clickableEls.length > 0) {
      status = 'waiting_approval';
      const reviewContainer = document.querySelector('.run-command-review-active');
      const renderedMsgs = reviewContainer?.querySelectorAll('.composer-rendered-message');
      const lastRendered = renderedMsgs?.length ? renderedMsgs[renderedMsgs.length - 1] : null;
      const toolMsg = lastRendered || reviewContainer?.querySelector('.composer-tool-former-message:last-of-type');
      activeModal = {
        message: toolMsg?.textContent?.trim()?.substring(0, 200) || 'Command approval required',
        buttons: clickableEls.map(b => b.textContent.trim().replace(/[⏎↵]/g, '').trim()).filter(Boolean),
      };
    }

    const msgs = [];
    document.querySelectorAll('.composer-human-ai-pair-container').forEach((p, i) => {
      if (p.children.length === 0) return; // skip virtual-scroll placeholders
      const h = p.querySelector('.composer-human-message');
      if (h) {
        const userText = (h.innerText || '').trim().substring(0, 6000);
        if (userText) msgs.push({ role: 'user', content: userText, index: msgs.length });
      }
      // Iterate direct children after the first (user message block)
      for (let ci = 1; ci < p.children.length; ci++) {
        const b = p.children[ci];
        if ((b.className || '').includes('opacity-50')) continue;
        const t = (b.innerText || '').trim();
        if (t.length < 2) continue;
        // Filter noise: "Thought for Xs", "Explored N files"
        if (/^Thought\nfor \d+s?$/i.test(t) || /^Explored\n/i.test(t)) continue;
        const hasTool = b.querySelector('.composer-tool-former-message, .composer-diff-block, .composer-code-block-container');
        msgs.push({ role: hasTool ? 'tool' : 'assistant', content: t.substring(0, 6000), index: msgs.length });
      }
    });
    const inputEl = document.querySelector('.aislash-editor-input[contenteditable="true"]');
    const inputContent = inputEl?.textContent?.trim() || '';
    const titleParts = document.title.split(' — ');
    const projectTitle = (titleParts.length >= 2 ? titleParts[titleParts.length - 2] : titleParts[0] || '').trim();
    return JSON.stringify({ id, status, title: projectTitle, messages: msgs, inputContent, activeModal });
  } catch(e) {
    return JSON.stringify({ id: '', status: 'error', messages: [] });
  }
})()
