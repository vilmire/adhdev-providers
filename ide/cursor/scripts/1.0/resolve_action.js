/**
 * Cursor — resolve_action
 *
 * 승인/거부 버튼 찾기 + 클릭:
 *   button, [role="button"], .cursor-pointer 중 텍스트 매칭
 *   Cursor는 단축키 라벨을 붙임 (e.g. "Run⏎", "SkipEsc") → ⏎↵ 제거 후 비교
 *
 * params.buttonText: string — 찾을 버튼 텍스트
 * → { resolved: true/false, clicked?, available? }
 */
(params) => {
  try {
    const btns = [...document.querySelectorAll('button, [role="button"], .cursor-pointer')].filter(b => b.offsetWidth > 0);
    const searchText = (params.buttonText || params.action || params.button || '').toLowerCase();
    const target = btns.find(b => (b.textContent||'').trim().replace(/[⏎↵]/g, '').trim().toLowerCase().includes(searchText));
    if (target) { target.click(); return JSON.stringify({ resolved: true, clicked: target.textContent.trim() }); }
    return JSON.stringify({ resolved: false, available: btns.map(b => b.textContent.trim()).filter(Boolean).slice(0, 15) });
  } catch(e) { return JSON.stringify({ resolved: false, error: e.message }); }
}
