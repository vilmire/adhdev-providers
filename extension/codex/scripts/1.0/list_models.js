/**
 * Codex Extension — list_models
 *
 * Opens the model selector dropdown and reads the available models.
 * Supports hosted Codex webviews where the picker lives in the outer document
 * and renders as either a Radix menu or listbox-style popover.
 */
(() => {
  try {
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

    function readOptions(picker, currentModel) {
      return Array.from(
        picker.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="option"], div[class*="cursor-interaction"]'),
      )
        .map((item) => getText(item))
        .filter((text) => text && text.length > 0 && text.length < 80 && !/^select\s+model$/i.test(text) && !/^model$/i.test(text))
        .map((name) => ({ name, selected: name === currentModel }));
    }

    const docs = resolveDocs();
    const modelBtn = findModelButton(docs);
    if (!modelBtn) return JSON.stringify({ error: 'Model selector button not found', models: [], current: '', currentModel: '' });

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

        const models = picker ? readOptions(picker, currentModel) : [];
        ownerDoc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));

        resolve(JSON.stringify({
          currentModel,
          current: currentModel,
          models,
          count: models.length,
        }));
      }, 350);
    });
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e), models: [], current: '', currentModel: '' });
  }
})()
