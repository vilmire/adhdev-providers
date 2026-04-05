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
    const isOpen = () => {
      const auxiliary = document.getElementById('workbench.parts.auxiliarybar');
      const composite = document.getElementById('workbench.panel.chat');
      const session = document.querySelector('.pane-body.chat-viewpane .interactive-session, #workbench\\.panel\\.chat .interactive-session, .interactive-session');
      const input = document.querySelector('.pane-body.chat-viewpane .interactive-input-editor, #workbench\\.panel\\.chat .interactive-input-editor, .interactive-input-editor');
      return !!(
        auxiliary &&
        isVisible(auxiliary) &&
        composite &&
        isVisible(composite) &&
        ((session && isVisible(session)) || (input && isVisible(input)))
      );
    };

    if (isOpen()) {
      return JSON.stringify({ opened: true });
    }

    const buttons = Array.from(document.querySelectorAll('a[role="button"], button, [role="tab"], .action-item, [tabindex="0"]')).filter(isVisible);
    const getLabel = (el) => normalize([el.getAttribute('aria-label'), el.getAttribute('title'), el.textContent].filter(Boolean).join(' '));
    const toggle =
      buttons.find((el) => /(^| )toggle chat( |$)|open chat|copilot chat/.test(getLabel(el))) ||
      buttons.find((el) => /(^| )chat( |$)/.test(getLabel(el)) && /(toggle|open)/.test(getLabel(el))) ||
      buttons.find((el) => getLabel(el) === 'open chat');

    if (!toggle) {
      return JSON.stringify({ opened: false, error: 'Chat toggle not found' });
    }

    click(toggle);
    await wait(400);

    return JSON.stringify({ opened: isOpen() });
  } catch (e) {
    return JSON.stringify({ opened: false, error: e.message });
  }
})()
