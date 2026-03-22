/**
 * Codex Extension — Deep DOM Explorer
 * Explores the chat area, message list, input field, model selector etc.
 */
(() => {
  try {
    const root = document.getElementById('root');
    if (!root) return JSON.stringify({ error: 'no root' });

    // 1. Find chat input (textarea, contenteditable, etc.)
    const textareas = document.querySelectorAll('textarea');
    const contentEditables = document.querySelectorAll('[contenteditable="true"]');
    const chatInputCandidates = document.querySelectorAll('[data-placeholder], [placeholder*="ask"], [placeholder*="message"], [placeholder*="type"]');

    // 2. Find message-like containers
    const messageContainers = [];
    // Look for common message list patterns
    const candidates = [
      ...document.querySelectorAll('[class*="message"]'),
      ...document.querySelectorAll('[class*="chat"]'),
      ...document.querySelectorAll('[class*="conversation"]'),
      ...document.querySelectorAll('[class*="thread"]'),
      ...document.querySelectorAll('[role="log"]'),
      ...document.querySelectorAll('[role="list"]'),
    ];
    for (const el of candidates) {
      messageContainers.push({
        tag: el.tagName?.toLowerCase(),
        class: (el.className && typeof el.className === 'string') ? el.className.substring(0, 200) : null,
        role: el.getAttribute('role'),
        childCount: el.children?.length || 0,
        text: (el.textContent || '').trim().substring(0, 200),
      });
    }

    // 3. Find model/mode selectors
    const modelCandidates = document.querySelectorAll('[class*="model"], [class*="gpt"], [aria-label*="model" i], [aria-label*="모델" i]');

    // 4. Enumerate all role="button" items (conversation list items)
    const roleButtons = document.querySelectorAll('[role="button"]');

    // 5. Look for "GPT" text or model name in the UI
    const allText = root.textContent || '';
    const modelMatch = allText.match(/(GPT-[\d.]+|gpt-[\w.-]+|o\d+-[\w]+|claude-[\w.-]+)/i);

    // 6. Check if we're on a task list or chat view
    const hasConversationList = document.querySelectorAll('[role="button"][class*="rounded-lg"]').length > 0;
    const headerText = document.querySelector('[style*="view-transition-name: header-title"]')?.textContent?.trim() || '';

    return JSON.stringify({
      headerText,
      isTaskList: headerText === '작업' || headerText === 'Tasks',
      modelFound: modelMatch ? modelMatch[0] : null,
      textareaCount: textareas.length,
      textareas: Array.from(textareas).map(t => ({
        class: t.className?.substring(0, 200),
        placeholder: t.placeholder?.substring(0, 200),
        rows: t.rows,
        value: (t.value || '').substring(0, 100),
        rect: (() => { const r = t.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })(),
      })),
      contentEditableCount: contentEditables.length,
      contentEditables: Array.from(contentEditables).slice(0, 5).map(el => ({
        tag: el.tagName?.toLowerCase(),
        class: (el.className && typeof el.className === 'string') ? el.className.substring(0, 200) : null,
        text: (el.textContent || '').trim().substring(0, 100),
        placeholder: el.getAttribute('data-placeholder')?.substring(0, 100),
      })),
      chatInputCandidates: Array.from(chatInputCandidates).slice(0, 5).map(el => ({
        tag: el.tagName?.toLowerCase(),
        class: (el.className && typeof el.className === 'string') ? el.className.substring(0, 200) : null,
        placeholder: el.getAttribute('placeholder') || el.getAttribute('data-placeholder'),
      })),
      messageContainers: messageContainers.slice(0, 15),
      modelCandidates: Array.from(modelCandidates).slice(0, 5).map(el => ({
        tag: el.tagName?.toLowerCase(),
        class: (el.className && typeof el.className === 'string') ? el.className.substring(0, 200) : null,
        text: (el.textContent || '').trim().substring(0, 100),
      })),
      conversationButtons: Array.from(roleButtons).slice(0, 5).map(b => ({
        class: (b.className && typeof b.className === 'string') ? b.className.substring(0, 200) : null,
        text: (b.textContent || '').trim().substring(0, 150),
      })),
    });
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e) });
  }
})()
