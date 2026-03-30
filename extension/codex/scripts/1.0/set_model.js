/**
 * Codex Extension — set_model
 *
 * Opens the model dropdown via pointer events, clicks the target model.
 */
(args = {}) => {
  try {
    const findValue = (source, keys) => {
      if (typeof source === 'string') return source;
      const queue = [source];
      const seen = new Set();
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item || typeof item !== 'object' || seen.has(item)) continue;
        seen.add(item);
        for (const key of keys) {
          if (item[key] != null) return item[key];
        }
        for (const value of Object.values(item)) {
          if (value && typeof value === 'object') queue.push(value);
        }
      }
      return undefined;
    };

    const modelValue = findValue(args, ['model', 'MODEL']);
    const targetModel = modelValue != null ? String(modelValue) : '';

    const buttons = Array.from(document.querySelectorAll('button')).filter(b => b.offsetWidth > 0);
    const modelBtn = buttons.find(b => {
      const text = (b.textContent || '').trim();
      return /^(GPT-|gpt-|o\d|claude-)/i.test(text) && b.getAttribute('aria-haspopup') === 'menu';
    });

    if (!modelBtn) return JSON.stringify({ error: 'Model selector button not found' });

    const currentModel = (modelBtn.textContent || '').trim();
    const desiredModel = targetModel.trim();

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
        const visibleMenus = Array.from(document.querySelectorAll('[role="menu"]')).filter(
          (menu) => menu.offsetWidth > 0 && menu.offsetHeight > 0,
        );
        let menu =
          visibleMenus.find((el) => el.getAttribute('data-state') === 'open') ||
          visibleMenus[0] ||
          null;

        if (!menu) {
          modelBtn.click();
          const retryMenus = Array.from(document.querySelectorAll('[role="menu"]')).filter(
            (el) => el.offsetWidth > 0 && el.offsetHeight > 0,
          );
          menu = retryMenus.find((el) => el.getAttribute('data-state') === 'open') || retryMenus[0] || null;
        }

        if (!menu) {
          return resolve(JSON.stringify({ success: false, error: 'Menu did not open' }));
        }

        const items = menu.querySelectorAll('[role="menuitem"], [role="menuitemradio"], div[class*="cursor-interaction"]');
        let autoCandidate = null;

        for (const item of items) {
          const text = (item.textContent || '').trim();
          if (!autoCandidate && text && text !== currentModel) {
            autoCandidate = item;
          }
          if (desiredModel && (text.toLowerCase() === desiredModel.toLowerCase() ||
              text.toLowerCase().includes(desiredModel.toLowerCase()))) {
            const ir = item.getBoundingClientRect();
            const ix = ir.left + ir.width / 2;
            const iy = ir.top + ir.height / 2;
            item.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: ix, clientY: iy }));
            item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: ix, clientY: iy }));
            item.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: ix, clientY: iy }));
            item.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: ix, clientY: iy }));
            item.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: ix, clientY: iy }));

            return resolve(JSON.stringify({
              success: true,
              previousModel: currentModel,
              selectedModel: text,
            }));
          }
        }

        if (!desiredModel && autoCandidate) {
          const text = (autoCandidate.textContent || '').trim();
          const ir = autoCandidate.getBoundingClientRect();
          const ix = ir.left + ir.width / 2;
          const iy = ir.top + ir.height / 2;
          autoCandidate.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: ix, clientY: iy }));
          autoCandidate.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: ix, clientY: iy }));
          autoCandidate.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: ix, clientY: iy }));
          autoCandidate.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: ix, clientY: iy }));
          autoCandidate.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: ix, clientY: iy }));

          return resolve(JSON.stringify({
            success: true,
            previousModel: currentModel,
            selectedModel: text,
            fallback: true,
          }));
        }

        document.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true
        }));

        const available = Array.from(items)
          .map(el => (el.textContent || '').trim())
          .filter(t => t.length > 0 && t.length < 60 && !t.includes('Select model'));

        resolve(JSON.stringify({
          success: false,
          error: desiredModel ? `Model '${desiredModel}' not found` : 'no alternate model found',
          currentModel,
          available,
        }));
      }, 350);
    });
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e) });
  }
}
