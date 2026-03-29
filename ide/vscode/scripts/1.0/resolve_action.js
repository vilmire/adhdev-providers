async (params) => {
  try {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const isVisible = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const normalize = (value) => (value || '').replace(/[⏎↵]/g, '').replace(/\s+/g, ' ').trim();
    const click = (el) => {
      if (!el) return false;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      el.click();
      return true;
    };

    const action = normalize(params?.action || '').toLowerCase();
    const want = normalize(params?.buttonText || params?.action || params?.button || '').toLowerCase();
    const buttons = Array.from(document.querySelectorAll('.interactive-session button, .interactive-session [role="button"], .context-view button, .context-view [role="button"], .monaco-button, a[role="button"]'))
      .filter(isVisible)
      .map((el) => ({
        el,
        label: normalize(el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent)
      }))
      .filter((item) => item.label && item.label.length <= 80);

    const aliases = {
      approve: ['accept', 'approve', 'allow', 'continue', 'run'],
      reject: ['reject', 'deny', 'block', 'skip', 'cancel']
    };
    const candidates = aliases[action] || [want];
    const target =
      buttons.find((item) => item.label.toLowerCase() === want) ||
      buttons.find((item) => candidates.some((candidate) => item.label.toLowerCase() === candidate || item.label.toLowerCase().includes(candidate))) ||
      buttons.find((item) => item.label.toLowerCase().includes(want));

    if (!target) {
      return JSON.stringify({ resolved: false, available: buttons.map((item) => item.label).slice(0, 20) });
    }

    click(target.el);
    await wait(200);

    return JSON.stringify({ resolved: true, clicked: target.label });
  } catch (e) {
    return JSON.stringify({ resolved: false, error: e.message });
  }
}
