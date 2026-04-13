(async () => {
  try {
    const frame = document.getElementById('active-frame');
    const doc = frame?.contentDocument || frame?.contentWindow?.document || document;
    const view = doc.defaultView || window;
    const action = ${ ACTION };
    const buttonText = ${ BUTTON_TEXT };

    // If buttonText starts with a number, type it in the input and submit
    const numMatch = String(buttonText || '').match(/^(\d+)/);
    if (numMatch) {
      const input = doc.querySelector('[role="textbox"].messageInput_cKsPxg');
      const sendButton = doc.querySelector('button.sendButton_gGYT1w');
      if (!input || !sendButton) return false;

      const num = numMatch[1];
      input.focus();

      const selection = view.getSelection();
      const range = doc.createRange();
      range.selectNodeContents(input);
      selection.removeAllRanges();
      selection.addRange(range);
      try { doc.execCommand('delete', false); } catch {}
      input.dispatchEvent(new view.InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward', data: null }));

      let inserted = false;
      try { inserted = doc.execCommand('insertText', false, num); } catch {}
      if (!inserted) input.textContent = num;

      input.dispatchEvent(new view.InputEvent('input', { bubbles: true, inputType: 'insertText', data: num }));
      input.dispatchEvent(new view.Event('change', { bubbles: true }));

      await new Promise((resolve) => setTimeout(resolve, 80));

      if (sendButton.disabled) return false;
      sendButton.click();
      return true;
    }

    // Fallback: find and click matching HTML button
    const positive = ['approve', 'allow', 'accept', 'continue', 'run', 'yes'];
    const negative = ['reject', 'deny', 'cancel', 'dismiss', 'no'];
    const patterns = action === 'approve' ? positive : negative;

    const buttons = Array.from(doc.querySelectorAll('button'))
      .map((button) => ({
        button,
        label: String(button.textContent || button.getAttribute('aria-label') || button.getAttribute('title') || '')
          .replace(/\s+/g, ' ').trim().toLowerCase(),
      }))
      .filter(({ button, label }) => {
        const rect = button.getBoundingClientRect();
        return rect.width > 8 && rect.height > 8 && !!label;
      });

    const match = buttons.find(({ label }) => patterns.some((pattern) => label === pattern || label.includes(pattern)));
    if (!match) return false;

    match.button.click();
    return true;
  } catch {
    return false;
  }
})();
