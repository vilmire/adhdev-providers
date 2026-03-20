/**
 * Cursor — list_modes
 *
 * 모드 드롭다운 목록 추출:
 *   버튼: .composer-unified-dropdown (model이 아닌 것)
 *   메뉴: [data-testid="model-picker-menu"] 또는 .typeahead-popover
 *   아이템: .composer-unified-context-menu-item
 *
 * → { modes[], current }
 */
(async () => {
  try {
    const modes = [];
    let current = '';

    const modeBtn = document.querySelector('.composer-unified-dropdown:not(.composer-unified-dropdown-model)');
    if (!modeBtn) return JSON.stringify({ modes: [], current: '', error: 'Mode button not found' });

    modeBtn.click();
    await new Promise(r => setTimeout(r, 500));

    const menu = document.querySelector('[data-testid="model-picker-menu"]') || document.querySelector('.typeahead-popover');
    if (menu) {
      const items = menu.querySelectorAll('.composer-unified-context-menu-item');
      for (const item of items) {
        const nameEl = item.querySelector('.monaco-highlighted-label');
        const name = nameEl?.textContent?.trim() || '';
        if (name) {
          modes.push({ name, id: name });
          if (item.getAttribute('data-is-selected') === 'true') current = name;
        }
      }
    }

    // 닫기
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    return JSON.stringify({ modes, current });
  } catch(e) { return JSON.stringify({ modes: [], current: '', error: e.message }); }
})()
