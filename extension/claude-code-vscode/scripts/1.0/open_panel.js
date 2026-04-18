(() => {
  try {
    const frame = document.getElementById('active-frame');
    const doc = frame?.contentDocument || frame?.contentWindow?.document || document;
    const view = doc.defaultView || window;
    const visible = (el) => {
      if (!el || el.closest('[inert]')) return false;
      const rect = el.getBoundingClientRect();
      const style = (el.ownerDocument?.defaultView || view).getComputedStyle(el);
      return rect.width > 8 && rect.height > 8 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const root = doc.getElementById('root') || doc.body;
    const hasVisibleUi = [
      root,
      ...Array.from(doc.querySelectorAll([
        '.messagesContainer_07S1Yg',
        '.message_07S1Yg',
        '.newSessionButton_djirOA',
        '.sessionItem_OOQiHg',
        '.tab_OOQiHg',
        '[role="textbox"]',
        'input',
        'textarea',
        'button',
        '[role="button"]'
      ].join(',')))
    ].some(visible);
    return hasVisibleUi ? 'visible' : 'panel_hidden';
  } catch (e) {
    return 'error: ' + (e.message || String(e));
  }
})();
