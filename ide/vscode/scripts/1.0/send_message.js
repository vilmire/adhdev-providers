async (params) => {
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
    const panelOpen = () => {
      const auxiliary = document.getElementById('workbench.parts.auxiliarybar');
      const composite = document.getElementById('workbench.panel.chat');
      const input = document.querySelector('.interactive-session .interactive-input-editor .native-edit-context[role="textbox"], .interactive-input-editor .native-edit-context[role="textbox"]');
      return !!(auxiliary && composite && isVisible(auxiliary) && isVisible(composite) && input && isVisible(input));
    };

    if (!panelOpen()) {
      const toggle = Array.from(document.querySelectorAll('a[role="button"], button, [role="tab"], [tabindex="0"]')).find((el) => {
        if (!isVisible(el)) return false;
        const label = normalize([el.getAttribute('aria-label'), el.getAttribute('title'), el.textContent].filter(Boolean).join(' '));
        return /toggle chat|open chat|copilot chat/.test(label);
      });
      if (toggle) {
        click(toggle);
        await wait(400);
      }
    }

    const container = document.querySelector('.interactive-session .interactive-input-editor') || document.querySelector('.interactive-input-editor');
    const input = document.querySelector('.interactive-session .interactive-input-editor .native-edit-context[role="textbox"]') || document.querySelector('.interactive-input-editor .native-edit-context[role="textbox"]');
    if (!container || !input || !isVisible(input)) {
      return JSON.stringify({ sent: false, error: 'Input box not found' });
    }

    click(container);
    click(input);
    if (typeof input.focus === 'function') {
      input.focus();
    }
    input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    await wait(120);

    return JSON.stringify({
      sent: false,
      needsTypeAndSend: true,
      selector: '.interactive-session .interactive-input-editor .native-edit-context[role="textbox"]'
    });
  } catch (e) {
    return JSON.stringify({ sent: false, error: e.message });
  }
}
