;(async () => {
  try {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const isVisible = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const click = (el) => {
      if (!el) return false;
      try {
        el.scrollIntoView({ block: 'center', inline: 'center' });
      } catch (_) {}
      el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, composed: true }));
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, composed: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
      return true;
    };
    const before = Array.from(document.querySelectorAll('.interactive-session .monaco-list-row.request, .interactive-session .monaco-list-row.response')).length;

    const button = Array.from(document.querySelectorAll('a[role="button"], button, [role="button"]'))
      .filter(isVisible)
      .find((el) => /new chat|new session/.test(normalize([el.getAttribute('aria-label'), el.getAttribute('title'), el.textContent].filter(Boolean).join(' '))));

    if (!button) {
      return JSON.stringify({ created: false, error: 'New session button not found' });
    }

    click(button);
    await wait(400);

    const after = Array.from(document.querySelectorAll('.interactive-session .monaco-list-row.request, .interactive-session .monaco-list-row.response')).length;
    const input = document.querySelector('.interactive-session .interactive-input-editor .native-edit-context[role="textbox"]');

    return JSON.stringify({ created: !!input && (after !== before || document.contains(input)) });
  } catch (e) {
    return JSON.stringify({ created: false, error: e.message });
  }
})()
