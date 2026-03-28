/**
 * Cursor — set_mode
 *
 * Select target mode from mode dropdown:
 *   1. Open dropdown
 *   2. Click matching item
 *
 * params.mode: string — Mode name
 * → { success: true/false, mode? }
 */
async (params) => {
  try {
    const target = params.mode;

    const modeBtn = document.querySelector('.composer-unified-dropdown:not(.composer-unified-dropdown-model)');
    if (!modeBtn) return JSON.stringify({ success: false, error: 'Mode button not found' });

    modeBtn.click();
    await new Promise(r => setTimeout(r, 500));

    const menu = document.querySelector('[data-testid="model-picker-menu"]') || document.querySelector('.typeahead-popover');
    if (!menu) return JSON.stringify({ success: false, error: 'Mode menu not found' });

    const items = menu.querySelectorAll('.composer-unified-context-menu-item');
    for (const item of items) {
      const nameEl = item.querySelector('.monaco-highlighted-label');
      const name = nameEl?.textContent?.trim() || '';
      if (name && (name === target || name.toLowerCase() === target.toLowerCase())) {
        item.click();
        await new Promise(r => setTimeout(r, 200));
        return JSON.stringify({ success: true, mode: name });
      }
    }

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return JSON.stringify({ success: false, error: 'mode not found: ' + target });
  } catch(e) { return JSON.stringify({ success: false, error: e.message }); }
}
