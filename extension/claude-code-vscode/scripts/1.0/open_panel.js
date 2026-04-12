(() => {
  try {
    const root = document.getElementById('root') || document.body;
    if (!root) return 'panel_hidden';
    const rect = root.getBoundingClientRect();
    if (rect.width > 8 && rect.height > 8) return 'visible';
    return 'panel_hidden';
  } catch (e) {
    return 'error: ' + (e.message || String(e));
  }
})();
