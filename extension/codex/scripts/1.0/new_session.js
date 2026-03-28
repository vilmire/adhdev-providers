/**
 * Codex Extension — new_session
 * Clicks the "New chat" / "New chat" button
 */
(() => {
  try {
    const buttons = Array.from(document.querySelectorAll('button')).filter(b => b.offsetWidth > 0);
    const newChatBtn = buttons.find(b => {
      const label = (b.getAttribute('aria-label') || '').toLowerCase();
      return label.includes('New chat') || label.includes('new chat') || label.includes('new');
    });

    if (newChatBtn) {
      newChatBtn.click();
      return JSON.stringify({ success: true, action: 'new_session' });
    }

    return JSON.stringify({
      success: false,
      error: 'New chat button not found',
      available: buttons.map(b => b.getAttribute('aria-label')).filter(Boolean),
    });
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e) });
  }
})()
