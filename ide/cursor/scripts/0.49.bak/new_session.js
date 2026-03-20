/**
 * Cursor — new_session
 *
 * 새 채팅/컴포저 버튼 클릭:
 *   a.action-label.codicon-add-two
 *   [aria-label*="New Chat"]
 *   [aria-label*="New Composer"]
 *
 * → { created: true/false }
 */
(() => {
  try {
    const newBtn = [...document.querySelectorAll('a.action-label.codicon-add-two, [aria-label*="New Chat"], [aria-label*="New Composer"]')]
      .find(a => a.offsetWidth > 0);
    if (newBtn) { newBtn.click(); return JSON.stringify({ created: true }); }
    return JSON.stringify({ created: false, error: 'New Chat button not found' });
  } catch(e) {
    return JSON.stringify({ created: false, error: e.message });
  }
})()
