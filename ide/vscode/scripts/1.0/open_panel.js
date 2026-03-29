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
    const isOpen = () => {
      const panel = document.getElementById('workbench.parts.auxiliarybar');
      const session = document.querySelector('#workbench\\.panel\\.chat .interactive-session, .pane-body.chat-viewpane .interactive-session');
      return !!(panel && isVisible(panel) && session && isVisible(session));
    };

    if (isOpen()) {
      return JSON.stringify({ opened: true });
    }

    const buttons = Array.from(document.querySelectorAll('a[role="button"], button, [role="tab"], .action-item')).filter(isVisible);
    const toggle = buttons.find((el) => {
      const label = [el.getAttribute('aria-label'), el.getAttribute('title'), el.textContent]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      return el.id?.toLowerCase().includes('copilot') || typeof el.className === 'string' && el.className.toLowerCase().includes('copilot') || /copilot chat/.test(label);
    }) || buttons.find((el) => {
      const label = [el.getAttribute('aria-label'), el.getAttribute('title'), el.textContent]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      return /^toggle chat$/.test(label) || /toggle chat|chat view|open chat|^chat$/.test(label);
    });

    if (!toggle) {
      return JSON.stringify({ opened: false, error: 'Chat toggle not found' });
    }

    click(toggle);
    await wait(350);

    return JSON.stringify({ opened: isOpen() });
  } catch (e) {
    return JSON.stringify({ opened: false, error: e.message });
  }
})()
