/**
 * Cursor — list_models
 *
 * 모델 드롭다운 목록 추출:
 *   버튼: .composer-unified-dropdown-model
 *   메뉴: [data-testid="model-picker-menu"]
 *   아이템: .composer-unified-context-menu-item
 *   모델명: .monaco-highlighted-label
 *   Think 모드: codicon-br (brain) 아이콘
 *   Auto 토글: rounded-full 24x14 요소
 *
 * → { models[], current }
 */
(async () => {
  try {
    let current = '';
    const models = [];

    const modelBtn = document.querySelector('.composer-unified-dropdown-model');
    if (modelBtn) {
      current = modelBtn.textContent?.trim() || '';
    }

    // 드롭다운 열기
    if (modelBtn) {
      modelBtn.click();
      await new Promise(r => setTimeout(r, 500));

      const menu = document.querySelector('[data-testid="model-picker-menu"]');
      if (menu) {
        // Auto 토글 확인 및 끄기
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

        // 모델 목록 수집 (Auto 끈 상태)
        const refreshedMenu = document.querySelector('[data-testid="model-picker-menu"]');
        if (refreshedMenu) {
          const items = refreshedMenu.querySelectorAll('.composer-unified-context-menu-item');
          for (const item of items) {
            const nameEl = item.querySelector('.monaco-highlighted-label');
            const name = nameEl?.textContent?.trim() || '';
            if (name && name !== 'Add Models') {
              const hasBrain = !!item.querySelector('[class*="codicon-br"]');
              const displayName = hasBrain ? name + ' 🧠' : name;
              models.push(displayName);
              if (item.getAttribute('data-is-selected') === 'true') current = displayName;
            }
          }
        }

        // Auto 다시 켜기 (원래 상태 복원)
        if (wasAutoOn) {
          const newMenu = document.querySelector('[data-testid="model-picker-menu"]');
          const newAutoItem = newMenu?.querySelector('.composer-unified-context-menu-item');
          const newToggle = newAutoItem ? [...newAutoItem.querySelectorAll('[class*="rounded-full"]')].find(el => el.offsetWidth === 24) : null;
          if (newToggle) {
            newToggle.click();
            await new Promise(r => setTimeout(r, 200));
          }
        }
      }

      // 닫기 (Escape)
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }

    return JSON.stringify({ models, current });
  } catch(e) { return JSON.stringify({ models: [], current: '', error: e.message }); }
})()
