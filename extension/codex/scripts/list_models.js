/**
 * Codex Extension — list_models
 *
 * Opens the model selector dropdown via pointer events,
 * reads available models from the Radix menu, then closes.
 */
(() => {
  try {
    const buttons = Array.from(document.querySelectorAll('button')).filter(b => b.offsetWidth > 0);
    const modelBtn = buttons.find(b => {
      const text = (b.textContent || '').trim();
      return /^(GPT-|gpt-|o\d|claude-)/i.test(text) && b.getAttribute('aria-haspopup') === 'menu';
    });

    if (!modelBtn) return JSON.stringify({ error: 'Model selector button not found' });

    const currentModel = (modelBtn.textContent || '').trim();

    // Open dropdown with full pointer event sequence (required for Radix)
    const rect = modelBtn.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    modelBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y }));
    modelBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
    modelBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y }));
    modelBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
    modelBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));

    return new Promise((resolve) => {
      setTimeout(() => {
        // Read menu items
        const menu = document.querySelector('[role="menu"][data-state="open"]');
        const models = [];
        if (menu) {
          const items = menu.querySelectorAll('[role="menuitem"], [role="menuitemradio"], div[class*="cursor-interaction"]');
          for (const item of items) {
            const text = (item.textContent || '').trim();
            if (text && text.length > 0 && text.length < 60 && !text.includes('모델 선택') && !text.includes('Model')) {
              models.push({
                name: text,
                selected: text === currentModel,
              });
            }
          }
        }

        // Close dropdown
        document.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true
        }));

        resolve(JSON.stringify({
          currentModel,
          models,
          count: models.length,
        }));
      }, 500);
    });
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e) });
  }
})()
