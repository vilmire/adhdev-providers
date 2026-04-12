(() => {
  try {
    const frame = document.getElementById('active-frame');
    const doc = frame?.contentDocument || frame?.contentWindow?.document || document;
    const view = doc.defaultView || window;
    const input = doc.querySelector('[role="textbox"].messageInput_cKsPxg');
    if (!input) return 'no input';

    input.focus();
    const selection = view.getSelection();
    const range = doc.createRange();
    range.selectNodeContents(input);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    return 'focused';
  } catch (e) {
    return 'error: ' + (e.message || String(e));
  }
})();
