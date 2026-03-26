module.exports = {
  focus_editor: `/**
 * Cursor v1 — focus_editor
 *
 * CURSOR.md 4-5: 셀렉터 우선순위
 *   [contenteditable="true"][role="textbox"]
 *   → .chat-input textarea
 *   → .composer-input
 *   → textarea
 *
 * 최종 확인: 2026-03-06
 */
(() => {
    const editor = document.querySelector('[contenteditable="true"][role="textbox"]')
        || document.querySelector('.chat-input textarea')
        || document.querySelector('.composer-input')
        || document.querySelector('textarea.native-input')
        || document.querySelector('textarea');
    if (editor) { editor.focus(); return 'focused'; }
    return 'no editor found';
})()
`,
  list_sessions: `/**
 * PearAI — list_sessions (IDE 메인 프레임에서 실행)
 * 
 * 히스토리 패널 토글 버튼을 클릭하여 히스토리 뷰를 오픈합니다.
 * 히스토리 뷰가 열리면 webviewListSessions로 항목을 읽을 수 있습니다.
 */
(() => {
    try {
        // Panel title bar에서 히스토리 관련 버튼 찾기
        const actionBtns = document.querySelectorAll('.action-item a.action-label, .action-item .action-label');
        for (const btn of actionBtns) {
            const title = (btn.getAttribute('title') || '').toLowerCase();
            const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
            const cls = btn.className || '';
            
            if (title.includes('history') || title.includes('히스토리') ||
                ariaLabel.includes('history') || ariaLabel.includes('히스토리') ||
                cls.includes('codicon-history')) {
                btn.click();
                return JSON.stringify({ toggled: true, method: 'panelAction', title: btn.getAttribute('title') });
            }
        }

        // Broader search
        const allBtns = document.querySelectorAll('a[title], button[title]');
        for (const btn of allBtns) {
            const title = (btn.getAttribute('title') || '').toLowerCase();
            if (title.includes('history') || title.includes('task history')) {
                btn.click();
                return JSON.stringify({ toggled: true, method: 'titleBtn', title: btn.getAttribute('title') });
            }
        }

        return JSON.stringify({ toggled: false, error: 'History toggle button not found' });
    } catch (e) {
        return JSON.stringify({ toggled: false, error: e.message });
    }
})()
`,
  new_session: `/**
 * PearAI — new_session (IDE 메인 프레임에서 실행)
 * 
 * Panel title bar의 "+" 버튼(New Task)을 찾아 클릭합니다.
 * PearAI(Roo Code 기반)에서 새 태스크 버튼은 webview 바깥의 VS Code panel 헤더에 위치합니다.
 */
(() => {
    try {
        // Strategy 1: Find the codicon-add / plus button in panel title actions
        const actionBtns = document.querySelectorAll('.panel .title .actions-container .action-item a, .pane-header .actions-container .action-item a, .title-actions .action-item a');
        for (const btn of actionBtns) {
            const title = btn.getAttribute('title') || '';
            const ariaLabel = btn.getAttribute('aria-label') || '';
            const cls = btn.className || '';
            
            if (title.toLowerCase().includes('new task') || 
                title.toLowerCase().includes('new chat') ||
                ariaLabel.toLowerCase().includes('new task') ||
                ariaLabel.toLowerCase().includes('new chat') ||
                cls.includes('codicon-add') ||
                cls.includes('codicon-plus')) {
                btn.click();
                return JSON.stringify({ created: true, method: 'panelAction', title: title || ariaLabel });
            }
        }

        // Strategy 2: Broader search for action items with "+" or "new" 
        const allActions = document.querySelectorAll('.action-item a.action-label');
        for (const a of allActions) {
            const title = (a.getAttribute('title') || '').toLowerCase();
            const cls = a.className || '';
            if ((title.includes('new') && title.includes('task')) ||
                (title.includes('plus') || cls.includes('codicon-add'))) {
                a.click();
                return JSON.stringify({ created: true, method: 'actionLabel', title: a.getAttribute('title') });
            }
        }

        // Strategy 3: Use keybinding (Cmd+Shift+P -> "new task")
        // Simulate keyboard shortcut for Roo Code: typically there's a command 
        // registered as roo-cline.plusButtonClicked or similar
        const allBtns = document.querySelectorAll('a[title], button[title]');
        const matches = [];
        for (const btn of allBtns) {
            const t = btn.getAttribute('title') || '';
            if (t.toLowerCase().includes('new') || t.toLowerCase().includes('plus') || t === '+') {
                matches.push({ tag: btn.tagName, title: t, cls: (btn.className || '').substring(0, 60) });
            }
        }

        return JSON.stringify({ created: false, error: 'New Task button not found in panel', candidates: matches.slice(0, 5) });
    } catch (e) {
        return JSON.stringify({ created: false, error: e.message });
    }
})()
`,
  open_panel: `/**
 * PearAI — open_panel
 *
 * PearAI 채팅 패널 열기.
 * "Toggle PearAI Side Bar (⌘;)" 버튼으로 열기.
 *
 * 반환: 'visible' | 'opened' | 'error: ...'
 */
(() => {
    try {
        // 1. 이미 열려 있는지 확인
        const sidebar = document.getElementById('workbench.parts.auxiliarybar');
        if (sidebar && sidebar.offsetWidth > 0 && sidebar.offsetHeight > 0) {
            return 'visible';
        }

        // 2. Toggle 버튼 클릭 시도
        const toggleBtns = Array.from(document.querySelectorAll('li.action-item a, button, [role="button"]'));
        for (const btn of toggleBtns) {
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (label.includes('toggle pearai') || label.includes('toggle secondary') ||
                label.includes('toggle auxiliary')) {
                if (btn.offsetWidth > 0 || btn.offsetHeight > 0) {
                    btn.click();
                    return 'opened (toggle)';
                }
            }
        }

        // 3. Cmd+; 단축키 폴백 (PearAI 기본 단축키)
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: ';', code: 'Semicolon', keyCode: 186,
            metaKey: true, ctrlKey: false,
            bubbles: true, cancelable: true,
        }));
        document.dispatchEvent(new KeyboardEvent('keyup', {
            key: ';', code: 'Semicolon', keyCode: 186,
            metaKey: true, ctrlKey: false,
            bubbles: true, cancelable: true,
        }));

        return 'opened (⌘;)';
    } catch (e) {
        return 'error: ' + e.message;
    }
})()
`,
  resolve_action: `/**
 * PearAI — resolve_action
 *
 * 승인/거부 버튼 찾기 + 좌표 반환.
 * PearAI의 approval 다이얼로그는 메인 DOM에 표시됨.
 *
 * 파라미터: \${ BUTTON_TEXT }
 */
(() => {
    const want = \${ BUTTON_TEXT };
    const wantNorm = (want || '').replace(/\\s+/g, ' ').trim().toLowerCase();

    function norm(t) { return (t || '').replace(/\\s+/g, ' ').trim().toLowerCase(); }

    function matches(el) {
        const t = norm(el.textContent);
        if (!t || t.length > 80) return false;
        if (t === wantNorm) return true;
        if (t.indexOf(wantNorm) === 0) return true;
        if (wantNorm.indexOf(t) >= 0 && t.length > 2) return true;
        if (/^(run|approve|allow|accept|yes)\\b/.test(wantNorm)) {
            if (/^(run|allow|accept|approve)\\b/.test(t)) return true;
        }
        if (/^(reject|deny|no|abort)\\b/.test(wantNorm)) {
            if (/^(reject|deny)\\b/.test(t)) return true;
        }
        return false;
    }

    const sel = 'button, [role="button"], .monaco-button';
    const allBtns = [...document.querySelectorAll(sel)].filter(b => {
        if (!b.offsetWidth || !b.getBoundingClientRect().height) return false;
        const rect = b.getBoundingClientRect();
        return rect.y > 0 && rect.y < window.innerHeight;
    });

    let found = null;
    for (let i = allBtns.length - 1; i >= 0; i--) {
        if (matches(allBtns[i])) { found = allBtns[i]; break; }
    }

    if (found) {
        const rect = found.getBoundingClientRect();
        return JSON.stringify({
            found: true,
            text: found.textContent?.trim()?.substring(0, 40),
            x: Math.round(rect.x + rect.width / 2),
            y: Math.round(rect.y + rect.height / 2),
            w: Math.round(rect.width),
            h: Math.round(rect.height)
        });
    }
    return JSON.stringify({ found: false, want: wantNorm });
})()
`,
  send_message: `/**
 * PearAI — send_message
 *
 * PearAI의 채팅 입력은 webview iframe 안에 있어 메인 DOM에서 직접 접근 불가.
 * auxbar 하단의 입력 필드 좌표를 계산하여 clickCoords로 반환.
 * 데몬이 CDP Input API로 해당 좌표에 클릭+타이핑+Enter를 수행.
 *
 * 파라미터: \${ MESSAGE }
 */
(() => {
    try {
        const auxbar = document.getElementById('workbench.parts.auxiliarybar');
        if (!auxbar || auxbar.offsetWidth === 0) {
            return JSON.stringify({ sent: false, error: 'auxbar not found' });
        }

        const rect = auxbar.getBoundingClientRect();
        const x = Math.round(rect.x + rect.width / 2);
        const y = Math.round(rect.y + rect.height - 80);

        return JSON.stringify({
            sent: false,
            needsTypeAndSend: true,
            clickCoords: { x, y },
        });
    } catch (e) {
        return JSON.stringify({ sent: false, error: e.message });
    }
})()
`,
  webview_list_models: `/**
 * Cline — list_models
 * 드롭다운에서 사용 가능한 모델 목록 + 현재 선택된 모델 반환
 * → { models: string[], current: string }
 */
(async () => {
    try {
        const inner = document.querySelector('iframe');
        const doc = inner?.contentDocument || inner?.contentWindow?.document;
        if (!doc) return JSON.stringify({ models: [], current: '', error: 'no doc' });

        // 현재 모델: mode-switch 또는 model selector에서 읽기
        let current = '';
        const modeSwitch = doc.querySelector('[data-testid="mode-switch"]');
        if (modeSwitch) current = (modeSwitch.textContent || '').trim();
        if (!current) {
            const modelSel = doc.querySelector('[data-testid*="model"], [aria-label*="model" i]');
            if (modelSel) current = (modelSel.textContent || '').trim();
        }

        // 드롭다운 트리거 찾기
        const trigger = doc.querySelector('[data-testid="model-selector"], [data-testid*="model-dropdown"], [data-testid="dropdown-trigger"]');
        if (!trigger) return JSON.stringify({ models: [], current, error: 'no model trigger' });

        // 드롭다운 열기
        trigger.click();
        await new Promise(r => setTimeout(r, 300));

        // 옵션 수집
        const options = doc.querySelectorAll('[data-testid*="dropdown-option"], [role="option"], [class*="dropdown"] [class*="item"], [class*="listbox"] [class*="option"]');
        const models = [];
        for (const opt of options) {
            const text = (opt.textContent || '').trim();
            if (text && text.length > 1 && text.length < 100) models.push(text);
        }

        // 닫기
        doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        if (trigger.click) trigger.click(); // fallback close

        return JSON.stringify({ models: [...new Set(models)], current });
    } catch (e) { return JSON.stringify({ models: [], current: '', error: e.message }); }
})()
`,
  webview_list_modes: `/**
 * Cline — list_modes
 * 모드 selector에서 사용 가능한 모드 목록 + 현재 모드 반환
 * → { modes: string[], current: string }
 */
(async () => {
    try {
        const inner = document.querySelector('iframe');
        const doc = inner?.contentDocument || inner?.contentWindow?.document;
        if (!doc) return JSON.stringify({ modes: [], current: '', error: 'no doc' });

        // 현재 모드
        const trigger = doc.querySelector('[data-testid="mode-selector-trigger"], [data-testid="mode-switch"]');
        if (!trigger) return JSON.stringify({ modes: [], current: '', error: 'no mode trigger' });
        const current = (trigger.textContent || '').trim();

        // 드롭다운 열기
        trigger.click();
        await new Promise(r => setTimeout(r, 300));

        // 옵션 수집
        const options = doc.querySelectorAll('[data-testid*="mode-option"], [role="option"], [class*="dropdown"] [class*="item"], [class*="listbox"] [class*="option"]');
        const modes = [];
        for (const opt of options) {
            const text = (opt.textContent || '').trim();
            if (text && text.length > 1 && text.length < 50) modes.push(text);
        }

        // 닫기
        doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        if (trigger.click) trigger.click(); // fallback close

        return JSON.stringify({ modes: [...new Set(modes)], current });
    } catch (e) { return JSON.stringify({ modes: [], current: '', error: e.message }); }
})()
`,
  webview_list_sessions: `/**
 * PearAI — webview_list_sessions (webview iframe 내부에서 실행)
 *
 * PearAI(Roo Code/Cline 기반) 히스토리 뷰에서 세션 목록을 추출.
 * 각 항목은 data-testid="task-item-{UUID}" 로 식별됨.
 */
(() => {
    try {
        // ─── 히스토리 항목: data-testid="task-item-*" ───
        const taskItems = document.querySelectorAll('[data-testid^="task-item-"]');
        
        if (taskItems.length > 0) {
            const sessions = [];
            for (let i = 0; i < taskItems.length; i++) {
                const item = taskItems[i];
                if (!item) continue;
                
                const testId = item.getAttribute('data-testid') || '';
                const taskId = testId.replace('task-item-', '');
                
                // 전체 텍스트에서 제목 추출
                const fullText = (item.textContent || '').trim();
                
                // 구조: "MARCH 16, 1:31 AM 173 B test123 Tokens:10.4k 229"
                // 전략: Tokens: 앞의 마지막 의미있는 텍스트를 제목으로 사용
                let title = '';
                let date = '';
                
                // 날짜 추출
                const dateMatch = fullText.match(/^([A-Z]+\\s+\\d+,\\s*\\d+:\\d+\\s*[AP]M)/);
                if (dateMatch) date = dateMatch[1];
                
                // 제목 추출: 날짜와 크기(B/kB) 뒤, Tokens: 앞
                const titleMatch = fullText.match(/[AP]M[\\d.\\s]*[kMG]?B\\s*(.*?)(?:Tokens:|$)/s);
                if (titleMatch && titleMatch[1]) {
                    title = titleMatch[1].trim();
                }
                
                // fallback: 첫 80자
                if (!title) {
                    title = fullText.substring(0, 80);
                }
                
                sessions.push({
                    id: taskId,
                    title: title.substring(0, 100),
                    date: date,
                    active: false
                });
            }
            return JSON.stringify({ sessions: sessions });
        }

        // ─── 히스토리 뷰가 열려 있지 않음 ───
        return JSON.stringify({ 
            sessions: [], 
            note: 'History view not open. Toggle history first.' 
        });
    } catch (e) {
        return JSON.stringify({ sessions: [], error: String(e.message || e) });
    }
})()
`,
  webview_new_session: `/**
 * PearAI — webview_new_session (webview iframe 내부에서 실행)
 *
 * Roo Code/Cline 기반 PearAI에서 새 세션(태스크)을 시작합니다.
 * 1) "New Task" 텍스트를 가진 버튼 클릭 시도
 * 2) 실패 시, vscode postMessage API로 newTask 명령 전송 시도
 * 3) 실패 시, chat-text-area를 초기화하여 새 세션 상태로 진입
 */
(() => {
    try {
        // Strategy 1: Find "New Task" button text
        const buttons = document.querySelectorAll('button, [role="button"]');
        for (const btn of buttons) {
            const text = (btn.textContent || '').trim();
            if (text.includes('Start New Task') || text.includes('New Task') || text.includes('New Chat')) {
                btn.click();
                return JSON.stringify({ created: true, method: 'button', text });
            }
        }

        // Strategy 2: Look for a "+" (plus/add) button that might create new tasks
        for (const btn of buttons) {
            const title = btn.getAttribute('title') || '';
            const ariaLabel = btn.getAttribute('aria-label') || '';
            if (title.includes('New') || ariaLabel.includes('New') || 
                title.includes('new') || ariaLabel.includes('new')) {
                btn.click();
                return JSON.stringify({ created: true, method: 'title', title: title || ariaLabel });
            }
        }

        // Strategy 3: Use vscode API to post message for new task
        if (typeof acquireVsCodeApi !== 'undefined') {
            const vscode = acquireVsCodeApi();
            vscode.postMessage({ type: 'newTask' });
            return JSON.stringify({ created: true, method: 'vscodeApi' });
        }

        // Strategy 4: If already in empty state (no messages), report as already new
        const messages = document.querySelectorAll('[class*="message"], [class*="chat-row"]');
        if (messages.length === 0) {
            return JSON.stringify({ created: true, method: 'alreadyNew', note: 'No messages - already in new session state' });
        }

        return JSON.stringify({ created: false, error: 'New Task button not found' });
    } catch (e) {
        return JSON.stringify({ created: false, error: e.message });
    }
})()
`,
  webview_read_chat: `/**
 * PearAI — webview_read_chat (webview iframe 내부에서 실행)
 *
 * PearAI는 Roo Code / Cline 기반의 Agent 패널을 사용.
 * React로 렌더링된 DOM에서 메시지를 파싱.
 *
 * DOM 단서:
 *   - textarea.chat-text-area: 입력 필드
 *   - Task: ... : 유저 메시지
 *   - API Request 등: 시스템 메시지
 *
 * 반환: ReadChatResult { id, status, messages, inputContent? }
 */
(() => {
    try {
        const messages = [];

        // 메시지 블록 찾기 — 다양한 셀렉터 시도
        // Cline/Roo Code 기반이므로 유사한 구조
        const allText = document.body?.textContent || '';

        // Task 헤더에서 유저 메시지
        const taskEl = document.querySelector('[class*="task-header"], [class*="TaskHeader"]');
        if (taskEl) {
            const taskText = taskEl.textContent?.trim() || '';
            if (taskText) {
                messages.push({ role: 'user', content: taskText.replace(/^Task:\\s*/i, ''), index: 0 });
            }
        }

        // 채팅 메시지 영역 파싱 — 공통 클래스
        const chatMessages = document.querySelectorAll('[class*="chat-row"], [class*="ChatRow"], [class*="message-row"], [class*="MessageRow"]');
        chatMessages.forEach((msg, idx) => {
            const text = msg.textContent?.trim() || '';
            if (!text) return;

            // role 판정 — 클래스명이나 아이콘으로
            const isUser = msg.querySelector('[class*="user"]') != null || msg.classList.toString().includes('user');
            messages.push({
                role: isUser ? 'user' : 'assistant',
                content: text.substring(0, 2000),
                index: idx,
            });
        });

        // 메시지가 없으면 전체 텍스트에서 추출
        if (messages.length === 0 && allText.length > 50) {
            // Task: 패턴 찾기
            const taskMatch = allText.match(/Task:\\s*(.+?)(?:\\d+[\\d.,]*k|\\d+\\s*$)/s);
            if (taskMatch) {
                messages.push({ role: 'user', content: taskMatch[1].trim().substring(0, 500), index: 0 });
            }
            // AI 응답 찾기 (간략화)
            const bodyContent = allText.substring(0, 2000);
            if (bodyContent.includes('API Request') || bodyContent.includes('Initial Checkpoint')) {
                // 응답이 있음을 표시
                messages.push({ role: 'assistant', content: '(response in progress or completed)', index: 1 });
            }
        }

        // 상태 감지
        let status = 'idle';
        const cancelBtn = document.querySelector('button[class*="cancel"], [aria-label*="cancel" i]');
        if (cancelBtn && cancelBtn.offsetWidth > 0 && cancelBtn.textContent?.toLowerCase().includes('cancel')) {
            status = 'generating';
        }

        // API Request... (로딩) → generating
        const loadingEl = document.querySelector('[class*="loading"], [class*="spinner"]');
        if (loadingEl && loadingEl.offsetWidth > 0) {
            status = 'generating';
        }

        // "Retrying" → error/generating
        if (allText.includes('Retrying in') || allText.includes('Retry attempt')) {
            status = 'generating';
        }

        // 입력 필드
        const textarea = document.querySelector('textarea[placeholder*="Type"], textarea.chat-text-area, textarea');
        const inputContent = textarea ? textarea.value || textarea.textContent?.trim() : '';

        return JSON.stringify({
            id: 'pearai-agent',
            status,
            messages,
            inputContent: inputContent || undefined,
        });
    } catch (e) {
        return JSON.stringify({ id: '', status: 'error', messages: [], error: e.message });
    }
})()
`,
  webview_resolve_action: `/**
 * PearAI — webview_resolve_action
 *
 * PearAI Agent(Roo Code 기반)는 승인/거절 버튼을 webview 내부에 렌더링함.
 * 버튼을 찾아 직접 click() 이벤트 발생.
 *
 * 파라미터: \${ BUTTON_TEXT }
 */
(() => {
    try {
        const want = \${ BUTTON_TEXT };
        const wantNorm = (want || '').replace(/\\s+/g, ' ').trim().toLowerCase();

        function norm(t) { return (t || '').replace(/\\s+/g, ' ').trim().toLowerCase(); }

        function matches(el) {
            const t = norm(el.textContent);
            if (!t || t.length > 80) return false;
            if (t === wantNorm) return true;
            if (t.indexOf(wantNorm) === 0) return true;
            if (wantNorm.indexOf(t) >= 0 && t.length > 2) return true;
            if (/^(run|approve|allow|accept|yes)\\b/.test(wantNorm)) {
                if (/^(run|allow|accept|approve)\\b/.test(t)) return true;
            }
            if (/^(reject|deny|no|abort)\\b/.test(wantNorm)) {
                if (/^(reject|deny)\\b/.test(t)) return true;
            }
            return false;
        }

        const sel = 'button, [role="button"], .vsc-button';
        const allBtns = [...document.querySelectorAll(sel)].filter(b => b.offsetWidth > 0 && b.offsetHeight > 0);

        let found = null;
        for (let i = allBtns.length - 1; i >= 0; i--) {
            if (matches(allBtns[i])) { found = allBtns[i]; break; }
        }

        if (found) {
            found.focus?.();
            const rect = found.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
                found.dispatchEvent(new PointerEvent(type, {
                    bubbles: true, cancelable: true, view: window,
                    clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse'
                }));
            }
            return JSON.stringify({
                resolved: true,
                clicked: found.textContent || wantNorm
            });
        }
        return JSON.stringify({ resolved: false, error: 'Button not found: ' + wantNorm });
    } catch (e) {
        return JSON.stringify({ resolved: false, error: e.message });
    }
})()
`,
  webview_send_message: `/**
 * Kiro — webview_send_message (webview iframe 내부에서 실행)
 *
 * Kiro의 채팅 입력은 webview iframe 안의 ProseMirror/tiptap 에디터.
 * execCommand('insertText') + Enter 키 이벤트로 메시지 전송.
 *
 * 파라미터: \${ MESSAGE }
 */
(async () => {
    try {
        const msg = \${ MESSAGE };

        // ─── 1. 입력 필드 찾기 ───
        const editor =
            document.querySelector('.tiptap.ProseMirror') ||
            document.querySelector('[contenteditable="true"]') ||
            document.querySelector('textarea');

        if (!editor) return JSON.stringify({ sent: false, error: 'no input found in webview' });

        const isTextarea = editor.tagName === 'TEXTAREA';

        if (isTextarea) {
            editor.focus();
            const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
            if (nativeSetter) nativeSetter.call(editor, msg);
            else editor.value = msg;
            editor.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise(r => setTimeout(r, 300));

            const enterOpts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true };
            editor.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
            editor.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
            editor.dispatchEvent(new KeyboardEvent('keyup', enterOpts));
            return JSON.stringify({ sent: true });
        }

        // ─── 2. contenteditable (ProseMirror / tiptap) ───
        editor.focus();
        await new Promise(r => setTimeout(r, 100));

        // 전체 선택 + 삭제 + 삽입
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editor);
        sel.removeAllRanges();
        sel.addRange(range);
        await new Promise(r => setTimeout(r, 50));

        document.execCommand('delete', false, null);
        await new Promise(r => setTimeout(r, 50));
        document.execCommand('insertText', false, msg);

        editor.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 400));

        // ─── 3. Enter 키 전송 ───
        const enterOpts = {
            key: 'Enter', code: 'Enter',
            keyCode: 13, which: 13,
            bubbles: true, cancelable: true, composed: true,
        };
        editor.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
        await new Promise(r => setTimeout(r, 50));
        editor.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
        editor.dispatchEvent(new KeyboardEvent('keyup', enterOpts));

        return JSON.stringify({ sent: true });
    } catch (e) {
        return JSON.stringify({ sent: false, error: e.message });
    }
})()
`,
  webview_set_mode: `/**
 * Cline — set_mode
 * 모드 selector에서 지정된 모드 선택
 * \${MODE} → JSON.stringify(modeName)
 * → { success: boolean }
 */
(async () => {
    try {
        const inner = document.querySelector('iframe');
        const doc = inner?.contentDocument || inner?.contentWindow?.document;
        if (!doc) return JSON.stringify({ success: false, error: 'no doc' });

        const target = \${MODE};
        const trigger = doc.querySelector('[data-testid="mode-selector-trigger"], [data-testid="mode-switch"]');
        if (!trigger) return JSON.stringify({ success: false, error: 'no mode trigger' });

        // 드롭다운 열기
        trigger.click();
        await new Promise(r => setTimeout(r, 300));

        // 옵션에서 타겟 모드 찾기
        const options = doc.querySelectorAll('[data-testid*="mode-option"], [role="option"], [class*="dropdown"] [class*="item"], [class*="listbox"] [class*="option"]');
        for (const opt of options) {
            const text = (opt.textContent || '').trim();
            if (text === target || text.toLowerCase().includes(target.toLowerCase())) {
                opt.click();
                await new Promise(r => setTimeout(r, 200));
                return JSON.stringify({ success: true, mode: text });
            }
        }

        // 닫기
        doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return JSON.stringify({ success: false, error: 'mode not found: ' + target });
    } catch (e) { return JSON.stringify({ success: false, error: e.message }); }
})()
`,
  webview_set_model: `/**
 * Cline — set_model
 * 드롭다운에서 지정된 모델 선택
 * \${MODEL} → JSON.stringify(modelName)
 * → { success: boolean }
 */
(async () => {
    try {
        const inner = document.querySelector('iframe');
        const doc = inner?.contentDocument || inner?.contentWindow?.document;
        if (!doc) return JSON.stringify({ success: false, error: 'no doc' });

        const target = \${MODEL};
        const trigger = doc.querySelector('[data-testid="model-selector"], [data-testid*="model-dropdown"], [data-testid="dropdown-trigger"]');
        if (!trigger) return JSON.stringify({ success: false, error: 'no model trigger' });

        // 드롭다운 열기
        trigger.click();
        await new Promise(r => setTimeout(r, 300));

        // 옵션에서 타겟 모델 찾기
        const options = doc.querySelectorAll('[data-testid*="dropdown-option"], [role="option"], [class*="dropdown"] [class*="item"], [class*="listbox"] [class*="option"]');
        for (const opt of options) {
            const text = (opt.textContent || '').trim();
            if (text === target || text.includes(target)) {
                opt.click();
                await new Promise(r => setTimeout(r, 200));
                return JSON.stringify({ success: true, model: text });
            }
        }

        // 닫기
        doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return JSON.stringify({ success: false, error: 'model not found: ' + target });
    } catch (e) { return JSON.stringify({ success: false, error: e.message }); }
})()
`,
  webview_switch_session: `/**
 * PearAI — webview_switch_session (webview iframe 내부에서 실행)
 *
 * data-testid="task-item-{UUID}" 항목을 클릭하여 세션 전환.
 * SESSION_ID는 task UUID 형태 (예: "51a08aba-1078-410c-a601-0e859205b12c")
 */
(() => {
    try {
        const targetId = \${SESSION_ID};

        // ─── UUID 기반 매칭 ───
        const selector = '[data-testid="task-item-' + targetId + '"]';
        const targetItem = document.querySelector(selector);
        if (targetItem) {
            targetItem.click();
            return JSON.stringify({ switched: true, id: targetId });
        }

        // ─── 인덱스 기반 fallback (숫자로 전달된 경우) ───
        const index = parseInt(targetId, 10);
        if (!isNaN(index)) {
            const allItems = document.querySelectorAll('[data-testid^="task-item-"]');
            if (allItems[index]) {
                allItems[index].click();
                const taskId = (allItems[index].getAttribute('data-testid') || '').replace('task-item-', '');
                return JSON.stringify({ switched: true, id: taskId, method: 'index' });
            }
        }

        return JSON.stringify({ switched: false, error: 'Task item not found: ' + targetId });
    } catch (e) {
        return JSON.stringify({ switched: false, error: e.message });
    }
})()
`,
};
