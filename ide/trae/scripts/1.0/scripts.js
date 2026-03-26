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
  list_chats: `/**
 * Trae — list_chats
 *
 * Trae 메인 DOM에서 탭 / 세션 목록 가져오기.
 */
(() => {
    try {
        const tabs = document.querySelectorAll('.chat-tab-header, [class*="tab-item"], [class*="TabItem"]');
        if (tabs.length === 0) return JSON.stringify({ sessions: [] });

        const sessions = Array.from(tabs).map((tab, i) => {
            const title = (tab.textContent || '').replace('✕', '').trim();
            const active = tab.classList.contains('active') ||
                           tab.getAttribute('aria-selected') === 'true' ||
                           (tab.className || '').toLowerCase().includes('active');
            return { id: String(i), title, active };
        });

        // 탭 목록이 보이지 않으면 사이드바의 히스토리 버튼 확인
        return JSON.stringify({ sessions });
    } catch (e) {
        return JSON.stringify({ error: e.message, sessions: [] });
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
 * Trae — new_session
 *
 * "New Task" 생성 (⌃⌘N 단축키 또는 버튼 클릭).
 * Trae는 메인 DOM에서 접근 가능.
 */
(() => {
    try {
        // 버튼 찾기
        const buttons = document.querySelectorAll('button, [role="button"], .action-item a');
        for (const btn of buttons) {
            const text = (btn.textContent || '').trim();
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (text.includes('New Task') || label.includes('new task') || label.includes('new chat')) {
                btn.click();
                return JSON.stringify({ created: true, method: 'button' });
            }
        }

        // 단축키 폴백: ⌃⌘N
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'n', code: 'KeyN', keyCode: 78,
            metaKey: true, ctrlKey: true,
            bubbles: true, cancelable: true,
        }));
        return JSON.stringify({ created: true, method: 'shortcut' });
    } catch (e) {
        return JSON.stringify({ created: false, error: e.message });
    }
})()
`,
  open_panel: `/**
 * Trae — open_panel
 *
 * Trae AI 채팅 패널 열기.
 * "TRAE" 버튼 또는 ⌘L 단축키로 열기.
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

        // 2. "TRAE" 버튼 클릭 시도
        const toggleBtns = Array.from(document.querySelectorAll('li.action-item a, button, [role="button"]'));
        for (const btn of toggleBtns) {
            const label = (btn.getAttribute('aria-label') || '');
            if (label === 'TRAE' || label.toLowerCase().includes('toggle secondary') ||
                label.toLowerCase().includes('toggle auxiliary')) {
                btn.click();
                return 'opened (toggle)';
            }
        }

        // 3. Cmd+L 단축키 폴백 (Trae 기본 단축키)
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

        return 'opened (⌘L)';
    } catch (e) {
        return 'error: ' + e.message;
    }
})()
`,
  read_chat: `/**
 * Trae — read_chat
 *
 * Trae는 메인 DOM에서 직접 채팅 내용에 접근 가능.
 * 채팅 턴은 .chat-turn 요소로 구분.
 * 유저: .user-chat-bubble-request__content-wrapper
 * 어시스턴트: .assistant-chat-turn-content .chat-markdown
 *
 * 반환: ReadChatResult { id, status, messages, title?, inputContent?, activeModal? }
 */
(() => {
    try {
        const auxbar = document.getElementById('workbench.parts.auxiliarybar');
        if (!auxbar || auxbar.offsetWidth === 0) {
            return JSON.stringify({ id: '', status: 'idle', messages: [] });
        }

        // ─── 1. 메시지 수집 ───
        const messages = [];
        const turns = auxbar.querySelectorAll('.chat-turn');

        turns.forEach((turn, idx) => {
            // User message
            const userBubble = turn.querySelector('.user-chat-bubble-request__content-wrapper');
            if (userBubble) {
                messages.push({
                    role: 'user',
                    content: userBubble.textContent.trim(),
                    index: idx,
                });
            }

            // Assistant message
            const assistantEl = turn.querySelector('.assistant-chat-turn-content');
            if (assistantEl) {
                const mdBlocks = assistantEl.querySelectorAll('.chat-markdown-p, .chat-markdown pre');
                let content = '';
                if (mdBlocks.length > 0) {
                    content = Array.from(mdBlocks).map(b => b.textContent.trim()).join('\\n');
                } else {
                    content = assistantEl.textContent.trim();
                }
                if (content) {
                    messages.push({
                        role: 'assistant',
                        content: content,
                        index: idx,
                    });
                }
            }
        });

        // ─── 2. 상태 감지 ───
        let status = 'idle';

        // Stop 버튼 존재 → generating
        const stopBtn = auxbar.querySelector('button[class*="stop"], [aria-label*="stop" i], [aria-label*="Stop"]');
        if (stopBtn && stopBtn.offsetWidth > 0) {
            status = 'generating';
        }

        // progress bar 활성 → generating
        const progress = auxbar.querySelector('.monaco-progress-container:not(.done)');
        if (progress && progress.offsetWidth > 0) {
            status = 'generating';
        }

        // latest-assistant-bar가 가장 정확한 상태 표시 (최종 판정)
        const latestBar = auxbar.querySelector('.latest-assistant-bar');
        if (latestBar) {
            const barText = latestBar.textContent.toLowerCase();
            if (barText.includes('completed') || barText.includes('done')) {
                status = 'idle';
            } else if (barText.includes('thinking') || barText.includes('generating') || barText.includes('running') || barText.includes('searching')) {
                status = 'generating';
            }
        }

        // ─── 3. 승인 대기 모달 ───
        let activeModal = null;
        const dialogs = auxbar.querySelectorAll('[role="dialog"], .monaco-dialog-box, [class*="approval"], [class*="confirm"]');
        if (dialogs.length > 0) {
            const dialog = dialogs[0];
            const buttons = Array.from(dialog.querySelectorAll('button')).map(b => b.textContent.trim()).filter(Boolean);
            if (buttons.length > 0) {
                activeModal = {
                    message: dialog.textContent.trim().substring(0, 200),
                    buttons: buttons,
                };
                status = 'waiting_approval';
            }
        }

        // ─── 4. 입력 필드 내용 ───
        const input = auxbar.querySelector('.chat-input-v2-input-box-editable, [contenteditable="true"]');
        const inputContent = input ? input.textContent.trim() : '';

        // ─── 5. 세션 ID / 타이틀 ───
        const sessionTab = auxbar.querySelector('[class*="session-tab"], [class*="chat-title"]');
        const title = sessionTab ? sessionTab.textContent.trim() : '';

        return JSON.stringify({
            id: title || 'trae-default',
            status: status,
            messages: messages,
            title: title || undefined,
            inputContent: inputContent || undefined,
            activeModal: activeModal,
        });
    } catch (e) {
        return JSON.stringify({ id: '', status: 'error', messages: [], error: e.message });
    }
})()
`,
  resolve_action: `/**
 * Trae — resolve_action
 *
 * 승인/거부 버튼 찾기 + 좌표 반환.
 * Trae의 approval 다이얼로그는 메인 DOM에 표시됨.
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
 * Trae — send_message
 *
 * Trae는 .chat-input-v2-input-box-editable (contenteditable / Lexical) 사용.
 * Lexical의 내부 state를 올바르게 업데이트하기 위해 Selection API + execCommand 사용.
 *
 * 파라미터: \${ MESSAGE }
 */
(async () => {
    try {
        const msg = \${ MESSAGE };

        // ─── 1. 입력 필드 찾기 ───
        const editor =
            document.querySelector('.chat-input-v2-input-box-editable') ||
            document.querySelector('[contenteditable="true"][role="textbox"]') ||
            document.querySelector('[data-lexical-editor="true"]');

        if (!editor) return JSON.stringify({ sent: false, error: 'no input found' });

        // ─── 2. 포커스 + 전체 선택 + 삭제 + 삽입 ───
        editor.focus();
        await new Promise(r => setTimeout(r, 100));

        // Selection API로 전체 선택
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editor);
        sel.removeAllRanges();
        sel.addRange(range);
        await new Promise(r => setTimeout(r, 50));

        // 삭제 후 삽입 (Lexical state 동기화)
        document.execCommand('delete', false, null);
        await new Promise(r => setTimeout(r, 50));
        document.execCommand('insertText', false, msg);
        
        // Input 이벤트
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 500));

        // ─── 3. send 버튼 클릭 ───
        const sendBtn = document.querySelector('.chat-input-v2-send-button');
        if (sendBtn && !sendBtn.disabled) {
            sendBtn.click();
            return JSON.stringify({ sent: true, method: 'button' });
        }

        // 버튼이 아직 disabled이면 Enter 키 시도
        const enterOpts = {
            key: 'Enter', code: 'Enter',
            keyCode: 13, which: 13,
            bubbles: true, cancelable: true, composed: true,
        };
        editor.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
        await new Promise(r => setTimeout(r, 50));
        editor.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
        editor.dispatchEvent(new KeyboardEvent('keyup', enterOpts));

        // 여전히 안 되면 needsTypeAndSend 폴백
        return JSON.stringify({
            sent: false,
            needsTypeAndSend: true,
            selector: '.chat-input-v2-input-box-editable',
        });
    } catch (e) {
        return JSON.stringify({ sent: false, error: e.message });
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
 * Trae — switch_session
 *
 * Trae 세션 탭 전환.
 * 파라미터: \${ SESSION_ID }
 */
(() => {
    try {
        const targetId = \${ SESSION_ID };
        const tabs = document.querySelectorAll('.chat-tab-header, [class*="tab-item"], [class*="TabItem"]');
        const idx = parseInt(targetId, 10);

        if (isNaN(idx) || idx < 0 || idx >= tabs.length) {
            return JSON.stringify({ switched: false, error: \`invalid index: \${targetId}\` });
        }

        tabs[idx].click();
        const title = (tabs[idx].textContent || '').replace('✕', '').trim();
        return JSON.stringify({ switched: true, title });
    } catch (e) {
        return JSON.stringify({ switched: false, error: e.message });
    }
})()
`,
};
