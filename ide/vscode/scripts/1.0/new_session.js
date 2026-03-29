;(async () => {
  try {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const isVisible = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const click = (el) => {
      if (!el) return false;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      el.click();
      return true;
    };

    const button = Array.from(document.querySelectorAll('.agent-sessions-new-button-container [role="button"], .agent-sessions-new-button-container .monaco-button, a[role="button"], button'))
      .filter(isVisible)
      .find((el) => {
        const label = [el.getAttribute('aria-label'), el.getAttribute('title'), el.textContent].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
        return /new session|new chat/.test(label);
      });

    if (!button) {
      return JSON.stringify({ created: false, error: 'New session button not found' });
    }

    click(button);
    await wait(250);

    return JSON.stringify({ created: true });
  } catch (e) {
    return JSON.stringify({ created: false, error: e.message });
  }
})()
