/**
 * Cursor — list_sessions
 *
 * 사이드바 셀 목록에서 세션 파싱:
 *   셀: .agent-sidebar-cell
 *   제목: .agent-sidebar-cell-text
 *   선택 상태: data-selected="true"
 *   활성 ID: [data-composer-id]에서 추출
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
