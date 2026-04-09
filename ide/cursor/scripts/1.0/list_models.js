/**
 * Cursor — list_models
 *
 * Supports both the older composer dropdown and the newer ui-model-picker menu.
 * When Cursor only exposes the Auto mode row, return that as the sole visible
 * option instead of an empty list so the dashboard can reflect the actual state.
 */
(async () => {
  try {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const isVisible = (el) => !!el && el.offsetWidth > 0 && el.offsetHeight > 0;
    const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const activate = (el) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const clientX = rect.left + rect.width / 2;
      const clientY = rect.top + rect.height / 2;
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
        const Ctor = type.startsWith('pointer') ? PointerEvent : MouseEvent;
        el.dispatchEvent(new Ctor(type, { bubbles: true, clientX, clientY, pointerId: 1 }));
      }
    };

    const currentButton = document.querySelector('.ui-model-picker__trigger')
      || document.querySelector('.composer-unified-dropdown-model');
    if (!isVisible(currentButton)) {
      return JSON.stringify({ models: [], current: '', error: 'Model button not found' });
    }

    let current = normalize(currentButton.textContent || currentButton.getAttribute('aria-label') || '');
    activate(currentButton);
    await sleep(500);

    const menu = document.querySelector('[data-testid="model-picker-menu"]')
      || document.querySelector('.ui-model-picker__menu')
      || document.querySelector('.typeahead-popover');

    if (!isVisible(menu)) {
      return JSON.stringify({
        models: current ? [{ name: current, id: current }] : [],
        current,
        error: 'Model picker menu not found',
      });
    }

    const models = [];
    const seen = new Set();
    const addModel = (name, id, selected) => {
      const normalizedName = normalize(name);
      if (!normalizedName || seen.has(normalizedName)) return;
      seen.add(normalizedName);
      models.push({ name: normalizedName, id: normalize(id || normalizedName) });
      if (selected) current = normalizedName;
    };

    const rows = [...menu.querySelectorAll('[role="menuitemcheckbox"], [role="menuitem"], .composer-unified-context-menu-item')]
      .filter(isVisible);

    for (const row of rows) {
      const testid = row.getAttribute('data-testid') || '';
      const uiTitle = normalize(row.querySelector('.ui-menu__title')?.textContent || '');
      const legacyTitle = normalize(row.querySelector('.monaco-highlighted-label')?.textContent || '');
      const title = uiTitle || legacyTitle || normalize(row.textContent || '');
      const selected =
        row.getAttribute('aria-checked') === 'true'
        || row.getAttribute('data-is-selected') === 'true'
        || row.getAttribute('data-checked') === 'true';

      if (testid === 'auto-mode-toggle') {
        addModel(title || 'Auto', 'Auto', selected || title === current);
        continue;
      }

      if (!title || title === 'Add Models' || /balanced quality and speed/i.test(title)) continue;
      const hasBrain = !!row.querySelector('[class*="codicon-br"]');
      addModel(hasBrain ? `${title} 🧠` : title, hasBrain ? `${title} 🧠` : title, selected);
    }

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return JSON.stringify({ models, current });
  } catch (e) {
    return JSON.stringify({ models: [], current: '', error: e.message });
  }
})()
