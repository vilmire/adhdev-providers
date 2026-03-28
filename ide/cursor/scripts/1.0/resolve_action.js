/**
 * Cursor — resolve_action
 *
 * approval/ button search + click:
 * button, [role="button"], .cursor-pointer text matching
 * Cursor (e.g. "Run⏎", "SkipEsc") → ⏎↵ remove then compare
 *
 * params.buttonText: string — to find button text
 * → { resolved: true/false, clicked?, available? }
 */
(params) => {
  try {
    const btns = [...document.querySelectorAll('button, [role="button"], .cursor-pointer')].filter(b => b.offsetWidth > 0);
    const searchText = (params.buttonText || params.action || params.button || '').toLowerCase();
    const target = btns.find(b => (b.textContent||'').trim().replace(/[⏎↵]/g, '').trim().toLowerCase().includes(searchText));
    if (target) { target.click(); return JSON.stringify({ resolved: true, clicked: target.textContent.trim() }); }
    return JSON.stringify({ resolved: false, available: btns.map(b => b.textContent.trim()).filter(Boolean).slice(0, 15) });
  } catch(e) { return JSON.stringify({ resolved: false, error: e.message }); }
}
