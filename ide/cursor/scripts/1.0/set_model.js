/**
 * Cursor — set_model
 *
 * 모델 드롭다운에서 대상 모델 선택:
 *   1. 드롭다운 열기
 *   2. Auto 토글 끄기 (필요 시)
 *   3. 검색 입력으로 필터
 *   4. 매칭 아이템 클릭
 *   5. 원래 Auto 상태 복원
 *
 * params.model: string — 모델 이름 (🧠 접미사 가능)
 * → { success: true/false, model? }
 */
async (params) => {
  try {
    const target = params.model;

    const modelBtn = document.querySelector('.composer-unified-dropdown-model');
    if (!modelBtn) return JSON.stringify({ success: false, error: 'Model button not found' });

    modelBtn.click();
    await new Promise(r => setTimeout(r, 500));

    const menu = document.querySelector('[data-testid="model-picker-menu"]');
    if (!menu) return JSON.stringify({ success: false, error: 'Model picker menu not found' });

    // 🧠 접미사 처리
    const wantBrain = target.includes('🧠');
    const searchName = target.replace(/\s*🧠\s*$/, '').trim();

    // Auto 토글 끄기
    const autoItem = menu.querySelector('.composer-unified-context-menu-item[data-is-selected="true"]');
    const autoToggle = autoItem ? [...autoItem.querySelectorAll('[class*="rounded-full"]')].find(el => el.offsetWidth === 24 && el.offsetHeight === 14) : null;
    let wasAutoOn = false;
    if (autoToggle) {
      const bgStyle = autoToggle.getAttribute('style') || '';
      wasAutoOn = bgStyle.includes('green');
      if (wasAutoOn) {
        autoToggle.click();
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // 검색 입력으로 필터링
    const refreshedMenu = document.querySelector('[data-testid="model-picker-menu"]');
    const searchInput = refreshedMenu?.querySelector('input[placeholder="Search models"]');
    if (searchInput) {
      searchInput.focus();
      searchInput.value = searchName;
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
    }

    // 아이템에서 찾기
    const items = (refreshedMenu || menu).querySelectorAll('.composer-unified-context-menu-item');
    for (const item of items) {
      const nameEl = item.querySelector('.monaco-highlighted-label');
      const name = nameEl?.textContent?.trim() || '';
      if (!name || name === 'Add Models') continue;
      const hasBrain = !!item.querySelector('[class*="codicon-br"]');

      if (name.toLowerCase().includes(searchName.toLowerCase()) && hasBrain === wantBrain) {
        item.click();
        await new Promise(r => setTimeout(r, 200));
        const displayName = hasBrain ? name + ' 🧠' : name;
        return JSON.stringify({ success: true, model: displayName });
      }
    }

    // Auto 복원 + 닫기
    if (wasAutoOn) {
      const nm = document.querySelector('[data-testid="model-picker-menu"]');
      const nai = nm?.querySelector('.composer-unified-context-menu-item');
      const nt = nai ? [...nai.querySelectorAll('[class*="rounded-full"]')].find(el => el.offsetWidth === 24) : null;
      if (nt) nt.click();
      await new Promise(r => setTimeout(r, 200));
    }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return JSON.stringify({ success: false, error: 'model not found: ' + target });
  } catch(e) { return JSON.stringify({ success: false, error: e.message }); }
}
