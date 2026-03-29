(() => {
  try {
    const isVisible = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const click = (el) => {
      if (!el) return false;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      el.click();
      return true;
    };

    const target = [
      '#workbench.parts.editor .monaco-editor .native-edit-context[role="textbox"]',
      '#workbench.parts.editor textarea.inputarea',
      '#workbench.parts.editor .editor-instance',
      '#workbench.parts.editor .editor-group-container',
      '#workbench.parts.editor'
    ]
      .map((selector) => document.querySelector(selector))
      .find(isVisible);

    if (!target) {
      return JSON.stringify({ focused: false, error: 'Editor not found' });
    }

    click(target);
    if (typeof target.focus === 'function') {
      target.focus();
    }

    return JSON.stringify({ focused: true });
  } catch (e) {
    return JSON.stringify({ focused: false, error: e.message });
  }
})()
