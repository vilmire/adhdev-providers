/**
 * Codex Extension — set_model
 *
 * Opens the model dropdown and selects the requested model.
 * Supports hosted Codex webviews where the picker is rendered as either a
 * menu or listbox-style popover.
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

    const targetModel = String(findValue(args, ['model', 'MODEL', 'value']) ?? '').trim();

    function getText(el) {
      if (!el) return '';
      return ((el.textContent || '').trim() || (el.getAttribute('aria-label') || '').trim()).replace(/\s+/g, ' ');
    }

    function isVisible(el) {
      if (!el || el.closest?.('[inert]')) return false;
      const rect = el.getBoundingClientRect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0) return false;
      const style = el.ownerDocument?.defaultView?.getComputedStyle?.(el);
      if (style && (style.visibility === 'hidden' || style.display === 'none' || style.pointerEvents === 'none')) {
        return false;
      }
      return true;
    }

    function clickElement(el) {
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
    }

    function resolveDocs() {
      const docs = [];
      const addDoc = (candidate) => {
        if (candidate && !docs.includes(candidate)) docs.push(candidate);
      };
      addDoc(document);
      for (const iframe of document.querySelectorAll('iframe')) {
        try {
          addDoc(iframe.contentDocument || iframe.contentWindow?.document);
        } catch (e) {
          // ignore cross-origin frames
        }
      }
      return docs;
    }

    function findModelButton(docs) {
      for (const doc of docs) {
        const buttons = Array.from(doc.querySelectorAll('button[aria-haspopup="menu"]')).filter(isVisible);
        const directMatch = buttons.find((button) => /^(GPT-|gpt-|o\d|claude-|sonnet|opus)/i.test(getText(button)));
        if (directMatch) return directMatch;
      }
      return null;
    }

    function findOpenPicker(doc) {
      const candidates = [
        ...Array.from(doc.querySelectorAll('[role="menu"][data-state="open"], [role="listbox"][data-state="open"]')),
        ...Array.from(doc.querySelectorAll('[role="menu"], [role="listbox"]')).filter(isVisible),
      ];
      return candidates.find(isVisible) || null;
    }

    function readItems(picker) {
      return Array.from(
        picker.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="option"], div[class*="cursor-interaction"]'),
      )
        .map((item) => ({ el: item, text: getText(item) }))
        .filter(({ text }) => text && text.length > 0 && text.length < 80 && !/^select\s+model$/i.test(text) && !/^model$/i.test(text));
    }

    const docs = resolveDocs();
    const modelBtn = findModelButton(docs);
    if (!modelBtn) return JSON.stringify({ success: false, error: 'Model selector button not found' });

    const currentModel = getText(modelBtn);
    clickElement(modelBtn);

    return new Promise((resolve) => {
      setTimeout(() => {
        const ownerDoc = modelBtn.ownerDocument || document;
        let picker = findOpenPicker(ownerDoc) || docs.map(findOpenPicker).find(Boolean) || null;
        if (!picker) {
          modelBtn.click?.();
          picker = findOpenPicker(ownerDoc) || docs.map(findOpenPicker).find(Boolean) || null;
        }

        if (!picker) {
          resolve(JSON.stringify({ success: false, error: 'Menu did not open' }));
          return;
        }

        const items = readItems(picker);
        const targetLower = targetModel.toLowerCase();
        const match = targetModel
          ? items.find(({ text }) => text.toLowerCase() === targetLower || text.toLowerCase().includes(targetLower)) || null
          : items.find(({ text }) => text !== currentModel) || null;

        if (!match) {
          ownerDoc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
          resolve(JSON.stringify({
            success: false,
            error: targetModel ? `Model '${targetModel}' not found` : 'no alternate model found',
            currentModel,
            available: items.map(({ text }) => text),
          }));
          return;
        }

        clickElement(match.el);
        setTimeout(() => {
          resolve(JSON.stringify({
            success: true,
            previousModel: currentModel,
            selectedModel: match.text,
            model: match.text,
            currentValue: match.text,
            changed: match.text !== currentModel,
          }));
        }, 180);
      }, 320);
    });
  } catch (e) {
    return JSON.stringify({ success: false, error: e.message || String(e) });
  }
}
