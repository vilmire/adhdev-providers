/**
 * Cursor — IDE Provider
 * @type {import('../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  type: 'cursor',
  name: 'Cursor',
  category: 'ide',
  displayName: 'Cursor',
  icon: '⚡',
  cli: 'cursor',
  cdpPorts: [9333, 9334],
  processNames: { darwin: 'Cursor', win32: ['Cursor.exe'] },
  paths: {
    darwin: ['/Applications/Cursor.app'],
    win32: ['C:\\Users\\*\\AppData\\Local\\Programs\\cursor\\Cursor.exe'],
    linux: ['/opt/Cursor', '/usr/share/cursor'],
  },
  inputMethod: 'cdp-type-and-send',
  inputSelector: '.aislash-editor-input[contenteditable="true"]',
  vscodeCommands: {
    changeModel: 'cursor.model',
  },

  scripts: {
    readChat(params) {
      return `(() => {
  try {
    const c = document.querySelector('[data-composer-id]');
    const id = c?.getAttribute('data-composer-id') || 'active';
    const rawStatus = c?.getAttribute('data-composer-status') || 'idle';
    let status = rawStatus;
    if (rawStatus === 'thinking' || rawStatus === 'streaming') status = 'generating';
    else if (rawStatus === 'completed' || rawStatus === 'idle' || !rawStatus) status = 'idle';

    // Detect approval dialogs
    let activeModal = null;

    // Primary signal: Cursor uses .run-command-review-active on conversations container
    const reviewActive = !!document.querySelector('.run-command-review-active');

    // Also check clickable elements (Cursor uses divs with cursor-pointer, not buttons)
    // Note: Cursor concatenates button text with shortcut key labels (e.g. "SkipEsc", "Run⏎")
    const clickableEls = [...document.querySelectorAll('button, [role="button"], .cursor-pointer')].filter(b =>
      b.offsetWidth > 0 && /^(accept|reject|approve|deny|run|skip|allow|cancel)/i.test((b.textContent || b.getAttribute('aria-label') || '').trim())
    );

    if (reviewActive || clickableEls.length > 0) {
      status = 'waiting_approval';
      const reviewContainer = document.querySelector('.run-command-review-active');
      // Find the tool call context — last rendered message has the command being reviewed
      const renderedMsgs = reviewContainer?.querySelectorAll('.composer-rendered-message');
      const lastRendered = renderedMsgs?.length ? renderedMsgs[renderedMsgs.length - 1] : null;
      const toolMsg = lastRendered || reviewContainer?.querySelector('.composer-tool-former-message:last-of-type');
      activeModal = {
        message: toolMsg?.textContent?.trim()?.substring(0, 200) || 'Command approval required',
        buttons: clickableEls.map(b => b.textContent.trim().replace(/[⏎↵]/g, '').trim()).filter(Boolean),
      };
    }

    const msgs = [];
    document.querySelectorAll('.composer-human-ai-pair-container').forEach((p, i) => {
      const h = p.querySelector('.composer-human-message');
      const userText = h ? h.textContent.trim().substring(0, 6000) : '';
      if (h) msgs.push({ role: 'user', content: userText, index: msgs.length });
      // pair의 첫 번째 자식은 사용자 메시지 블록 — 그 안의 rendered는 건너뜀
      const firstChild = p.children[0];
      p.querySelectorAll('.composer-rendered-message').forEach(a => {
        if (firstChild && firstChild.contains(a)) return;
        if (a.closest('.composer-human-message')) return;
        const t = a.textContent.trim();
        if (t && t !== userText) msgs.push({ role: 'assistant', content: t.substring(0, 6000), index: msgs.length });
      });
    });
    const inputEl = document.querySelector('.aislash-editor-input[contenteditable="true"]');
    const inputContent = inputEl?.textContent?.trim() || '';
    const titleParts = document.title.split(' — ');
    const projectTitle = (titleParts.length >= 2 ? titleParts[titleParts.length - 2] : titleParts[0] || '').trim();
    return JSON.stringify({ id, status, title: projectTitle, messages: msgs, inputContent, activeModal });
  } catch(e) {
    return JSON.stringify({ id: '', status: 'error', messages: [] });
  }
})()`;
    },

    sendMessage(params) {
      const text = typeof params === 'string' ? params : params?.text;
      return `(() => {
  try {
    const input = document.querySelector('.aislash-editor-input[contenteditable="true"]');
    if (!input) return JSON.stringify({ sent: false, error: 'Input box not found' });
    return JSON.stringify({
      sent: false,
      needsTypeAndSend: true,
      selector: '.aislash-editor-input[contenteditable="true"]',
    });
  } catch(e) {
    return JSON.stringify({ sent: false, error: e.message });
  }
})()`;
    },

    listSessions(params) {
      return `(() => {
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
        title: document.title.split(' — ')[0],
        active: true,
        index: 0,
      });
    }
    return JSON.stringify({ sessions });
  } catch(e) {
    return JSON.stringify({ sessions: [], error: e.message });
  }
})()`;
    },

    switchSession(params) {
      const index = typeof params === 'number' ? params : params?.index;
      const title = typeof params === 'string' ? params : params?.title;
      return `(() => {
  try {
    const cells = [...document.querySelectorAll('.agent-sidebar-cell')];
    let target;
    if (${JSON.stringify(title)}) {
      target = cells.find(c => {
        const t = c.querySelector('.agent-sidebar-cell-text')?.textContent?.trim() || '';
        return t.toLowerCase().includes(${JSON.stringify((title||'').toLowerCase())});
      });
    } else {
      target = cells[${index ?? 0}];
    }
    if (!target) return JSON.stringify({ switched: false, error: 'Session not found', available: cells.length });
    target.click();
    return JSON.stringify({ switched: true, title: target.querySelector('.agent-sidebar-cell-text')?.textContent?.trim() });
  } catch(e) {
    return JSON.stringify({ switched: false, error: e.message });
  }
})()`;
    },

    newSession(params) {
      return `(() => {
  try {
    const newBtn = [...document.querySelectorAll('a.action-label.codicon-add-two, [aria-label*="New Chat"], [aria-label*="New Composer"]')]
      .find(a => a.offsetWidth > 0);
    if (newBtn) { newBtn.click(); return JSON.stringify({ created: true }); }
    return JSON.stringify({ created: false, error: 'New Chat button not found' });
  } catch(e) {
    return JSON.stringify({ created: false, error: e.message });
  }
})()`;
    },

    focusEditor(params) {
      return `(() => {
  try {
    const input = document.querySelector('.aislash-editor-input[contenteditable="true"]');
    if (input) { input.focus(); return 'focused'; }
    return 'not_found';
  } catch(e) { return 'error'; }
})()`;
    },

    openPanel(params) {
      return `(() => {
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
})()`;
    },

    resolveAction(params) {
      const action = typeof params === 'string' ? params : params?.action || 'approve';
      const buttonText = params?.button || params?.buttonText
        || (action === 'approve' ? 'Run' : action === 'reject' ? 'Skip' : action);
      return `(() => {
  try {
    const btns = [...document.querySelectorAll('button, [role="button"], .cursor-pointer')].filter(b => b.offsetWidth > 0);
    const searchText = ${JSON.stringify((buttonText||'').toLowerCase())};
    const target = btns.find(b => (b.textContent||'').trim().replace(/[⏎↵]/g, '').trim().toLowerCase().includes(searchText));
    if (target) { target.click(); return JSON.stringify({ resolved: true, clicked: target.textContent.trim() }); }
    return JSON.stringify({ resolved: false, available: btns.map(b => b.textContent.trim()).filter(Boolean).slice(0, 15) });
  } catch(e) { return JSON.stringify({ resolved: false, error: e.message }); }
})()`;
    },

    listNotifications(params) {
      const filter = typeof params === 'string' ? params : params?.message;
      return `(() => {
  try {
    const toasts = [...document.querySelectorAll('.notifications-toasts .notification-toast, .notification-list-item')];
    const visible = toasts.filter(t => t.offsetWidth > 0).map((t, i) => ({
      index: i,
      message: t.querySelector('.notification-list-item-message')?.textContent?.trim() || t.textContent?.trim().substring(0, 200),
      severity: t.querySelector('.codicon-error') ? 'error' : t.querySelector('.codicon-warning') ? 'warning' : 'info',
      buttons: [...t.querySelectorAll('.notification-list-item-buttons-container button, .monaco-button')].map(b => b.textContent?.trim()).filter(Boolean),
    }));
    const f = ${JSON.stringify(filter || null)};
    return JSON.stringify(f ? visible.filter(n => n.message.toLowerCase().includes(f.toLowerCase())) : visible);
  } catch(e) { return JSON.stringify([]); }
})()`;
    },

    dismissNotification(params) {
      const index = typeof params === 'number' ? params : params?.index;
      const button = typeof params === 'string' ? params : params?.button;
      const message = params?.message;
      return `(() => {
  try {
    const toasts = [...document.querySelectorAll('.notifications-toasts .notification-toast, .notification-list-item')].filter(t => t.offsetWidth > 0);
    let toast;
    if (${JSON.stringify(message)}) {
      toast = toasts.find(t => (t.querySelector('.notification-list-item-message')?.textContent || t.textContent || '').toLowerCase().includes(${JSON.stringify((message||'').toLowerCase())}));
    } else {
      toast = toasts[${index ?? 0}];
    }
    if (!toast) return JSON.stringify({ dismissed: false, error: 'Toast not found', count: toasts.length });
    if (${JSON.stringify(button)}) {
      const btn = [...toast.querySelectorAll('button')].find(b => b.textContent?.trim().toLowerCase().includes(${JSON.stringify((button||'').toLowerCase())}));
      if (btn) { btn.click(); return JSON.stringify({ dismissed: true, clicked: btn.textContent.trim() }); }
      return JSON.stringify({ dismissed: false, error: 'Button not found' });
    }
    const closeBtn = toast.querySelector('.codicon-notifications-clear, .clear-notification-action, .codicon-close');
    if (closeBtn) { closeBtn.click(); return JSON.stringify({ dismissed: true }); }
    return JSON.stringify({ dismissed: false, error: 'Close button not found' });
  } catch(e) { return JSON.stringify({ dismissed: false, error: e.message }); }
})()`;
    },

    /**
     * listModels → { models: string[], current: string }
     * .composer-unified-dropdown-model 클릭 → Auto 토글 끄기 → 전체 모델 목록
     */
    listModels(params) {
      return `(async () => {
  try {
    let current = '';
    const models = [];

    // 현재 모델: .composer-unified-dropdown-model 텍스트
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
              // Think 모드 감지: codicon-br (brain) 아이콘
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
})()`;
    },

    /**
     * setModel → { success: boolean }
     * .composer-unified-dropdown-model 클릭 → 검색 → 선택
     */
    setModel(params) {
      const model = typeof params === 'string' ? params : params?.model;
      const escaped = JSON.stringify(model);
      return `(async () => {
  try {
    const target = ${escaped};

    // 모델 드롭다운 열기
    const modelBtn = document.querySelector('.composer-unified-dropdown-model');
    if (!modelBtn) return JSON.stringify({ success: false, error: 'Model button not found' });

    modelBtn.click();
    await new Promise(r => setTimeout(r, 500));

    const menu = document.querySelector('[data-testid="model-picker-menu"]');
    if (!menu) return JSON.stringify({ success: false, error: 'Model picker menu not found' });


    // 🧠 접미사 처리
    const wantBrain = target.includes('🧠');
    const searchName = target.replace(/\\s*🧠\\s*$/, '').trim();

    // Auto 토글 끄기 (모델 목록 노출)
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

    // 아이템에서 찾기 (brain 아이콘 매칭)
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
})()`;
    },

    /**
     * listModes → { modes: string[], current: string }
     * .composer-unified-dropdown (모드 아이콘) 클릭 → Agent/Plan/Debug/Ask
     */
    listModes(params) {
      return `(async () => {
  try {
    const modes = [];
    let current = '';

    // 모드 드롭다운 버튼 (아이콘, model이 아닌 unified-dropdown)
    const modeBtn = document.querySelector('.composer-unified-dropdown:not(.composer-unified-dropdown-model)');
    if (!modeBtn) return JSON.stringify({ modes: [], current: '', error: 'Mode button not found' });

    modeBtn.click();
    await new Promise(r => setTimeout(r, 500));

    // 팝오버에서 아이템 수집
    const menu = document.querySelector('[data-testid="model-picker-menu"]') || document.querySelector('.typeahead-popover');
    if (menu) {
      const items = menu.querySelectorAll('.composer-unified-context-menu-item');
      for (const item of items) {
        const nameEl = item.querySelector('.monaco-highlighted-label');
        const name = nameEl?.textContent?.trim() || '';
        if (name) {
          modes.push(name);
          if (item.getAttribute('data-is-selected') === 'true') current = name;
        }
      }
    }

    // 닫기
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    return JSON.stringify({ modes, current });
  } catch(e) { return JSON.stringify({ modes: [], current: '', error: e.message }); }
})()`;
    },

    /**
     * setMode → { success: boolean }
     * 모드 드롭다운 열기 → 항목 클릭
     */
    setMode(params) {
      const mode = typeof params === 'string' ? params : params?.mode;
      const escaped = JSON.stringify(mode);
      return `(async () => {
  try {
    const target = ${escaped};

    const modeBtn = document.querySelector('.composer-unified-dropdown:not(.composer-unified-dropdown-model)');
    if (!modeBtn) return JSON.stringify({ success: false, error: 'Mode button not found' });

    modeBtn.click();
    await new Promise(r => setTimeout(r, 500));

    const menu = document.querySelector('[data-testid="model-picker-menu"]') || document.querySelector('.typeahead-popover');
    if (!menu) return JSON.stringify({ success: false, error: 'Mode menu not found' });

    const items = menu.querySelectorAll('.composer-unified-context-menu-item');
    for (const item of items) {
      const nameEl = item.querySelector('.monaco-highlighted-label');
      const name = nameEl?.textContent?.trim() || '';
      if (name && (name === target || name.toLowerCase() === target.toLowerCase())) {
        item.click();
        await new Promise(r => setTimeout(r, 200));
        return JSON.stringify({ success: true, mode: name });
      }
    }

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return JSON.stringify({ success: false, error: 'mode not found: ' + target });
  } catch(e) { return JSON.stringify({ success: false, error: e.message }); }
})()`;
    },
  },
};
