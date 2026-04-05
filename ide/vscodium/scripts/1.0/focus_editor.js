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
      try {
        el.scrollIntoView({ block: 'center', inline: 'center' });
      } catch (_) {}
      el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, composed: true }));
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, composed: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
      return true;
    };

    const editorPart = document.getElementById('workbench.parts.editor');
    if (!isVisible(editorPart)) {
      return JSON.stringify({ focused: false, error: 'Editor not found' });
    }

    const target = [
      editorPart.querySelector('.editor-group-container.active .monaco-editor .native-edit-context[role="textbox"]'),
      editorPart.querySelector('.editor-group-container.active textarea.inputarea'),
      editorPart.querySelector('.editor-group-container.active .editor-instance'),
      editorPart.querySelector('.editor-group-container.active'),
      editorPart.querySelector('.editor-group-container'),
      editorPart
    ].find(isVisible);

    if (!target) {
      return JSON.stringify({ focused: false, error: 'Editor target not found' });
    }

    click(target);
    if (typeof target.focus === 'function') {
      target.focus();
    }

    const active = document.activeElement;
    const focused = !!(
      active &&
      (target === active || target.contains(active) || editorPart.contains(active) || active === document.body)
    );

    return JSON.stringify({ focused });
  } catch (e) {
    return JSON.stringify({ focused: false, error: e.message });
  }
})()
