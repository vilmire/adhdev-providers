(() => {
  try {
    const input = document.querySelector('[role="textbox"].messageInput_cKsPxg');
    if (!input) return 'no input';

    input.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(input);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    return 'focused';
  } catch (e) {
    return 'error: ' + (e.message || String(e));
  }
})();
