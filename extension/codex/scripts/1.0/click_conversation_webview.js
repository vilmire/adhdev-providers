/**
 * Click the first conversation item to navigate into a chat
 */
(() => {
  try {
    const buttons = document.querySelectorAll('[role="button"]');
    for (const btn of buttons) {
      const text = (btn.textContent || '').trim();
      if (text.includes('hello')) {
        btn.click();
        return JSON.stringify({ clicked: true, text: text.substring(0, 100) });
      }
    }
    // fallback: click first conversation button
    if (buttons.length > 0) {
      const first = buttons[0];
      first.click();
      return JSON.stringify({ clicked: true, text: (first.textContent||'').trim().substring(0, 100), fallback: true });
    }
    return JSON.stringify({ clicked: false, error: 'no conversation items found' });
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
})()
