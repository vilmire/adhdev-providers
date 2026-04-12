(() => {
  try {
    const frame = document.getElementById('active-frame');
    const doc = frame?.contentDocument || frame?.contentWindow?.document || document;
    const view = doc.defaultView || window;
    const input = doc.querySelector('[role="textbox"].messageInput_cKsPxg');
    if (!input) return JSON.stringify({ success: false, error: 'input not found' });

    input.focus();
    const selection = view.getSelection();
    const clearRange = doc.createRange();
    clearRange.selectNodeContents(input);
    selection.removeAllRanges();
    selection.addRange(clearRange);
    try {
      doc.execCommand('delete', false);
    } catch {}
    input.textContent = '';
    input.dispatchEvent(new view.InputEvent('input', {
      bubbles: true,
      inputType: 'deleteContentBackward',
      data: null,
    }));
    input.dispatchEvent(new view.Event('change', { bubbles: true }));
    return JSON.stringify({ success: true });
  } catch (e) {
    return JSON.stringify({ success: false, error: e.message || String(e) });
  }
})();
