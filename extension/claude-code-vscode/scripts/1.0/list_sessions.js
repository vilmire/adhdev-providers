(() => {
  try {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const title = normalize(
      document.querySelector('button.titleText_aqhumA, .titleText_aqhumA, .titleTextInner_aqhumA')?.textContent || ''
    );

    if (!title || /^new session$/i.test(title)) {
      return JSON.stringify({ sessions: [] });
    }

    return JSON.stringify({
      sessions: [{ id: title, title }],
    });
  } catch (e) {
    return JSON.stringify({ sessions: [], error: e.message || String(e) });
  }
})();
