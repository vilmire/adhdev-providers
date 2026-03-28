/**
 * Cursor — open_panel
 *
 * chat/ panel open:
 *   1. If already visible 'visible' Return
 *   2. Find and click Agent/Chat/Composer tab
 */
(() => {
  try {
    const sidebar = document.getElementById('workbench.parts.auxiliarybar');
    if (sidebar && sidebar.offsetWidth > 0) {
      const chatView = document.querySelector('[data-composer-id]');
      if (chatView) return JSON.stringify({ opened: true });
    }
    const btns = [...document.querySelectorAll('li.action-item a, button, [role="tab"]')];
    const toggle = btns.find(b => {
      const label = (b.textContent || b.getAttribute('aria-label') || '').toLowerCase();
      return /agent|chat|composer|cursor tab/i.test(label);
    });
    if (toggle) { toggle.click(); return JSON.stringify({ opened: true }); }
    return JSON.stringify({ opened: false, error: 'Panel toggle not found' });
  } catch (e) { return JSON.stringify({ opened: false, error: e.message }); }
})()
