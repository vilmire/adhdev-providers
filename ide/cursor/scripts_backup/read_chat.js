/**
 * Cursor v1 — read_chat
 *
 * 구조 (CURSOR.md 4-1 참조):
 *   1. 컨테이너 찾기 (.composer-view 우선)
 *   2. composerId + status (data 속성)
 *   3. 제목 (3단계 폴백: DOM → Fiber summaries → 위치 기반)
 *   4. 메시지 (data-message-id 기반, getCleanContent 정제)
 *   5. 모달 감지 (6단계 계층적 탐색)
 *   6. 최종 status (모달 → waiting_approval)
 *
 * 최종 확인: 2026-03-06
 */
(() => {
    // ─── 1. 컨테이너 ───
    const container = document.querySelector('.composer-view:not([style*="display: none"]), .chat-view:not([style*="display: none"]), [data-composer-id]:not([style*="display: none"])')
        || document.querySelector('.composer-view, .chat-view, [data-composer-id]')
        || document.getElementById('workbench.parts.auxiliarybar');
    if (!container) return { id: '', status: '', title: 'No Session', messages: [], inputContent: '' };

    // ─── 2. composerId + status ───
    const composerId = container.getAttribute('data-composer-id') || 'active_session';
    var rawStatus = container.getAttribute('data-composer-status') || '';
    // data-composer-status="thinking" → generating (CURSOR.md 4-1 주의점)
    const status = (rawStatus && rawStatus.toLowerCase() === 'thinking') ? 'generating' : rawStatus;

    // ─── 3. 제목 (3단계 폴백) ───
    var title = '';

    // 3-A: DOM 셀렉터 (CURSOR.md 셀렉터 참조표)
    var titleSelectors = [
        '.auxiliary-bar-chat-title', '.chat-header h1', '.composer-title',
        '.title-label', '[aria-label*="Chat title"]', '[class*="chat-title"]',
        '[class*="composer-title"]', '.agent-sidebar-cell-text', '[class*="ellipsis"]'
    ];
    for (var ts = 0; ts < titleSelectors.length; ts++) {
        var te = container.querySelector(titleSelectors[ts]);
        if (!te) continue;
        var t = (te.textContent || '').trim().replace(/CustomizationMCP|ServersExport/gi, '').trim();
        if (t.length >= 2 && t.length <= 200 && !/^(Chat|New Chat|Active Session)$/i.test(t)) { title = t; break; }
    }

    // 3-B: Fiber summaries (CURSOR.md 3장 — composerId로 정확한 제목)
    if (!title) {
        var fiberTitle = null;
        var entryPoints = ['.composer-view', '.chat-view', '.agent-sidebar-cell', '#workbench.parts.auxiliarybar'];
        for (var ep = 0; ep < entryPoints.length; ep++) {
            var el = document.querySelector(entryPoints[ep]);
            if (!el) continue;
            var fk = Object.keys(el).find(function (k) { return k.startsWith('__reactFiber'); });
            if (!fk) continue;
            var fib = el[fk];
            for (var depth = 0; depth < 200 && fib; depth++) {
                if (fib.memoizedState) {
                    var state = fib.memoizedState;
                    while (state) {
                        try {
                            var memo = state.memoizedState;
                            if (memo && typeof memo === 'object') {
                                // summaries, recentConversations, chatHistory (CURSOR.md Fiber keys)
                                var sum = memo.summaries || memo.recentConversations || memo.chatHistory;
                                var match = function (entryId, info) {
                                    if (!info) return null;
                                    return info.summary || info.title || info.name || info.historyItemName;
                                };
                                if (sum && sum[composerId]) fiberTitle = match(composerId, sum[composerId]);
                                else if (memo.composers && Array.isArray(memo.composers)) {
                                    var cur = memo.composers.find(function (x) {
                                        var id = x.id || x.composerId;
                                        return id === composerId || (id && composerId && (String(id) === String(composerId) || id.indexOf(composerId) >= 0 || composerId.indexOf(id) >= 0));
                                    });
                                    if (cur) fiberTitle = cur.summary || cur.title || cur.name;
                                }
                                // composerId 부분 매칭 폴백
                                if (!fiberTitle && sum && typeof sum === 'object') {
                                    var entries = Object.entries(sum);
                                    for (var e = 0; e < entries.length; e++) {
                                        var entId = entries[e][0], info = entries[e][1];
                                        if (entId === composerId || (entId && composerId && (String(entId).indexOf(composerId) >= 0 || String(composerId).indexOf(entId) >= 0))) {
                                            fiberTitle = match(entId, info);
                                            break;
                                        }
                                    }
                                }
                            }
                            if (fiberTitle) break;
                        } catch (err) { }
                        state = state.next;
                    }
                }
                if (fiberTitle) break;
                fib = fib.return;
            }
            if (fiberTitle) break;
        }
        title = (fiberTitle && String(fiberTitle).trim()) ? String(fiberTitle).trim() : '';
    }

    // 3-C: 위치 기반 텍스트 (컨테이너 상단 80px 내)
    if (!title && container.getBoundingClientRect) {
        var containerTop = container.getBoundingClientRect().top;
        var nodes = container.querySelectorAll('[class*="title"], [class*="label"], [class*="ellipsis"], h1, h2, span, div');
        for (var ni = 0; ni < nodes.length && ni < 60; ni++) {
            var n = nodes[ni];
            if (n.querySelector && n.querySelector('button, [role="button"], textarea')) continue;
            var rect = n.getBoundingClientRect();
            if (rect.height > 0 && rect.top < containerTop + 80) {
                var txt = (n.textContent || '').trim().split('\\n')[0].trim();
                if (txt.length >= 2 && txt.length <= 150 && !/^(Chat|New Chat|Active Session|Composer)$/i.test(txt)) {
                    title = txt.replace(/CustomizationMCP|ServersExport/gi, '').trim();
                    if (title.length >= 2) break;
                }
            }
        }
    }
    if (title.length > 100) title = title.slice(0, 100);

    // COMMON.md: getCleanContent — HTML → Markdown 변환 (대시보드가 ReactMarkdown+remarkGfm 사용)
    const getCleanContent = (el) => {
        const clone = el.cloneNode(true);
        // 노이즈 요소 제거
        clone.querySelectorAll('button, [role="button"], .anysphere-button, [class*="composer-tool-call-control"], [class*="composer-run-button"], [class*="composer-skip-button"], style, script, .codicon, svg, [class*="feedback"], [aria-label*="Good"], [aria-label*="Bad"]').forEach(n => n.remove());
        clone.querySelectorAll('[class*="action"], [class*="footer"], [class*="toolbar"], .ui-collapsible-header').forEach(n => {
            const t = (n.textContent || '').trim().toLowerCase();
            if (/^(skip|run|esc|approve|reject|allow|deny|cancel)/i.test(t) || t.length < 15) n.remove();
        });
        clone.querySelectorAll('*').forEach(child => {
            if (!child.parentNode) return;
            const t = (child.textContent || '').trim();
            if (t.length > 60) return;
            const low = t.toLowerCase();
            const isStatusText = /^(analyzed\s+\d|edited\s+\d|ran\s+\S|terminal\s|reading|searching)/i.test(low);
            const isMcpNoise = /^(mcp|customizationmcp|serversexport)/i.test(low);
            if (isStatusText || isMcpNoise) child.remove();
        });

        // HTML → Markdown 변환기
        function htmlToMd(node) {
            if (node.nodeType === 3) return node.textContent || ''; // TEXT_NODE
            if (node.nodeType !== 1) return ''; // ELEMENT_NODE만
            const tag = node.tagName;

            // 테이블 → GFM 마크다운 표
            if (tag === 'TABLE') {
                const rows = Array.from(node.querySelectorAll('tr'));
                if (rows.length === 0) return '';
                const table = rows.map(tr => {
                    return Array.from(tr.querySelectorAll('th, td')).map(cell => (cell.textContent || '').trim().replace(/\|/g, '\\|'));
                });
                if (table.length === 0) return '';
                const colCount = Math.max(...table.map(r => r.length));
                const header = table[0];
                const sep = Array(colCount).fill('---');
                const body = table.slice(1);
                let md = '| ' + header.join(' | ') + ' |\n';
                md += '| ' + sep.join(' | ') + ' |\n';
                for (const row of body) {
                    while (row.length < colCount) row.push('');
                    md += '| ' + row.join(' | ') + ' |\n';
                }
                return '\n' + md + '\n';
            }

            // 리스트
            if (tag === 'UL') {
                return '\n' + Array.from(node.children).map(li => '- ' + childrenToMd(li).trim()).join('\n') + '\n';
            }
            if (tag === 'OL') {
                return '\n' + Array.from(node.children).map((li, i) => (i + 1) + '. ' + childrenToMd(li).trim()).join('\n') + '\n';
            }
            if (tag === 'LI') return childrenToMd(node);

            // 헤딩
            if (tag === 'H1') return '\n# ' + childrenToMd(node).trim() + '\n';
            if (tag === 'H2') return '\n## ' + childrenToMd(node).trim() + '\n';
            if (tag === 'H3') return '\n### ' + childrenToMd(node).trim() + '\n';
            if (tag === 'H4') return '\n#### ' + childrenToMd(node).trim() + '\n';

            // 볼드/이탤릭
            if (tag === 'STRONG' || tag === 'B' || (tag === 'SPAN' && node.classList.contains('font-semibold')))
                return '**' + childrenToMd(node).trim() + '**';
            if (tag === 'EM' || tag === 'I') return '*' + childrenToMd(node).trim() + '*';

            // 코드
            if (tag === 'PRE') {
                const codeEl = node.querySelector('code');
                const lang = codeEl ? (codeEl.className.match(/language-(\w+)/)?.[1] || '') : '';
                const code = (codeEl || node).textContent || '';
                return '\n```' + lang + '\n' + code.trim() + '\n```\n';
            }
            if (tag === 'CODE') {
                if (node.parentElement && node.parentElement.tagName === 'PRE') return node.textContent || '';
                return '`' + (node.textContent || '').trim() + '`';
            }

            // 블록쿼트
            if (tag === 'BLOCKQUOTE') return '\n> ' + childrenToMd(node).trim().replace(/\n/g, '\n> ') + '\n';

            // 링크
            if (tag === 'A') {
                const href = node.getAttribute('href') || '';
                return '[' + childrenToMd(node).trim() + '](' + href + ')';
            }

            // 줄바꿈
            if (tag === 'BR') return '\n';

            // 단락
            if (tag === 'P') return '\n' + childrenToMd(node).trim() + '\n';

            // DIV, SPAN 등 나머지 → 자식 순회
            return childrenToMd(node);
        }

        function childrenToMd(node) {
            return Array.from(node.childNodes).map(htmlToMd).join('');
        }

        // 마크다운 콘텐츠 영역 찾기
        const mdRoot = clone.querySelector('.markdown-root, .space-y-4') || clone;
        let md = htmlToMd(mdRoot);

        // 정리
        md = md.replace(/CustomizationMCP|ServersExport/gi, '')
            .replace(/\s*(Skip|Esc|Run[⏎⌥]?)\s*/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        return md;
    };

    // CURSOR.md: [data-message-id], .chat-line, .chat-message-container, .composer-rendered-message
    let msgEls = Array.from(container.querySelectorAll('[data-message-id], .chat-line, .chat-message-container, .composer-rendered-message'));
    const messages = msgEls.map((el, i) => {
        const id = el.getAttribute('data-message-id') || ("msg_" + i);
        // CURSOR.md: role 감지 — data-message-role > className > 자식 요소
        const role = el.getAttribute('data-message-role') ||
            (el.classList.contains('user-message') || el.classList.contains('composer-human-message') || el.className.includes('human-message') ? 'user' :
                el.classList.contains('bot-message') || el.className.includes('ai-message') || el.className.includes('bot-message') ? 'assistant' :
                    el.querySelector('.user') ? 'user' : 'assistant');
        // CURSOR.md: .chat-content-container, .message-content, .markdown-content
        const contentEl = el.querySelector('.chat-content-container, .message-content, .markdown-content, .composer-human-message, .composer-bot-message') || el;
        const content = getCleanContent(contentEl);
        return { id, role, kind: 'standard', content, index: i };
    }).filter(m => m.content.length > 1);

    // 입력창
    const input = container.querySelector('[role="textbox"], textarea.native-input');
    const inputContent = input ? (input.value || input.innerText || '').trim() : '';
    const usageEl = container.querySelector('.context-usage, .token-count, .composer-footer-info');
    const contextUsage = usageEl?.textContent?.trim() || '';

    // ─── 5. 모달 감지 (CURSOR.md: 6단계) ───
    let dialogEl = null;
    try {
        // COMMON.md: isApprovalLike 함수
        const isApprovalLike = (el) => {
            const t = (el.textContent || '').trim().toLowerCase();
            if (t.length > 30) return false;
            // ui-collapsible-header는 접기/펼치기 헤더 — 승인 버튼 아님
            if (el.classList && el.classList.contains('ui-collapsible-header')) return false;
            if (el.closest && el.closest('.ui-collapsible-header')) return false;
            // 상태 텍스트 제외 (false positive 방지)
            if (/^(explored|thought|ran\s|running|checked|edited|analyzed|reading)/i.test(t)) return false;
            if (/\d+\s*(command|file|line|second|ms)\b/i.test(t)) return false;
            // 정확한 매칭 (word boundary)
            return /^(approve|reject|allow|deny|run|cancel|accept|yes|no|ok|skip|enter)\b/.test(t)
                || t === 'always allow' || t === 'always deny'
                || /^run\s*⌥/.test(t);
        };
        const findDialog = (list, allowInsideComposer, allowEmptyText) => list.find(el => {
            const rect = el.getBoundingClientRect();
            if (rect.width < 50 || rect.height < 20 || el.offsetWidth === 0 || el.offsetHeight === 0) return false;
            const style = window.getComputedStyle(el);
            if (style.opacity === '0' || style.visibility === 'hidden' || style.display === 'none' || style.pointerEvents === 'none') return false;
            var txt = (el.textContent || '').trim();
            // COMMON.md: noise filter
            if (el.classList && el.classList.contains('monaco-list-row') && /adhdev|connected|bridge|active/i.test(txt)) return false;
            const buttons = Array.from(el.querySelectorAll('button, [role="button"], .monaco-button')).filter(b => b.offsetWidth > 0 && window.getComputedStyle(b).pointerEvents !== 'none');
            const hasApprovalBtn = buttons.some(isApprovalLike);
            if (!allowEmptyText) {
                if (!txt || txt.length < 2) return false;
                const low = txt.toLowerCase();
                if (low.includes('customizationmcp') || low.includes('serversexport') || low.includes('good/bad') || low.includes('thought for')) return false;
            }
            if (!allowInsideComposer && el.closest('.composer-view, .chat-view, .antigravity-agent-side-panel')) return false;
            if (!hasApprovalBtn && buttons.length === 0) return false;
            if (allowInsideComposer || allowEmptyText) return hasApprovalBtn;
            return true;
        });

        // ① .quick-agent-overlay-container (CURSOR.md 모달 ①)
        var overlayContainers = document.querySelectorAll('.quick-agent-overlay-container, [class*="overlay-container"], [class*="tool-call-actions"]');
        for (var o = 0; o < overlayContainers.length; o++) {
            var ov = overlayContainers[o];
            var r = ov.getBoundingClientRect();
            if (r.width < 200 || r.height < 80) continue;
            var btns = Array.from(ov.querySelectorAll('button, [role="button"], .solid-dropdown-toggle')).filter(function (b) { return b.offsetWidth > 0; });
            if (btns.some(isApprovalLike)) { dialogEl = ov; break; }
            var ovText = (ov.textContent || ov.innerText || '').trim();
            if (/run command|\bSkip\b|\bRun\b|ask every time/i.test(ovText)) { dialogEl = ov; break; }
        }

        // ② [class*="run-command-review"] (CURSOR.md 모달 ②)
        if (!dialogEl) {
            var runReviewContainers = document.querySelectorAll('[class*="run-command-review"]');
            for (var rrc = 0; rrc < runReviewContainers.length; rrc++) {
                var rre = runReviewContainers[rrc];
                var rrect = rre.getBoundingClientRect();
                if (rrect.width < 100 || rrect.height < 40) continue;
                var rreBtns = Array.from(rre.querySelectorAll('button, [role="button"], .solid-dropdown-toggle, [class*="button"], [class*="option"]')).filter(function (b) { return b.offsetWidth > 0; });
                if (rreBtns.some(isApprovalLike)) { dialogEl = rre; break; }
            }
        }

        // ③ 부모 ancestor walk (CURSOR.md 모달 ③)
        if (!dialogEl) {
            var approvalBtns = Array.from(document.querySelectorAll('button.solid-dropdown-toggle, button, [role="button"], [class*="dropdown"], [class*="option"]')).filter(function (b) { return b.offsetWidth > 0 && isApprovalLike(b); });
            for (var ab = 0; ab < approvalBtns.length; ab++) {
                var wrapper = approvalBtns[ab].closest && (approvalBtns[ab].closest('.quick-agent-overlay-container, [class*="overlay-container"]') || approvalBtns[ab].closest('[class*="run-command-review"]'));
                if (wrapper) {
                    var wr = wrapper.getBoundingClientRect();
                    if (wr.width >= 100 && wr.height >= 40) { dialogEl = wrapper; break; }
                }
            }
            if (!dialogEl && approvalBtns.length > 0) {
                var btn = approvalBtns[0];
                var p = btn.parentElement;
                for (var up = 0; up < 15 && p; up++, p = p.parentElement) {
                    if (!p || !p.getBoundingClientRect) continue;
                    var pr = p.getBoundingClientRect();
                    if (pr.width < 100 || pr.height < 40) continue;
                    var pStyle = window.getComputedStyle(p);
                    if (pStyle.display === 'none' || pStyle.visibility === 'hidden' || pStyle.opacity === '0') continue;
                    var allBtns = Array.from(p.querySelectorAll('button, [role="button"], .solid-dropdown-toggle')).filter(function (b) { return b.offsetWidth > 0; });
                    if (allBtns.length >= 1) { dialogEl = p; break; }
                }
            }
        }

        // ④ 전역 dialog (CURSOR.md 모달 ④)
        if (!dialogEl) {
            const globalDialogs = document.querySelectorAll('.monaco-dialog-box, .monaco-modal-block, [role="dialog"], [class*="overlay"], [class*="modal"]');
            dialogEl = findDialog(Array.from(globalDialogs), false, false);
        }

        // ⑤ Composer 내부 inline (CURSOR.md 모달 ⑤)
        if (!dialogEl) {
            const insideComposer = container.querySelectorAll('[role="dialog"], [class*="dialog"], [class*="modal"], [class*="overlay"]');
            dialogEl = findDialog(Array.from(insideComposer), true, false);
        }

        // ⑤-B: anyWithApproval fallback
        if (!dialogEl) {
            const anyWithApproval = Array.from(document.querySelectorAll('[role="dialog"], .monaco-dialog-box, [class*="dialog"], [class*="modal"]')).filter(el => {
                const rect = el.getBoundingClientRect();
                if (rect.width < 40 || rect.height < 30 || el.offsetWidth === 0 || el.offsetHeight === 0) return false;
                const style = window.getComputedStyle(el);
                if (style.opacity === '0' || style.visibility === 'hidden' || style.display === 'none') return false;
                const buttons = Array.from(el.querySelectorAll('button, [role="button"]')).filter(b => b.offsetWidth > 0);
                return buttons.some(isApprovalLike);
            });
            dialogEl = anyWithApproval[0] || null;
        }

        // ⑥ QuickInput (CURSOR.md 모달 ⑥)
        if (!dialogEl) {
            const quickInputs = document.querySelectorAll('.monaco-quick-input-widget, .quick-input-widget, [class*="quick-input"], [class*="quickInput"]');
            for (const el of Array.from(quickInputs)) {
                const rect = el.getBoundingClientRect();
                if (rect.width < 80 || rect.height < 30 || el.offsetWidth === 0 || el.offsetHeight === 0) continue;
                const style = window.getComputedStyle(el);
                if (style.opacity === '0' || style.visibility === 'hidden' || style.display === 'none') continue;
                const buttons = Array.from(el.querySelectorAll('button, [role="button"], .monaco-button, a[role="button"], .solid-dropdown-toggle')).filter(b => b.offsetWidth > 0);
                if (buttons.some(isApprovalLike)) { dialogEl = el; break; }
            }
        }

        // ⑦ 마지막 AI 메시지 안에 인라인 approval 버튼 (Cursor Agent mode)
        // Skip/Run/Esc 버튼이 [data-message-id] 요소 안에 렌더링되는 경우
        if (!dialogEl) {
            var aiMsgs = Array.from(container.querySelectorAll('[data-message-role="ai"]'));
            var lastAi = aiMsgs[aiMsgs.length - 1];
            if (lastAi) {
                var inlineBtns = Array.from(lastAi.querySelectorAll('button, [role="button"], .anysphere-button, [class*="composer-run-button"], [class*="composer-skip-button"]'))
                    .filter(function (b) {
                        if (b.offsetWidth === 0) return false;
                        if (b.classList.contains('ui-collapsible-header')) return false;
                        var bt = (b.textContent || '').trim().toLowerCase();
                        return /^(skip|run|approve|reject|allow|deny|cancel|accept|enter)/.test(bt) && bt.length < 30;
                    });
                if (inlineBtns.length > 0) {
                    dialogEl = lastAi;
                }
            }
        }
    } catch (e) { dialogEl = null; }

    // 모달 결과 구조 (COMMON.md: activeModal 형식)
    const activeModal = dialogEl ? (function () {
        var msgEl = dialogEl.querySelector('.dialog-message-text, .dialog-header, .message, [class*="message"], [class*="title"]') || dialogEl;
        var msg = (msgEl.textContent || '').trim().slice(0, 300) || '';
        var rawBtns = Array.from(dialogEl.querySelectorAll('.monaco-button, button, [role="button"], .solid-dropdown-toggle, .anysphere-button, [class*="composer-run-button"], [class*="composer-skip-button"], [class*="dropdown"], [class*="option"]')).filter(function (b) {
            if (b.offsetWidth === 0) return false;
            // ui-collapsible-header는 제외 (접기/펼치기 헤더)
            if (b.classList && b.classList.contains('ui-collapsible-header')) return false;
            if (b.closest && b.closest('.ui-collapsible-header')) return false;
            return true;
        });
        var btnTexts = rawBtns.map(function (b) { return (b.textContent || '').trim(); }).filter(function (t) {
            if (!t || t.length === 0 || t.length > 40) return false;
            // 상태 텍스트 제외
            if (/^(explored|thought|ran\s|running|checked|edited|analyzed|reading)/i.test(t.toLowerCase())) return false;
            if (/\d+\s*(command|file|line|second|ms)\b/i.test(t)) return false;
            return true;
        });
        if (btnTexts.length === 0 && /run command|\bSkip\b|\bRun\b/i.test((dialogEl.textContent || ''))) {
            var all = Array.from(dialogEl.querySelectorAll('[role="button"], button, a, [class*="button"], [class*="option"]'))
                .filter(function (el) { return !(el.classList && el.classList.contains('ui-collapsible-header')); });
            for (var i = 0; i < all.length; i++) { var t = (all[i].textContent || '').trim(); if (/^(Skip|Run|Enter|Ask Every Time|Approve|Reject|Allow|Deny)/i.test(t)) btnTexts.push(t); }
        }
        if (btnTexts.length === 0) return null;
        return { message: msg, buttons: [...new Set(btnTexts)] };
    })() : null;

    // ─── 6. 최종 status ───
    const finalStatus = (activeModal && activeModal.buttons.length > 0) ? 'waiting_approval' : status;

    return {
        id: composerId || title || 'active_session', status: finalStatus, title,
        messages, inputContent, contextUsage,
        activeModal: (activeModal && activeModal.buttons.length > 0) ? activeModal : null
    };
})()
