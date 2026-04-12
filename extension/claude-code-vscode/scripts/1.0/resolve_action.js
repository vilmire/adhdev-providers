(() => {
  try {
    const frame = document.getElementById('active-frame');
    const doc = frame?.contentDocument || frame?.contentWindow?.document || document;
    const action = ${ ACTION };
    const positive = ['approve', 'allow', 'accept', 'continue', 'run', 'yes'];
    const negative = ['reject', 'deny', 'cancel', 'dismiss', 'no'];
    const patterns = action === 'approve' ? positive : negative;

    const buttons = Array.from(doc.querySelectorAll('button'))
      .map((button) => ({
        button,
        label: String(button.textContent || button.getAttribute('aria-label') || button.getAttribute('title') || '')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase(),
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
