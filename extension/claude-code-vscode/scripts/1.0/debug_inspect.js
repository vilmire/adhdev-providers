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
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    return JSON.stringify({
      title: normalize(doc.querySelector('button.titleText_aqhumA, .titleText_aqhumA, .titleTextInner_aqhumA')?.textContent || doc.title || ''),
      bodyText: String(doc.body?.innerText || '').slice(0, 3000),
      buttons: Array.from(doc.querySelectorAll('button,[role="button"]')).map((el) => ({
        text: normalize(el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || ''),
        visible: visible(el),
        cls: String(el.className || '').slice(0, 120),
      })).filter((x) => x.text || x.visible),
      textboxes: Array.from(doc.querySelectorAll('[role="textbox"],textarea,input')).map((el) => ({
        tag: el.tagName.toLowerCase(),
        text: normalize(el.innerText || el.textContent || el.value || ''),
        visible: visible(el),
        cls: String(el.className || '').slice(0, 120),
      })),
    });
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e) });
  }
})();
