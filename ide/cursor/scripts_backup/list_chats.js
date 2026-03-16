/**
 * Cursor v1 — list_chats
 *
 * CURSOR.md 4-2: React Fiber 주 수단, DOM 폴백
 * Fiber keys: summaries, recentConversations, chatHistory, composers
 * "More" 항목 제외, modSec 정렬, 중복 제거, 100자 truncate
 *
 * 최종 확인: 2026-03-06
 */
(async () => {
    // ─── 1. React Fiber에서 히스토리 추출 ───
    const getFiberHistory = function () {
        // CURSOR.md: Fiber 엔트리 포인트
        const entryPoints = ['.composer-view', '.chat-view', '.agent-sidebar-cell', '[data-past-conversations-toggle="true"]', '.history-toggle-button', '#workbench.parts.auxiliarybar'];
        for (var i = 0; i < entryPoints.length; i++) {
            var el = document.querySelector(entryPoints[i]);
            if (!el) continue;
            var fiberKey = Object.keys(el).find(function (k) { return k.startsWith('__reactFiber'); });
            if (!fiberKey) continue;
            var fiber = el[fiberKey];
            var summaries = null;
            var currentWsUris = null;
            // CURSOR.md: Fiber 순회 (최대 200)
            for (var d = 0; d < 200 && fiber; d++) {
                if (fiber.memoizedState) {
                    var s = fiber.memoizedState;
                    while (s) {
                        try {
                            var ms = s.memoizedState;
                            if (ms && typeof ms === 'object') {
                                // CURSOR.md Fiber keys
                                if (ms.summaries) summaries = ms.summaries;
                                else if (ms.recentConversations) summaries = ms.recentConversations;
                                else if (ms.chatHistory) summaries = ms.chatHistory;
                                else if (ms.composers && Array.isArray(ms.composers)) {
                                    summaries = {};
                                    ms.composers.forEach(c => summaries[c.id || c.composerId] = c);
                                }
                            }
                            // CURSOR.md: 워크스페이스 URI 추출
                            var lrs = s.queue && s.queue.lastRenderedState;
                            if (lrs && lrs.workspaceUris && Array.isArray(lrs.workspaceUris)) currentWsUris = lrs.workspaceUris;
                            if (summaries) break;
                        } catch (e) { }
                        s = s.next;
                    }
                }
                if (summaries) break;
                fiber = fiber.return;
            }
            if (summaries) {
                var wsUris = currentWsUris ? new Set(currentWsUris) : null;
                var res = [];
                var entries = Object.entries(summaries);
                for (var j = 0; j < entries.length; j++) {
                    var pair = entries[j];
                    var id = pair[0];
                    var info = pair[1];
                    if (!id || !info) continue;
                    // CURSOR.md: 히스토리 항목 필드 (summary → title → name → historyItemName)
                    var title = info.summary || info.title || info.name || info.historyItemName || 'New Chat';
                    var status = info.mode || info.unifiedMode || 'standard';
                    var lastMod = (info.lastModifiedTime && info.lastModifiedTime.seconds) || info.lastUpdatedAt || info.createdAt || 0;
                    // 워크스페이스 필터링
                    if (wsUris && info.workspaces) {
                        var match = false;
                        for (var k = 0; k < info.workspaces.length; k++) {
                            if (wsUris.has(info.workspaces[k].workspaceFolderAbsoluteUri || '')) { match = true; break; }
                        }
                        if (!match) continue;
                    }
                    // CURSOR.md: "More" 항목 제외 필수
                    if (id === 'More' || (title || '').toLowerCase() === 'more' || id === 'history.more') continue;
                    res.push({ id: id, title: title, status: status, modSec: lastMod });
                }
                // modSec 내림차순 정렬
                res.sort(function (a, b) { return b.modSec - a.modSec; });
                return res;
            }
        }
        return null;
    };

    // ─── 2. DOM 폴백 (CURSOR.md 셀렉터 참조표) ───
    const getDomHistory = function () {
        const selectors = ['.composer-below-chat-history-item', '.agent-sidebar-cell', '.chat-history-item', '.composer-history-item', '.history-item-container', '.monaco-list-row[aria-label*="Chat"]', '.monaco-list-row[aria-label*="Composer"]', '.monaco-list-row[aria-label*="Conversation"]'];
        const items = document.querySelectorAll(selectors.join(', '));
        return Array.from(items).map(function (el) {
            // .agent-sidebar-cell-text, .auxiliary-bar-chat-title (CURSOR.md)
            const titleEl = el.querySelector('.agent-sidebar-cell-text, .auxiliary-bar-chat-title, [class*="title"], [class*="label"], .composer-history-item-title') || el;
            let title = titleEl && titleEl.textContent ? titleEl.textContent.trim() : (el.getAttribute('title') || el.getAttribute('aria-label'));
            if (title) title = title.replace(/\s+\d+[hdmyws]$/, '').replace(/^\d+[hdmyws]\s+/, '').trim();
            return { id: el.getAttribute('data-composer-id') || el.getAttribute('data-id') || el.id || title, status: el.getAttribute('data-composer-status') || '', title: title || 'New Chat' };
        });
    };

    // ─── 3. 결과 조합 ───
    let history = getFiberHistory();
    if (!history || history.length === 0) history = getDomHistory();
    if (history && history.length > 0) {
        // 중복 제거 + 100자 truncate
        const seen = new Set();
        return history.filter(item => {
            const key = item.id || item.title;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).map(item => ({ id: item.id, title: item.title && item.title.length > 100 ? item.title.substring(0, 100) + '...' : item.title, status: item.status }));
    }
    return [];
})()
