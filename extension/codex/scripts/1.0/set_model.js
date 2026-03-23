/**
 * Codex Extension — set_model
 *
 * Opens the model dropdown via pointer events, clicks the target model.
 *
 * Placeholder: ${MODEL}
 */
(() => {
  try {
    const targetModel = ${MODEL};

    const buttons = Array.from(document.querySelectorAll('button')).filter(b => b.offsetWidth > 0);
    const modelBtn = buttons.find(b => {
      const text = (b.textContent || '').trim();
      return /^(GPT-|gpt-|o\d|claude-)/i.test(text) && b.getAttribute('aria-haspopup') === 'menu';
    });

    if (!modelBtn) return JSON.stringify({ error: 'Model selector button not found' });

    const currentModel = (modelBtn.textContent || '').trim();

    // Open dropdown with PointerEvent sequence
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
        const menu = document.querySelector('[role="menu"][data-state="open"]');
        if (!menu) {
          resolve(JSON.stringify({ success: false, error: 'Menu did not open' }));
          return;
        }

        // Find all clickable items in the menu
        const items = menu.querySelectorAll('[role="menuitem"], [role="menuitemradio"], div[class*="cursor-interaction"]');
        
        for (const item of items) {
          const text = (item.textContent || '').trim();
          if (text.toLowerCase() === targetModel.toLowerCase() ||
              text.toLowerCase().includes(targetModel.toLowerCase())) {
            // Click with pointer events
            const ir = item.getBoundingClientRect();
            const ix = ir.left + ir.width / 2;
            const iy = ir.top + ir.height / 2;
            item.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: ix, clientY: iy }));
            item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: ix, clientY: iy }));
            item.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: ix, clientY: iy }));
            item.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: ix, clientY: iy }));
            item.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: ix, clientY: iy }));
            
            resolve(JSON.stringify({
              success: true,
              previousModel: currentModel,
              selectedModel: text,
            }));
            return;
          }
        }

        // Not found — close and report
        document.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true
        }));

        const available = Array.from(items)
          .map(el => (el.textContent || '').trim())
          .filter(t => t.length > 0 && t.length < 60 && !t.includes('모델 선택'));

        resolve(JSON.stringify({
          success: false,
          error: `Model '${targetModel}' not found`,
          currentModel,
          available,
        }));
      }, 500);
    });
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e) });
  }
})()
