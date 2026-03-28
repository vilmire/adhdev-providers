/**
 * Cursor — list_models
 *
 * model list extract:
 *   button: .composer-unified-dropdown-model
 * : [data-testid="model-picker-menu"]
 * : .composer-unified-context-menu-item
 *   model name: .monaco-highlighted-label
 *   Think mode: codicon-br (brain) icon
 *   Auto toggle: rounded-full 24x14 element
 *
 * → { models[], current }
 */
(async () => {
  try {
    let current = '';
    const models = [];

    const modelBtn = document.querySelector('.composer-unified-dropdown-model');
    if (modelBtn) {
      current = modelBtn.textContent?.trim() || '';
    }

    // Open dropdown
    if (modelBtn) {
      modelBtn.click();
      await new Promise(r => setTimeout(r, 500));

      const menu = document.querySelector('[data-testid="model-picker-menu"]');
      if (menu) {
 // Auto toggle Check turn off
        const autoItem = menu.querySelector('.composer-unified-context-menu-item[data-is-selected="true"]');
        const autoToggle = autoItem ? [...autoItem.querySelectorAll('[class*="rounded-full"]')].find(el => el.offsetWidth === 24 && el.offsetHeight === 14) : null;
        let wasAutoOn = false;
        if (autoToggle) {
          const bgStyle = autoToggle.getAttribute('style') || '';
          wasAutoOn = bgStyle.includes('green');
          if (wasAutoOn) {
            autoToggle.click();
            await new Promise(r => setTimeout(r, 500));
          }
        }

 // Model list (Auto turned off state)
        const refreshedMenu = document.querySelector('[data-testid="model-picker-menu"]');
        if (refreshedMenu) {
          const items = refreshedMenu.querySelectorAll('.composer-unified-context-menu-item');
          for (const item of items) {
            const nameEl = item.querySelector('.monaco-highlighted-label');
            const name = nameEl?.textContent?.trim() || '';
            if (name && name !== 'Add Models') {
              const hasBrain = !!item.querySelector('[class*="codicon-br"]');
              const displayName = hasBrain ? name + ' 🧠' : name;
              models.push({ name: displayName, id: displayName });
              if (item.getAttribute('data-is-selected') === 'true') current = displayName;
            }
          }
        }

        // Auto Turn on again (restore original state)
        if (wasAutoOn) {
          const newMenu = document.querySelector('[data-testid="model-picker-menu"]');
          const newAutoItem = newMenu?.querySelector('.composer-unified-context-menu-item');
          const newToggle = newAutoItem ? [...newAutoItem.querySelectorAll('[class*="rounded-full"]')].find(el => el.offsetWidth === 24) : null;
          if (newToggle) {
            newToggle.click();
            await new Promise(r => setTimeout(r, 200));
          }
        }
      }

      // close (Escape)
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }

    return JSON.stringify({ models, current });
  } catch(e) { return JSON.stringify({ models: [], current: '', error: e.message }); }
})()
