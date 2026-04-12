(() => {
  try {
    const input = document.querySelector('[role="textbox"].messageInput_cKsPxg');
    if (!input) return JSON.stringify({ success: false, error: 'input not found' });

    input.focus();
    const selection = window.getSelection();
    const clearRange = document.createRange();
    clearRange.selectNodeContents(input);
    selection.removeAllRanges();
    selection.addRange(clearRange);
    try {
      document.execCommand('delete', false);
    } catch {}
    input.textContent = '';
    input.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'deleteContentBackward',
      data: null,
    }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return JSON.stringify({ success: true });
  } catch (e) {
    return JSON.stringify({ success: false, error: e.message || String(e) });
  }
})();
