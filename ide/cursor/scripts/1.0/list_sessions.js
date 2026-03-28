/**
 * Cursor — list_sessions
 *
 * Parse sessions from sidebar cell list:
 *   Cell: .agent-sidebar-cell
 *   Title: .agent-sidebar-cell-text
 *   Selection state: data-selected="true"
 *   Active ID: [data-composer-id]extracted from
 *
 * → { sessions: [{ id, title, active, index }] }
 */
(() => {
  try {
    const sessions = [];
    const cells = [...document.querySelectorAll('.agent-sidebar-cell')];
    const activeComposer = document.querySelector('[data-composer-id]');
    const activeId = activeComposer?.getAttribute('data-composer-id') || null;
    cells.forEach((cell, i) => {
      const titleEl = cell.querySelector('.agent-sidebar-cell-text');
      const title = titleEl?.textContent?.trim() || 'Untitled';
      const isSelected = cell.getAttribute('data-selected') === 'true';
      sessions.push({
        id: isSelected && activeId ? activeId : 'sidebar-' + i,
        title,
        active: isSelected,
        index: i,
      });
    });
    // If no sidebar cells, fallback to current composer
    if (sessions.length === 0 && activeComposer) {
      sessions.push({
        id: activeId,
        title: (() => { const p = document.title.split(' — '); return p.length >= 2 ? p[p.length - 1] : p[0]; })(),
        active: true,
        index: 0,
      });
    }
    return JSON.stringify({ sessions });
  } catch(e) {
    return JSON.stringify({ sessions: [], error: e.message });
  }
})()
