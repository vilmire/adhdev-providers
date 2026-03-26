module.exports = {
  focus_editor: `/**
 * Windsurf v1 — focus_editor
 * 
 * Cascade(채팅) 입력창에 포커스를 맞춥니다.
 * Windsurf는 VS Code 포크로, 채팅 UI를 "Cascade"라고 부릅니다.
 * 
 * DOM 구조:
 *   #windsurf.cascadePanel → .chat-client-root
 *   입력: [contenteditable="true"][role="textbox"]
 *         또는 textarea (미로그인)
 * 
 * 최종 확인: Windsurf (2026-03-06)
 */
(() => {
    try {
        const editor =
            document.querySelector('[contenteditable="true"][role="textbox"]') ||
            document.querySelector('[data-lexical-editor="true"]') ||
            document.querySelector('.chat-input textarea') ||
            document.querySelector('.cascade-input [contenteditable="true"]') ||
            document.querySelector('textarea:not(.xterm-helper-textarea)');
        if (editor) {
            editor.focus();
            return true;
        }
        return false;
    } catch (e) {
        return false;
    }
})()
`,
  list_chats: `/**
 * Windsurf v1 — list_chats
 * 
 * Cascade 탭 목록을 가져옵니다.
 * 패널이 닫혀 있으면 먼저 열고 탭이 렌더링될 때까지 대기합니다.
 * cascade-tab-{uuid} 요소들의 React Fiber에서 제목을 추출합니다.
 * 
 * 최종 확인: Windsurf 1.108.x (2026-03-10)
 */
(async () => {
    try {
        // ─── 1. 패널이 닫혀 있으면 열기 ───
        let tabs = document.querySelectorAll('[id^="cascade-tab-"]');
        if (tabs.length === 0) {
            // Cascade 패널 보이는지 확인
            const cascade = document.querySelector('#windsurf\\\\.cascadePanel') ||
                document.querySelector('.chat-client-root');
            const sidebar = document.getElementById('workbench.parts.auxiliarybar');
            const panelVisible = (cascade && cascade.offsetWidth > 0) ||
                (sidebar && sidebar.offsetWidth > 0 && cascade);

            if (!panelVisible) {
                // Toggle 버튼 클릭 시도
                const toggleBtns = Array.from(document.querySelectorAll('li.action-item a, button, [role="button"]'));
                let toggled = false;
                for (const btn of toggleBtns) {
                    const label = (btn.getAttribute('aria-label') || '').toLowerCase();
                    if (label.includes('toggle cascade') || label.includes('toggle secondary') ||
                        label.includes('toggle auxiliary') || label.includes('cascade')) {
                        if (btn.offsetWidth > 0 || btn.offsetHeight > 0) {
                            btn.click();
                            toggled = true;
                            break;
                        }
                    }
                }
                // 버튼 없으면 Cmd+L
                if (!toggled) {
                    document.dispatchEvent(new KeyboardEvent('keydown', {
                        key: 'l', code: 'KeyL', keyCode: 76,
                        metaKey: true, ctrlKey: false,
                        bubbles: true, cancelable: true,
                    }));
                    document.dispatchEvent(new KeyboardEvent('keyup', {
                        key: 'l', code: 'KeyL', keyCode: 76,
                        metaKey: true, ctrlKey: false,
                        bubbles: true, cancelable: true,
                    }));
                }

                // 패널 렌더링 대기 (최대 3초)
                for (let i = 0; i < 30; i++) {
                    await new Promise(r => setTimeout(r, 100));
                    tabs = document.querySelectorAll('[id^="cascade-tab-"]');
                    if (tabs.length > 0) break;
                }
            }
        }

        // ─── 2. 탭 정보 수집 ───
        tabs = document.querySelectorAll('[id^="cascade-tab-"]');
        if (tabs.length === 0) return [];

        const result = [];
        const seen = new Set();

        tabs.forEach(tab => {
            const tabId = tab.id.replace('cascade-tab-', '');
            if (seen.has(tabId)) return;
            seen.add(tabId);

            let title = '';
            let cascadeId = tabId;
            let status = 'completed';

            // React Fiber에서 제목 추출
            const fk = Object.keys(tab).find(k => k.startsWith('__reactFiber'));
            if (fk) {
                let fiber = tab[fk];
                for (let d = 0; d < 30 && fiber; d++) {
                    const p = fiber.memoizedProps;
                    if (p) {
                        if (p.title && typeof p.title === 'string') {
                            title = p.title;
                        }
                        if (p.cascadeId) {
                            cascadeId = p.cascadeId;
                        }
                        if (p.status && typeof p.status === 'string') {
                            status = p.status;
                        }
                        if (title) break;
                    }
                    fiber = fiber.return;
                }
            }

            // DOM 폴백
            if (!title) {
                title = tab.textContent?.trim().substring(0, 100) || ('Chat ' + (result.length + 1));
            }

            const isVisible = tab.offsetHeight > 0 && tab.offsetWidth > 0;

            result.push({
                id: tabId,
                title: title.substring(0, 100),
                status: status,
                active: isVisible
            });
        });

        return result;
    } catch (e) {
        return [];
    }
})()
`,
  list_models: `/**
 * Generic fallback — list_models
 */
(() => {
    try {
        const models = [];
        let current = '';

        // Try generic Model string from select/button
        const sel = document.querySelectorAll('select, [class*="model"], [id*="model"]');
        for (const el of sel) {
            const txt = (el.textContent || '').trim();
            if (txt && /claude|gpt|gemini|sonnet|opus/i.test(txt)) {
                if (txt.length < 50) {
                    models.push(txt);
                    if (!current) current = txt;
                }
            }
        }

        if (models.length === 0) {
            const btns = document.querySelectorAll('button');
            for (const b of btns) {
                const txt = (b.textContent || '').trim();
                if (txt && /claude|gpt|gemini|sonnet/i.test(txt) && txt.length < 30) {
                    models.push(txt);
                    current = txt;
                }
            }
        }

        return JSON.stringify({ 
            models: [...new Set(models)], 
            current: current || 'Default' 
        });
    } catch (e) {
        return JSON.stringify({ models: [], current: '', error: e.message });
    }
})()
`,
  list_modes: `/**
 * Generic fallback — list_models
 */
(() => {
    try {
        const models = [];
        let current = '';

        // Try generic Model string from select/button
        const sel = document.querySelectorAll('select, [class*="model"], [id*="model"]');
        for (const el of sel) {
            const txt = (el.textContent || '').trim();
            if (txt && /claude|gpt|gemini|sonnet|opus/i.test(txt)) {
                if (txt.length < 50) {
                    models.push(txt);
                    if (!current) current = txt;
                }
            }
        }

        if (models.length === 0) {
            const btns = document.querySelectorAll('button');
            for (const b of btns) {
                const txt = (b.textContent || '').trim();
                if (txt && /claude|gpt|gemini|sonnet/i.test(txt) && txt.length < 30) {
                    models.push(txt);
                    current = txt;
                }
            }
        }

        return JSON.stringify({ 
            models: [...new Set(models)], 
            current: current || 'Default' 
        });
    } catch (e) {
        return JSON.stringify({ models: [], current: '', error: e.message });
    }
})()
`,
  new_session: `/**
 * Windsurf v1 — new_session
 *
 * 새 Cascade 세션을 시작합니다.
 *
 * 전략:
 *   1. aria-label 기반 "New" 버튼 탐색
 *   2. 텍스트 기반 버튼 탐색
 *   3. Codicon 아이콘(+) 기반 탐색
 *   4. Cmd+L 단축키 폴백 (Windsurf에서 새 Cascade 열기)
 *
 * Windsurf에서는 Cascade가 AI 채팅 패널이며,
 * "New Chat" 또는 "+" 버튼으로 새 세션을 시작합니다.
 *
 * 최종 확인: Windsurf 1.108.x (2026-03-10)
 */
(() => {
    try {
        // ─── 1. aria-label 기반 ───
        const allBtns = Array.from(document.querySelectorAll('button, [role="button"], .action-item'))
            .filter(b => b.offsetWidth > 0);

        for (const btn of allBtns) {
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (label.includes('new chat') || label.includes('new cascade') ||
                label.includes('new conversation') || label.includes('start new') ||
                label.includes('new session')) {
                btn.click();
                return 'clicked (aria)';
            }
        }

        // ─── 2. 텍스트 기반 ───
        for (const btn of allBtns) {
            const text = (btn.textContent || '').trim();
            if (text === '+' || text === 'New Chat' || text === 'New Cascade' ||
                text === 'Start New Chat' || text === 'New Session') {
                btn.click();
                return 'clicked (text)';
            }
        }

        // ─── 3. Codicon 아이콘(+) 기반 ───
        for (const btn of allBtns) {
            const hasPlus = btn.querySelector('.codicon-plus, .codicon-add, [class*="plus"]');
            if (hasPlus) {
                const label = (btn.getAttribute('aria-label') || btn.getAttribute('title') || '').toLowerCase();
                // Cascade 관련 컨텍스트이거나 라벨이 비어있으면 새 세션 버튼일 가능성
                if (label.includes('chat') || label.includes('cascade') ||
                    label.includes('new') || label === '') {
                    btn.click();
                    return 'clicked (icon)';
                }
            }
        }

        // ─── 4. Cmd+L 단축키 (macOS: metaKey, Windows/Linux: ctrlKey) ───
        // Windsurf에서 Cmd+L은 Cascade 패널 토글/새 세션 생성
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'l', code: 'KeyL', keyCode: 76,
            metaKey: true, ctrlKey: false,
            bubbles: true, cancelable: true,
        }));

        return 'sent Cmd+L';
    } catch (e) {
        return 'error: ' + e.message;
    }
})()
`,
  open_panel: `/**
 * Windsurf v1 — open_panel
 *
 * Cascade(AI 채팅) 패널이 닫혀 있을 때 열기.
 *
 * Windsurf의 Cascade 패널은 Secondary Side Bar (#workbench.parts.auxiliarybar)에 위치.
 * 닫혀 있으면 offsetWidth === 0.
 * Cmd+L 단축키로 열 수 있음 (WINDSURF.md §2.5).
 *
 * 반환: 'visible' | 'opened' | 'error: ...'
 * 최종 확인: Windsurf 1.108.x (2026-03-10)
 */
(() => {
    try {
        // ─── 1. Cascade 패널이 이미 열려 있는지 확인 ───
        const cascade = document.querySelector('#windsurf\\\\.cascadePanel') ||
            document.querySelector('.chat-client-root');
        const sidebar = document.getElementById('workbench.parts.auxiliarybar');

        // 패널이 존재하고 보이면 이미 열린 상태
        if (cascade && cascade.offsetWidth > 0 && cascade.offsetHeight > 0) {
            return 'visible';
        }
        if (sidebar && sidebar.offsetWidth > 0 && sidebar.offsetHeight > 0 && cascade) {
            return 'visible';
        }

        // ─── 2. Toggle 버튼 클릭 시도 ───
        const toggleBtns = Array.from(document.querySelectorAll('li.action-item a, button, [role="button"]'));
        for (const btn of toggleBtns) {
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (label.includes('toggle cascade') || label.includes('toggle secondary') ||
                label.includes('toggle auxiliary') || label.includes('cascade')) {
                if (btn.offsetWidth > 0 || btn.offsetHeight > 0) {
                    btn.click();
                    return 'opened (toggle)';
                }
            }
        }

        // ─── 3. Cmd+L 단축키 폴백 (Windsurf 공식 단축키) ───
        // keyCode: 76, modifiers: 4 (Meta/Cmd)
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'l', code: 'KeyL', keyCode: 76,
            metaKey: true, ctrlKey: false,
            bubbles: true, cancelable: true,
        }));
        document.dispatchEvent(new KeyboardEvent('keyup', {
            key: 'l', code: 'KeyL', keyCode: 76,
            metaKey: true, ctrlKey: false,
            bubbles: true, cancelable: true,
        }));

        return 'opened (Cmd+L)';
    } catch (e) {
        return 'error: ' + e.message;
    }
})()
`,
  read_chat: `/**
 * Windsurf v1 — read_chat (v1 — Cascade DOM + Fiber)
 * 
 * Windsurf는 VS Code 포크, 채팅 UI를 "Cascade"라고 부릅니다.
 * 
 * DOM 구조:
 *   #windsurf.cascadePanel → .chat-client-root
 *   스크롤: .cascade-scrollbar
 *   메시지 리스트: .cascade-scrollbar .pb-20 > .flex.flex-col > .flex.flex-col.gap-2\\.5
 *   사용자 메시지: hasProse=false, hasWhitespace=true
 *   AI 메시지: [class*="prose"] (prose-sm)
 *   피드백 UI: .mark-js-ignore (무시)
 *   입력: [data-lexical-editor="true"]
 *   
 * Fiber props:
 *   cascadeId: 세션 ID
 *   isRunning: 생성 중 여부
 *   hasPendingTerminalCommand: 승인 대기
 *   copyableText: AI 응답 마크다운 원본
 * 
 * 최종 확인: Windsurf (2026-03-06)
 */
(() => {
    try {
        // ─── 1. 컨테이너 ───
        const cascade = document.querySelector('#windsurf\\\\.cascadePanel')
            || document.querySelector('.chat-client-root');
        if (!cascade) {
            return { id: 'no_cascade', status: 'idle', title: 'No Cascade', messages: [], inputContent: '', activeModal: null };
        }

        // ─── 2. Fiber에서 cascadeId, isRunning 추출 (턴 요소에서 탐색) ───
        let cascadeId = 'cascade';
        let isRunning = false;
        let hasPendingCmd = false;
        try {
            // 턴 요소에서 Fiber 탐색 (cascadePanel 루트보다 깊이 6에서 cascadeId 발견)
            const scrollArea = cascade.querySelector('.cascade-scrollbar');
            const gapEls = scrollArea ? scrollArea.querySelectorAll('[class*="gap-2"]') : [];
            let firstTurn = null;
            for (const el of gapEls) {
                if (el.children.length >= 1 && el.closest('.cascade-scrollbar')) {
                    firstTurn = el.children[0]; break;
                }
            }
            const fiberTarget = firstTurn || cascade;
            const fk = Object.keys(fiberTarget).find(k => k.startsWith('__reactFiber'));
            if (fk) {
                let fiber = fiberTarget[fk];
                for (let d = 0; d < 50 && fiber; d++) {
                    const p = fiber.memoizedProps || fiber.pendingProps || {};
                    if (p.cascadeId && typeof p.cascadeId === 'string') cascadeId = p.cascadeId;
                    if (p.isRunning === true) isRunning = true;
                    if (p.hasPendingTerminalCommand === true) hasPendingCmd = true;
                    fiber = fiber.return;
                }
            }
        } catch (_) { }

        // ─── 3. 상태 감지 ───
        let status = 'idle';
        if (isRunning) status = 'generating';

        // Signal A: Stop 버튼
        if (status === 'idle') {
            const allBtns = Array.from(document.querySelectorAll('button'));
            const stopBtn = allBtns.find(b => {
                if (b.offsetWidth === 0) return false;
                const label = (b.getAttribute('aria-label') || '').toLowerCase();
                const text = (b.textContent || '').trim().toLowerCase();
                return label.includes('stop') || label === 'cancel generation'
                    || text === 'stop' || text === 'stop generating';
            });
            if (stopBtn) status = 'generating';
        }

        // Signal B: 입력창 placeholder
        if (status === 'idle') {
            const editor = cascade.querySelector('[data-lexical-editor="true"]');
            if (editor) {
                const ph = (editor.getAttribute('placeholder') || '').toLowerCase();
                if (ph.includes('wait') || ph.includes('generating')) status = 'generating';
            }
        }

        const titleParts = document.title.split(' \\u2014 ');
        const title = (titleParts.length >= 2 ? titleParts[titleParts.length - 1] : titleParts[0] || '').trim() || 'Cascade';

        // ─── 4. HTML → Markdown 변환기 ───
        const BLOCK_TAGS = new Set(['DIV', 'P', 'BR', 'LI', 'TR', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER']);
        function extractCodeText(node) {
            if (node.nodeType === 3) return node.textContent || '';
            if (node.nodeType !== 1) return '';
            if (node.tagName === 'BR') return '\\n';
            const parts = [];
            for (const child of node.childNodes) {
                const isBlock = child.nodeType === 1 && BLOCK_TAGS.has(child.tagName);
                const text = extractCodeText(child);
                if (text) {
                    if (isBlock && parts.length > 0) parts.push('\\n');
                    parts.push(text);
                    if (isBlock) parts.push('\\n');
                }
            }
            return parts.join('').replace(/\\n{2,}/g, '\\n');
        }
        function htmlToMd(node) {
            if (node.nodeType === 3) return node.textContent || '';
            if (node.nodeType !== 1) return '';
            const tag = node.tagName;
            if (tag === 'STYLE' || tag === 'SCRIPT' || tag === 'SVG') return '';
            if (tag === 'TABLE') {
                const rows = Array.from(node.querySelectorAll('tr'));
                if (rows.length === 0) return '';
                const table = rows.map(tr =>
                    Array.from(tr.querySelectorAll('th, td')).map(cell => (cell.textContent || '').trim().replace(/\\|/g, '\\\\|'))
                );
                const colCount = Math.max(...table.map(r => r.length));
                const header = table[0] || [];
                const sep = Array(colCount).fill('---');
                const body = table.slice(1);
                let md = '| ' + header.join(' | ') + ' |\\n';
                md += '| ' + sep.join(' | ') + ' |\\n';
                for (const row of body) {
                    while (row.length < colCount) row.push('');
                    md += '| ' + row.join(' | ') + ' |\\n';
                }
                return '\\n' + md + '\\n';
            }
            if (tag === 'UL') return '\\n' + Array.from(node.children).map(li => '- ' + childrenToMd(li).trim()).join('\\n') + '\\n';
            if (tag === 'OL') return '\\n' + Array.from(node.children).map((li, i) => (i + 1) + '. ' + childrenToMd(li).trim()).join('\\n') + '\\n';
            if (tag === 'LI') return childrenToMd(node);
            if (tag === 'H1') return '\\n# ' + childrenToMd(node).trim() + '\\n';
            if (tag === 'H2') return '\\n## ' + childrenToMd(node).trim() + '\\n';
            if (tag === 'H3') return '\\n### ' + childrenToMd(node).trim() + '\\n';
            if (tag === 'H4') return '\\n#### ' + childrenToMd(node).trim() + '\\n';
            if (tag === 'STRONG' || tag === 'B') return '**' + childrenToMd(node).trim() + '**';
            if (tag === 'EM' || tag === 'I') return '*' + childrenToMd(node).trim() + '*';
            if (tag === 'PRE') {
                const codeEl = node.querySelector('code');
                const lang = codeEl ? (codeEl.className.match(/language-(\\w+)/)?.[1] || '') : '';
                const code = extractCodeText(codeEl || node);
                return '\\n\`\`\`' + lang + '\\n' + code.trim() + '\\n\`\`\`\\n';
            }
            if (tag === 'CODE') {
                if (node.parentElement && node.parentElement.tagName === 'PRE') return node.textContent || '';
                return '\`' + (node.textContent || '').trim() + '\`';
            }
            if (tag === 'BLOCKQUOTE') return '\\n> ' + childrenToMd(node).trim().replace(/\\n/g, '\\n> ') + '\\n';
            if (tag === 'A') return '[' + childrenToMd(node).trim() + '](' + (node.getAttribute('href') || '') + ')';
            if (tag === 'BR') return '\\n';
            if (tag === 'P') return '\\n' + childrenToMd(node).trim() + '\\n';
            return childrenToMd(node);
        }
        function childrenToMd(node) {
            return Array.from(node.childNodes).map(htmlToMd).join('');
        }

        function getCleanMd(el) {
            const clone = el.cloneNode(true);
            clone.querySelectorAll('button, [role="button"], style, script, svg, .codicon, [class*="feedback"]').forEach(n => n.remove());
            clone.querySelectorAll('*').forEach(child => {
                if (!child.parentNode) return;
                const t = (child.textContent || '').trim();
                if (t.length > 60) return;
                const low = t.toLowerCase();
                if (/^(analyzed\\s+\\d|edited\\s+\\d|ran\\s+\\S|terminal\\s|reading|searching)/i.test(low)) child.remove();
            });
            let md = htmlToMd(clone);
            md = md.replace(/\\n{3,}/g, '\\n\\n').trim();
            return md;
        }

        // ─── 5. 메시지 수집 ───
        const collected = [];
        const seenHashes = new Set();

        const scrollArea = cascade.querySelector('.cascade-scrollbar');
        if (!scrollArea) {
            return { id: cascadeId, status, title, messages: [], inputContent: '', activeModal: null };
        }

        // 메시지 리스트 컨테이너 찾기: .gap-2.5 중 자식 2개 이상
        let msgContainer = null;
        const gapEls = scrollArea.querySelectorAll('[class*="gap-2"]');
        for (const el of gapEls) {
            if (el.children.length >= 2 && el.closest('.cascade-scrollbar')) {
                msgContainer = el; break;
            }
        }

        if (msgContainer) {
            const turns = Array.from(msgContainer.children);
            for (const turn of turns) {
                // .mark-js-ignore = 피드백 UI → 무시
                if ((turn.className || '').includes('mark-js-ignore')) continue;
                if (turn.offsetHeight < 10) continue;

                // 역할 판별: .prose = AI, 아니면 user
                const proseEl = turn.querySelector('[class*="prose"]');
                const role = proseEl ? 'assistant' : 'user';

                let text = '';
                if (role === 'assistant') {
                    // AI: Fiber copyableText가 있으면 사용 (이미 마크다운!)
                    try {
                        const fk = Object.keys(turn).find(k => k.startsWith('__reactFiber'));
                        if (fk) {
                            let fiber = turn[fk];
                            for (let d = 0; d < 20 && fiber; d++) {
                                const p = fiber.memoizedProps || {};
                                if (p.copyableText && typeof p.copyableText === 'string' && p.copyableText.length > 5) {
                                    text = p.copyableText;
                                    break;
                                }
                                fiber = fiber.return;
                            }
                        }
                    } catch (_) { }

                    // Fiber에 없으면 HTML→Markdown
                    if (!text) {
                        const mdRoot = proseEl || turn;
                        text = getCleanMd(mdRoot);
                    }
                } else {
                    // 사용자: whitespace-pre-wrap 요소에서 텍스트 추출
                    const whitespace = turn.querySelector('[class*="whitespace"]');
                    text = (whitespace || turn).innerText?.trim() || '';
                }

                if (!text || text.length < 1) continue;

                const hash = role + ':' + text.slice(0, 200);
                if (seenHashes.has(hash)) continue;
                seenHashes.add(hash);
                collected.push({ role, text, el: turn });
            }
        }

        // DOM 순서 정렬
        collected.sort((a, b) => {
            const pos = a.el.compareDocumentPosition(b.el);
            if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
            if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
            return 0;
        });

        // 최신 30개만
        const trimmed = collected.length > 30 ? collected.slice(-30) : collected;

        const final = trimmed.map((m, i) => ({
            id: 'msg_' + i,
            role: m.role,
            content: m.text.length > 6000 ? m.text.slice(0, 6000) + '\\n[... truncated]' : m.text,
            index: i,
            kind: 'standard'
        }));

        // ─── 6. 입력창 ───
        const editor = cascade.querySelector('[data-lexical-editor="true"]')
            || cascade.querySelector('[contenteditable="true"][role="textbox"]')
            || cascade.querySelector('textarea:not(.xterm-helper-textarea)');
        const inputContent = editor ? (editor.innerText || editor.value || '').trim() : '';

        // ─── 7. 모달/승인 감지 ───
        let activeModal = null;
        try {
            // Fiber: hasPendingTerminalCommand
            if (hasPendingCmd) {
                const allBtns = Array.from(document.querySelectorAll('button')).filter(b => b.offsetWidth > 0);
                const approvalBtns = allBtns.filter(b => {
                    const t = (b.textContent || '').trim().toLowerCase();
                    return /^(run|reject|skip|approve|allow|deny|cancel|accept)\\b/i.test(t);
                });
                const btnTexts = [...new Set(approvalBtns.map(b => (b.textContent || '').trim()).filter(t => t.length < 40))];
                activeModal = { message: 'Terminal command pending', buttons: btnTexts.length > 0 ? btnTexts : ['Run', 'Reject'] };
            }

            // Dialog 폴백
            if (!activeModal) {
                const dialog = document.querySelector('.monaco-dialog-box, [role="dialog"]');
                if (dialog && dialog.offsetWidth > 80) {
                    const msg = (dialog.querySelector('.dialog-message') || dialog).innerText?.trim() || '';
                    const buttons = Array.from(dialog.querySelectorAll('.monaco-button, button'))
                        .map(b => (b.innerText || '').trim()).filter(t => t.length > 0 && t.length < 30);
                    if (msg || buttons.length > 0) {
                        activeModal = { message: msg.slice(0, 300), buttons };
                    }
                }
            }

            // 인라인 승인 버튼
            if (!activeModal) {
                const allBtns = Array.from(document.querySelectorAll('button')).filter(b => b.offsetWidth > 0);
                const approvalBtns = allBtns.filter(b => {
                    const t = (b.textContent || '').trim().toLowerCase();
                    if (t.length > 40) return false;
                    return /^(run|reject|skip|approve|allow|deny)\\b/i.test(t)
                        || t === 'always allow' || t === 'always deny';
                });
                if (approvalBtns.length >= 2) {
                    const btnTexts = [...new Set(approvalBtns.map(b => (b.textContent || '').trim()))];
                    activeModal = { message: '', buttons: btnTexts };
                }
            }

            if (activeModal) status = 'waiting_approval';
        } catch (_) { activeModal = null; }

        return { id: cascadeId, status, title, messages: final, inputContent, activeModal };
    } catch (e) {
        return { id: 'error', status: 'error', error: e.message, messages: [] };
    }
})()
`,
  resolve_action: `/**
 * Windsurf v1 — resolve_action
 * 
 * 승인 다이얼로그/인라인 버튼을 클릭합니다.
 * 
 * 파라미터: \${ BUTTON_TEXT } — 클릭할 버튼 텍스트 (lowercase)
 * 
 * 최종 확인: Windsurf (2026-03-06)
 */
(() => {
    try {
        const want = \${ BUTTON_TEXT };
        const normalize = (s) => (s || '').replace(/[\\s\\u200b\\u00a0]+/g, ' ').trim().toLowerCase();
        const matches = (text) => {
            const t = normalize(text);
            if (!t) return false;
            if (t === want) return true;
            if (t.indexOf(want) === 0) return true;
            if (want === 'run' && (/^run\\s*/.test(t) || t === 'enter' || t === '⏎')) return true;
            if (want === 'approve' && (t.includes('approve') || t === 'always allow' || t === 'allow')) return true;
            if (want === 'reject' && (t.includes('reject') || t === 'deny' || t === 'always deny')) return true;
            return false;
        };
        const click = (el) => {
            el.focus?.();
            const rect = el.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
                el.dispatchEvent(new PointerEvent(type, {
                    bubbles: true, cancelable: true, view: window,
                    clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse'
                }));
            }
            return true;
        };

        // 1. Dialog 내부
        const dialog = document.querySelector('.monaco-dialog-box, [role="dialog"]');
        if (dialog && dialog.offsetWidth > 80) {
            const btns = dialog.querySelectorAll('.monaco-button, button');
            for (const b of btns) {
                if (matches(b.textContent)) return click(b);
            }
        }

        // 2. 모든 보이는 버튼
        const sel = 'button, [role="button"], .monaco-button';
        const allBtns = Array.from(document.querySelectorAll(sel))
            .filter(b => b.offsetWidth > 0 && b.offsetHeight > 0);
        for (const b of allBtns) {
            if (matches(b.textContent)) return click(b);
        }

        // 3. Enter 키 폴백 (run)
        if (want === 'run') {
            document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter', code: 'Enter', keyCode: 13,
                bubbles: true, cancelable: true
            }));
            return true;
        }

        return false;
    } catch (e) {
        return false;
    }
})()
`,
  send_message: `/**
 * Windsurf v1 — send_message
 *
 * Windsurf는 Lexical 에디터 ([data-lexical-editor="true"])를 사용합니다.
 * contenteditable div이므로 execCommand('insertText') 또는 InputEvent로 입력 가능.
 *
 * ⚠️ Lexical은 입력 이벤트를 정밀하게 감지하므로:
 *   - execCommand('insertText')가 가장 안정적
 *   - nativeSetter 방식은 동작하지 않음
 *   - InputEvent('insertText')를 폴백으로 사용
 *
 * Enter 키는 KeyboardEvent 전체 시퀀스 필요 (keydown + keypress + keyup).
 *
 * 파라미터: \${ MESSAGE }
 * 최종 확인: Windsurf 1.108.x (2026-03-10)
 */
(async () => {
    try {
        const msg = \${ MESSAGE };

        // ─── 1. Lexical 에디터 찾기 (폴백 체인) ───
        const editor =
            document.querySelector('[data-lexical-editor="true"]') ||
            document.querySelector('[contenteditable="true"][role="textbox"]') ||
            document.querySelector('.cascade-input [contenteditable="true"]') ||
            document.querySelector('.chat-input textarea') ||
            document.querySelector('textarea:not(.xterm-helper-textarea)');

        if (!editor) return 'error: no input found';

        const isTextarea = editor.tagName === 'TEXTAREA';

        if (isTextarea) {
            // ─── textarea 폴백 (미로그인 등) ───
            editor.focus();
            const proto = HTMLTextAreaElement.prototype;
            const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
            if (nativeSetter) nativeSetter.call(editor, msg);
            else editor.value = msg;

            editor.dispatchEvent(new Event('input', { bubbles: true }));
            editor.dispatchEvent(new Event('change', { bubbles: true }));

            await new Promise(r => setTimeout(r, 300));

            const enterOpts = {
                key: 'Enter', code: 'Enter',
                keyCode: 13, which: 13,
                bubbles: true, cancelable: true, composed: true,
            };
            editor.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
            editor.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
            editor.dispatchEvent(new KeyboardEvent('keyup', enterOpts));

            return 'sent';
        }

        // ─── 2. contenteditable (Lexical) 에디터 ───
        editor.focus();

        // 기존 내용 선택 후 삭제
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);

        // 텍스트 삽입 (Lexical은 execCommand('insertText')를 인식)
        document.execCommand('insertText', false, msg);

        // React/Lexical에 변경 알림
        editor.dispatchEvent(new Event('input', { bubbles: true }));

        await new Promise(r => setTimeout(r, 300));

        // ─── 3. Enter 키 전송 (전체 시퀀스) ───
        const enterOpts = {
            key: 'Enter', code: 'Enter',
            keyCode: 13, which: 13,
            bubbles: true, cancelable: true, composed: true,
        };
        editor.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
        editor.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
        editor.dispatchEvent(new KeyboardEvent('keyup', enterOpts));

        return 'sent';
    } catch (e) {
        return 'error: ' + e.message;
    }
})()
`,
  set_mode: `/**
 * Generic fallback — set_model
 * \${ MODEL }
 */
(() => {
    try {
        const want = \${ MODEL } || '';
        const norm = (t) => t.toLowerCase().trim();

        // Very basic click attempt
        return JSON.stringify({ success: false, error: 'Model selection requires UI interaction not supported by generic script' });
    } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
    }
})()
`,
  set_model: `/**
 * Generic fallback — set_model
 * \${ MODEL }
 */
(() => {
    try {
        const want = \${ MODEL } || '';
        const norm = (t) => t.toLowerCase().trim();

        // Very basic click attempt
        return JSON.stringify({ success: false, error: 'Model selection requires UI interaction not supported by generic script' });
    } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
    }
})()
`,
  switch_session: `/**
 * Windsurf v1 — switch_session
 * 
 * Cascade 세션(대화) 탭을 전환합니다.
 * cascade-tab-{id} 내부의 실제 클릭 가능한 자식 DIV의
 * React onClick 핸들러를 직접 호출합니다.
 * 
 * 파라미터: \${ SESSION_ID } — 전환할 세션 ID (cascade-tab의 UUID)
 * 
 * 최종 확인: Windsurf 1.108.x (2026-03-10)
 */
(() => {
    try {
        const id = \${ SESSION_ID };

        // Helper: find React onClick on an element or its children
        function clickReact(el) {
            // Check element itself and children for React onClick
            const targets = [el, ...el.querySelectorAll('*')];
            for (const t of targets) {
                const rp = Object.keys(t).find(k => k.startsWith('__reactProps'));
                if (rp && typeof t[rp].onClick === 'function') {
                    t[rp].onClick({
                        preventDefault: () => { },
                        stopPropagation: () => { },
                        nativeEvent: { stopImmediatePropagation: () => { } },
                        target: t, currentTarget: t, button: 0, type: 'click'
                    });
                    return true;
                }
            }
            return false;
        }

        // 1. cascade-tab-{id} 요소 찾기
        const tab = document.getElementById('cascade-tab-' + id);
        if (tab) {
            if (clickReact(tab)) return 'switched';
            // Fallback: DOM click
            tab.click();
            return 'switched-dom';
        }

        // 2. 제목으로 매칭
        const tabs = document.querySelectorAll('[id^="cascade-tab-"]');
        for (const t of tabs) {
            if (t.textContent?.trim() === id) {
                if (clickReact(t)) return 'switched-by-title';
                t.click();
                return 'switched-by-title-dom';
            }
        }

        return 'not_found';
    } catch (e) {
        return 'error: ' + e.message;
    }
})()
`,
};
