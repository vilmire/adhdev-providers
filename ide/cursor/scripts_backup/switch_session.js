/**
 * Cursor v1 — switch_session
 *
 * CURSOR.md 4-4: data-composer-id → DOM 텍스트 매칭 → scrollIntoView + 클릭
 * 파라미터: ${ SESSION_ID }
 * 최종 확인: 2026-03-06
 */
(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const id = ${ SESSION_ID };

    // 1. Agents 패널 가시성 확인 → 토글 (CURSOR.md 4-4)
    const ensureHistoryVisible = async () => {
        const findAgentsToggle = () => {
            const allHeaders = Array.from(document.querySelectorAll('.pane-header, .monaco-list-row, .tree-item, [role="button"]'));
            return allHeaders.find(h => h.textContent && h.textContent.includes('Agents') && (h.querySelector('.codicon-chevron-right') || h.getAttribute('aria-expanded') === 'false' || h.classList.contains('collapsed')));
        };
        // CURSOR.md: 히스토리 항목 셀렉터
        const hasItems = () => document.querySelectorAll('.agent-sidebar-cell, .composer-history-item, .chat-history-item, .composer-below-chat-history-item').length > 0;
        if (hasItems()) return;
        let agentToggle = findAgentsToggle();
        if (!agentToggle) {
            const sideBarIcon = Array.from(document.querySelectorAll('.action-item, .composite-bar-item, [role="button"]'))
                .find(el => { const label = (el.getAttribute && el.getAttribute('aria-label')) || ''; return label.includes('Agents') || label.includes('Toggle Agents') || label.includes('Chat'); });
            if (sideBarIcon) { sideBarIcon.click(); await sleep(500); agentToggle = findAgentsToggle(); }
        }
        if (agentToggle) { agentToggle.click(); await sleep(600); }
    };
    await ensureHistoryVisible();

    // 2. 대상 찾기 (CURSOR.md: data-composer-id/data-id → 텍스트 매칭)
    const findTarget = () => {
        const byAttr = document.querySelectorAll('[data-composer-id], [data-id]');
        for (var a = 0; a < byAttr.length; a++) {
            var el = byAttr[a];
            var dataId = el.getAttribute('data-composer-id') || el.getAttribute('data-id') || el.id;
            if (dataId === id) return el;
        }
        const selectors = ['.agent-sidebar-cell', '.composer-below-chat-history-item', '.chat-history-item', '.composer-history-item', '.monaco-list-row'];
        const allItems = document.querySelectorAll(selectors.join(', '));
        for (var j = 0; j < allItems.length; j++) {
            var item = allItems[j];
            var dataId = item.getAttribute && (item.getAttribute('data-composer-id') || item.getAttribute('data-id') || item.id);
            if (dataId === id) return item;
            if (item.textContent && item.textContent.indexOf(id) >= 0) return item;
        }
        return null;
    };

    // 3. 클릭 (CURSOR.md: scrollIntoView + MouseEvent)
    var target = findTarget();
    if (target) {
        target.scrollIntoView({ block: 'center', behavior: 'auto' });
        await sleep(150);
        const rect = target.getBoundingClientRect();
        const options = { bubbles: true, cancelable: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
        target.dispatchEvent(new MouseEvent('mousedown', options));
        target.dispatchEvent(new MouseEvent('mouseup', options));
        target.dispatchEvent(new MouseEvent('click', options));
        return true;
    }
    return false;
})()
