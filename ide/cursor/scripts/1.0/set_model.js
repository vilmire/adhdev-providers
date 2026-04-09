/**
 * Cursor — set_model
 *
 * Works with both legacy composer menus and the newer ui-model-picker menu.
 * If the UI only exposes Auto, report that clearly instead of pretending the
 * target model was selectable.
 */
async (params) => {
  try {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const isVisible = (el) => !!el && el.offsetWidth > 0 && el.offsetHeight > 0;
    const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
    const target = normalize(params?.model || '');
    if (!target) return JSON.stringify({ success: false, error: 'model is required' });

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
      return JSON.stringify({ success: false, error: 'Model button not found' });
    }

    const current = normalize(currentButton.textContent || currentButton.getAttribute('aria-label') || '');
    if (current && current.toLowerCase() === target.toLowerCase()) {
      return JSON.stringify({ success: true, model: current });
    }

    activate(currentButton);
    await sleep(500);

    const menu = document.querySelector('[data-testid="model-picker-menu"]')
      || document.querySelector('.ui-model-picker__menu')
      || document.querySelector('.typeahead-popover');
    if (!isVisible(menu)) {
      return JSON.stringify({ success: false, error: 'Model picker menu not found' });
    }

    const rows = [...menu.querySelectorAll('[role="menuitemcheckbox"], [role="menuitem"], .composer-unified-context-menu-item')]
      .filter(isVisible);

    const trySelect = (matchText) => {
      for (const row of rows) {
        const testid = row.getAttribute('data-testid') || '';
        const uiTitle = normalize(row.querySelector('.ui-menu__title')?.textContent || '');
        const legacyTitle = normalize(row.querySelector('.monaco-highlighted-label')?.textContent || '');
        const title = uiTitle || legacyTitle || normalize(row.textContent || '');
        if (!title) continue;

        if (testid === 'auto-mode-toggle') {
          if (matchText.toLowerCase() === 'auto') {
            const switchBtn = row.querySelector('button.ui-toggle[role="switch"]');
            if (switchBtn && switchBtn.getAttribute('aria-checked') !== 'true') {
              activate(switchBtn);
            } else {
              activate(row);
            }
            return { success: true, model: 'Auto' };
          }
          continue;
        }

        const hasBrain = !!row.querySelector('[class*="codicon-br"]');
        const displayName = hasBrain ? `${title} 🧠` : title;
        if (displayName.toLowerCase() === matchText.toLowerCase() || title.toLowerCase() === matchText.toLowerCase()) {
          activate(row);
          return { success: true, model: displayName };
        }
      }
      return null;
    };

    const selected = trySelect(target);
    if (selected) {
      await sleep(250);
      return JSON.stringify(selected);
    }

    const visibleChoices = rows
      .map((row) => {
        const testid = row.getAttribute('data-testid') || '';
        if (testid === 'auto-mode-toggle') return 'Auto';
        return normalize(row.querySelector('.ui-menu__title')?.textContent || row.querySelector('.monaco-highlighted-label')?.textContent || row.textContent || '');
      })
      .filter(Boolean);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    if (visibleChoices.length === 1 && visibleChoices[0] === 'Auto') {
      return JSON.stringify({ success: false, error: 'Only Auto is exposed in the current Cursor model picker' });
    }
    return JSON.stringify({ success: false, error: `model not found: ${target}` });
  } catch (e) {
    return JSON.stringify({ success: false, error: e.message });
  }
}
