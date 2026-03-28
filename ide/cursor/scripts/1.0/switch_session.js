/**
 * Cursor — switch_session
 *
 * by clicking Switch session:
 *   title matching (params.title) or index (params.index)
 *
 * params.index: number, params.title: string|null
 * → { switched: true/false, title?, error? }
 */
(params) => {
  try {
    const cells = [...document.querySelectorAll('.agent-sidebar-cell')];
    let target;
    if (params.title) {
      target = cells.find(c => {
        const t = c.querySelector('.agent-sidebar-cell-text')?.textContent?.trim() || '';
        return t.toLowerCase().includes(params.title.toLowerCase());
      });
    } else {
      target = cells[params.index || 0];
    }
    if (!target) return JSON.stringify({ switched: false, error: 'Session not found', available: cells.length });
    target.click();
    return JSON.stringify({ switched: true, title: target.querySelector('.agent-sidebar-cell-text')?.textContent?.trim() });
  } catch(e) {
    return JSON.stringify({ switched: false, error: e.message });
  }
}
