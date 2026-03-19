/**
 * Cursor — open_panel
 *
 * 채팅/컴포저 패널 열기:
 *   1. 이미 보이면 'visible' 반환
 *   2. Agent/Chat/Composer 탭 찾아서 클릭
 */
(() => {
  try {
    const sidebar = document.getElementById('workbench.parts.auxiliarybar');
    if (sidebar && sidebar.offsetWidth > 0) {
      const chatView = document.querySelector('[data-composer-id]');
      if (chatView) return 'visible';
    }
    const btns = [...document.querySelectorAll('li.action-item a, button, [role="tab"]')];
    const toggle = btns.find(b => {
      const label = (b.textContent || b.getAttribute('aria-label') || '').toLowerCase();
      return /agent|chat|composer|cursor tab/i.test(label);
    });
    if (toggle) { toggle.click(); return 'opened'; }
    return 'not_found';
  } catch (e) { return 'error'; }
})()
