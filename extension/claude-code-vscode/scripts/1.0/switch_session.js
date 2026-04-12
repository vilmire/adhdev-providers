(args = {}) => {
  try {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const wanted = normalize(args.sessionId || args.id || args.title || '');
    const current = normalize(
      document.querySelector('button.titleText_aqhumA, .titleText_aqhumA, .titleTextInner_aqhumA')?.textContent || ''
    );

    if (!wanted) return JSON.stringify({ switched: false, error: 'sessionId/title required' });
    if (current && current.toLowerCase() === wanted.toLowerCase()) {
      return JSON.stringify({ switched: true, title: current });
    }

    const historyButton = document.querySelector('button[aria-label="Session history"]');
    if (historyButton) historyButton.click();

    const options = Array.from(document.querySelectorAll('button, [role="button"], [role="option"], a'))
      .map((el) => ({
        el,
        label: normalize(el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || ''),
      }))
      .filter(({ el, label }) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 8 && rect.height > 8 && !!label;
      });

    const target = options.find(({ label }) => label.toLowerCase() === wanted.toLowerCase())
      || options.find(({ label }) => label.toLowerCase().includes(wanted.toLowerCase()));
    if (!target) {
      return JSON.stringify({ switched: false, error: 'session not found' });
    }

    target.el.click();
    return JSON.stringify({ switched: true, title: target.label });
  } catch (e) {
    return JSON.stringify({ switched: false, error: e.message || String(e) });
  }
}
