async (params) => {
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
    const panelOpen = () => !!document.querySelector('#workbench\\.panel\\.chat .interactive-session, .pane-body.chat-viewpane .interactive-session');

    if (!panelOpen()) {
      const toggle = Array.from(document.querySelectorAll('a[role="button"], button, [role="tab"]')).find((el) => {
        if (!isVisible(el)) return false;
        const label = [el.getAttribute('aria-label'), el.getAttribute('title'), el.textContent].filter(Boolean).join(' ').toLowerCase();
        return /toggle chat|copilot chat|open chat|chat$/.test(label);
      });
      if (toggle) {
        click(toggle);
        await wait(350);
      }
    }

    const container = document.querySelector('.interactive-session .interactive-input-editor') || document.querySelector('.interactive-input-editor');
    const input = document.querySelector('.interactive-session .interactive-input-editor .native-edit-context[role="textbox"]') || document.querySelector('.interactive-input-editor .native-edit-context[role="textbox"]');
    if (!container || !input || !isVisible(input)) {
      return JSON.stringify({ sent: false, error: 'Input box not found' });
    }

    click(container);
    input.focus();
    input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    await wait(100);

    return JSON.stringify({
      sent: false,
      needsTypeAndSend: true,
      selector: '.interactive-session .interactive-input-editor .native-edit-context[role="textbox"]'
    });
  } catch (e) {
    return JSON.stringify({ sent: false, error: e.message });
  }
}
