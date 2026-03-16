/**
 * Roo Code — Extension Provider (Reference Implementation)
 * 
 * Category: extension (webview CDP session)
 * 구조: iframe → contentDocument, Fiber 기반 데이터 추출
 * 
 * Output Contract: ReadChatResult, SendMessageResult, etc.
 * 각 scripts 함수는 CDP evaluate에 넣을 JS 코드 문자열을 반환.
 * 
 * @type {import('../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  // ─── 메타데이터 ───
  type: 'roo-code',
  name: 'Roo Code',
  category: 'extension',

  // ─── Extension 식별 ───
  extensionId: 'RooVeterinaryInc.roo-cline',
  extensionIdPattern: /extensionId=RooVeterinaryInc\.roo-cline/i,

  // ─── VS Code Commands ───
  vscodeCommands: {
    focusPanel: 'roo-cline.SidebarProvider.focus',
  },

  // ─── CDP 스크립트 ───
  scripts: {
    /**
     * readChat → ReadChatResult
     * Fiber 기반 역할 판별 + DOM fallback
     */
    readChat() {
      return `(() => {
    try {
        const inner = document.querySelector('iframe');
        if (!inner) return JSON.stringify({ error: 'no inner iframe' });
        const doc = inner.contentDocument || inner.contentWindow?.document;
        if (!doc) return JSON.stringify({ error: 'cannot access contentDocument' });

        const chatView = doc.querySelector('[data-testid="chat-view"]');
        const root = doc.getElementById('root') || doc.body;
        const isVisible = root ? (root.offsetHeight > 0 || (root.offsetWidth > 0 && !!chatView)) : false;

        // ─── 1. Fiber data 배열 추출 ───
        const virtuosoList = doc.querySelector('[data-testid="virtuoso-item-list"]');
        let fiberData = null;

        if (virtuosoList && virtuosoList.children.length > 0) {
            const firstItem = virtuosoList.children[0];
            const fiberKey = Object.keys(firstItem).find(k =>
                k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
            );
            if (fiberKey) {
                let fiber = firstItem[fiberKey];
                for (let d = 0; d < 25 && fiber; d++) {
                    const props = fiber.memoizedProps || fiber.pendingProps;
                    if (props && props.data && Array.isArray(props.data) && props.data.length > 0) {
                        fiberData = props.data;
                        break;
                    }
                    fiber = fiber.return;
                }
            }
        }

        // ─── 2. 메시지 파싱 ───
        const messages = [];

        if (fiberData) {
            for (let i = 0; i < fiberData.length; i++) {
                const item = fiberData[i];
                if (!item || typeof item !== 'object') continue;

                const msgType = item.type;
                const saySub = item.say;
                const askSub = item.ask;
                const text = item.text || '';

                if (saySub === 'checkpoint_created') continue;
                if (saySub === 'api_req_started' || saySub === 'api_req_finished') continue;
                if (saySub === 'shell_integration_warning') continue;

                let role = 'assistant';
                if (saySub === 'user_feedback') role = 'user';
                if (saySub === 'user_feedback_diff') role = 'user';

                let content = '';
                if (text) {
                    if (askSub === 'followup' && text.startsWith('{')) {
                        try {
                            const parsed = JSON.parse(text);
                            content = parsed.question || parsed.text || text;
                        } catch { content = text; }
                    } else {
                        content = text;
                    }
                }

                if (!content && virtuosoList && virtuosoList.children[i]) {
                    content = (virtuosoList.children[i].textContent || '').trim();
                }

                if (!content || content.length < 2) continue;

                content = content
                    .replace(/CheckpointCompareRestore(Save)?/gi, '')
                    .replace(/^\\s*API Request.*$/gm, '')
                    .replace(/^\\s*Cost:.*$/gm, '')
                    .replace(/\\s{3,}/g, '\\n')
                    .trim();

                if (content.length < 2) continue;
                if (content.length > 2000) content = content.substring(0, 2000) + '…';

                messages.push({
                    role,
                    content,
                    timestamp: item.ts || (Date.now() - (fiberData.length - i) * 1000),
                    _type: msgType,
                    _sub: saySub || askSub,
                });
            }
        } else if (virtuosoList && virtuosoList.children.length > 0) {
            for (const item of virtuosoList.children) {
                const text = (item.textContent || '').trim();
                if (!text || text.length < 2) continue;
                if (/^API Request/i.test(text) || /^Thinking$/i.test(text)) continue;
                let role = 'assistant';
                if (/^You (said|asked)/i.test(text)) role = 'user';
                let content = text.substring(0, 500);
                messages.push({ role, content, timestamp: Date.now() - messages.length * 1000 });
            }
        }

        // ─── 3. 웰컴 화면 감지 ───
        const fullText = (chatView?.textContent || '').trim();
        const isWelcomeScreen = messages.length === 0 &&
            /Roo is a whole AI dev team/i.test(fullText);

        // ─── 4. 입력 필드 ───
        let inputContent = '';
        const textareas = doc.querySelectorAll('textarea');
        for (const ta of textareas) {
            const val = ta.value || ta.textContent || '';
            if (val.trim()) { inputContent = val; break; }
        }

        // ─── 5. 상태 ───
        let status = 'idle';
        const allBtns = [...doc.querySelectorAll('button'), ...doc.querySelectorAll('vscode-button')];
        const buttonTexts = allBtns.map(b => (b.textContent || '').trim().toLowerCase());

        if (buttonTexts.includes('cancel')) status = 'generating';

        if (fiberData && fiberData.length > 0) {
            const last = fiberData[fiberData.length - 1];
            if (last.type === 'ask') {
                if (last.ask === 'followup') status = 'waiting_approval';
                if (last.ask === 'tool' || last.ask === 'command') status = 'waiting_approval';
            }
        }

        const approvalPatterns = /^(proceed|approve|allow|accept|save|run|yes|confirm|resume)/i;
        if (buttonTexts.some(b => approvalPatterns.test(b))) status = 'waiting_approval';

        if ((!isVisible && messages.length === 0) || isWelcomeScreen) {
            status = !isVisible ? 'panel_hidden' : 'idle';
        }

        // ─── 6. 모드/모델 ───
        const modeBtn = doc.querySelector('[data-testid="mode-selector-trigger"]');
        const mode = modeBtn ? (modeBtn.textContent || '').trim() : '';
        const modelBtn = doc.querySelector('[data-testid="dropdown-trigger"]');
        const model = modelBtn ? (modelBtn.textContent || '').trim() : '';
        const autoApproveBtn = doc.querySelector('[data-testid="auto-approve-dropdown-trigger"]');
        const autoApprove = autoApproveBtn ? (autoApproveBtn.textContent || '').trim() : '';

        // ─── 7. 승인 모달 ───
        let activeModal = null;
        if (status === 'waiting_approval') {
            const approvalBtns = buttonTexts
                .filter(b => /proceed|approve|allow|accept|run|yes|reject|deny|cancel|no|skip|save|confirm|resume/i.test(b))
                .map(b => b.substring(0, 30));
            activeModal = { message: 'Roo Code requires your input', buttons: [...new Set(approvalBtns)] };
        }

        return JSON.stringify({
            agentType: 'roo-code',
            agentName: 'Roo Code',
            extensionId: 'RooVeterinaryInc.roo-cline',
            status,
            isVisible,
            isWelcomeScreen,
            messages: messages.slice(-30),
            inputContent,
            model,
            mode,
            autoApprove,
            activeModal,
        });
    } catch (e) {
        return JSON.stringify({ error: e.message || String(e) });
    }
})()`;
    },

    /**
     * sendMessage(text) → 'sent' | 'error: ...'
     * Fiber onSend 직접 호출 방식
     */
    sendMessage(text) {
      const escaped = JSON.stringify(text);
      return `(async () => {
    try {
        const inner = document.querySelector('iframe');
        const doc = inner?.contentDocument || inner?.contentWindow?.document;
        if (!doc) return 'error: no doc';

        let target = null;
        const textareas = doc.querySelectorAll('textarea');
        for (const ta of textareas) {
            if (ta.offsetParent !== null && ta.offsetHeight > 20) { target = ta; break; }
        }
        if (!target) return 'error: no textarea';

        const proto = inner.contentWindow?.HTMLTextAreaElement?.prototype
            || HTMLTextAreaElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

        if (nativeSetter) nativeSetter.call(target, ${escaped});
        else target.value = ${escaped};

        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));

        await new Promise(r => setTimeout(r, 300));

        // Fiber onSend 직접 호출
        const allEls = doc.querySelectorAll('*');
        for (const el of allEls) {
            const fk = Object.keys(el).find(k => k.startsWith('__reactFiber'));
            if (!fk) continue;
            let fiber = el[fk];
            for (let d = 0; d < 15 && fiber; d++) {
                const props = fiber.memoizedProps || fiber.pendingProps;
                if (props && typeof props.onSend === 'function') {
                    props.onSend();
                    return JSON.stringify({ sent: true });
                }
                fiber = fiber.return;
            }
        }

        // Fallback: Enter 키
        target.focus();
        target.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter', code: 'Enter', keyCode: 13,
            bubbles: true, cancelable: true,
        }));

        return JSON.stringify({ sent: true });
    } catch (e) { return JSON.stringify({ sent: false, error: e.message }); }
})()`;
    },

    /**
     * listSessions → SessionInfo[]
     * Fiber taskHistory 기반
     */
    listSessions() {
      return `(() => {
    try {
        const inner = document.querySelector('iframe');
        const doc = inner?.contentDocument || inner?.contentWindow?.document;
        if (!doc) return JSON.stringify({ sessions: [] });

        const findFiberKey = (el) => Object.keys(el).find(k =>
            k.startsWith('__reactFiber') || k.startsWith('__reactProps') || k.startsWith('__reactContainer'));
        const getFiber = (el) => {
            const fk = findFiberKey(el);
            if (!fk) return null;
            let fiber = el[fk];
            if (fk.startsWith('__reactContainer') && fiber?._internalRoot?.current)
                fiber = fiber._internalRoot.current;
            return fiber;
        };

        const allEls = doc.querySelectorAll('*');
        let taskHistory = null;

        for (const el of allEls) {
            let fiber = getFiber(el);
            if (!fiber) continue;
            for (let d = 0; d < 30 && fiber; d++) {
                const props = fiber.memoizedProps || fiber.pendingProps;
                if (props && props.taskHistory && Array.isArray(props.taskHistory)) {
                    taskHistory = props.taskHistory;
                    break;
                }
                if (fiber.memoizedState) {
                    let st = fiber.memoizedState;
                    while (st) {
                        try {
                            const ms = st.memoizedState;
                            if (ms && typeof ms === 'object' && !Array.isArray(ms)) {
                                if (ms.taskHistory && Array.isArray(ms.taskHistory)) {
                                    taskHistory = ms.taskHistory;
                                    break;
                                }
                            }
                        } catch { }
                        st = st.next;
                    }
                }
                if (taskHistory) break;
                fiber = fiber.return;
            }
            if (taskHistory) break;
        }

        if (taskHistory && taskHistory.length > 0) {
            const sessions = taskHistory.slice(0, 50).map((task, i) => ({
                id: task.id || String(task.ts),
                title: (task.task || '').substring(0, 120),
                time: task.ts ? new Date(task.ts).toISOString() : '',
            }));
            return JSON.stringify({ sessions });
        }

        // DOM fallback
        const taskItems = doc.querySelectorAll('[data-testid^="task-item-"]');
        if (taskItems.length > 0) {
            const sessions = [];
            for (const item of taskItems) {
                const testId = item.getAttribute('data-testid') || '';
                const id = testId.replace('task-item-', '');
                const contentEl = item.querySelector('[data-testid="task-content"]');
                const title = contentEl ? (contentEl.textContent || '').trim() : (item.textContent || '').trim().substring(0, 80);
                sessions.push({ id, title, time: '' });
            }
            return JSON.stringify({ sessions });
        }

        return JSON.stringify({ sessions: [] });
    } catch (e) {
        return JSON.stringify({ sessions: [], error: e.message });
    }
})()`;
    },

    /**
     * switchSession(sessionId) → SwitchSessionResult
     * postMessage → showTaskWithId
     */
    switchSession(sessionId) {
      const escaped = JSON.stringify(sessionId);
      return `(async () => {
    try {
        const inner = document.querySelector('iframe');
        const doc = inner?.contentDocument || inner?.contentWindow?.document;
        if (!doc) return JSON.stringify({ switched: false, error: 'no doc' });

        const sid = ${escaped};
        if (!sid) return JSON.stringify({ switched: false, error: 'no sessionId' });

        const pm = window.__vscode_post_message__;
        if (typeof pm !== 'function') return JSON.stringify({ switched: false, error: 'no postMessage' });

        const findFiberKey = (el) => Object.keys(el).find(k =>
            k.startsWith('__reactFiber') || k.startsWith('__reactProps') || k.startsWith('__reactContainer'));

        const root = doc.getElementById('root');
        if (!root) return JSON.stringify({ switched: false, error: 'no root' });
        const fk = findFiberKey(root);
        if (!fk) return JSON.stringify({ switched: false, error: 'no fiber' });
        let rootFiber = root[fk];
        if (fk.startsWith('__reactContainer') && rootFiber?._internalRoot?.current)
            rootFiber = rootFiber._internalRoot.current;

        let taskHistory = null;
        const visited = new Set();
        const dfs = (f, depth) => {
            if (!f || depth > 80 || visited.has(f) || taskHistory) return;
            visited.add(f);
            const props = f.memoizedProps || f.pendingProps;
            if (props?.taskHistory && Array.isArray(props.taskHistory)) {
                taskHistory = props.taskHistory;
                return;
            }
            if (f.memoizedState) {
                let st = f.memoizedState; let i = 0;
                while (st && i < 20 && !taskHistory) {
                    try {
                        const ms = st.memoizedState;
                        if (ms?.taskHistory && Array.isArray(ms.taskHistory)) taskHistory = ms.taskHistory;
                    } catch { }
                    st = st.next; i++;
                }
            }
            if (f.child) dfs(f.child, depth + 1);
            if (f.sibling) dfs(f.sibling, depth + 1);
        };
        dfs(rootFiber, 0);

        if (!taskHistory || taskHistory.length === 0) return JSON.stringify({ switched: false, error: 'no history' });

        const norm = s => (s || '').trim().toLowerCase().replace(/\\s+/g, ' ');
        const idNorm = norm(sid);
        let targetTask = taskHistory.find(t => String(t.id) === sid);
        if (!targetTask) {
            targetTask = taskHistory.find(t => {
                const title = norm(t.task || '');
                return title.includes(idNorm) || idNorm.includes(title);
            });
        }
        if (!targetTask) return JSON.stringify({ switched: false, error: 'task not found' });

        pm('onmessage', { message: { type: 'showTaskWithId', text: String(targetTask.id) } });

        await new Promise(r => setTimeout(r, 2000));
        return JSON.stringify({ switched: true });
    } catch (e) { return JSON.stringify({ switched: false, error: e.message }); }
})()`;
    },

    /**
     * newSession → string
     */
    newSession() {
      return `(() => {
    try {
        const inner = document.querySelector('iframe');
        const doc = inner?.contentDocument || inner?.contentWindow?.document;
        if (!doc) return 'no doc';

        const allBtns = [
            ...Array.from(doc.querySelectorAll('button')),
            ...Array.from(doc.querySelectorAll('vscode-button')),
        ].filter(b => b.offsetWidth > 0 || b.offsetHeight > 0 || b.textContent?.trim());

        for (const btn of allBtns) {
            const tid = (btn.getAttribute('data-testid') || '').toLowerCase();
            if (tid.includes('new-task') || tid.includes('new-chat') || tid.includes('new_session')) {
                btn.click(); return 'clicked (testid)';
            }
        }
        for (const btn of allBtns) {
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (label.includes('new task') || label.includes('new chat') || label.includes('plus')) {
                btn.click(); return 'clicked (aria)';
            }
        }
        for (const btn of allBtns) {
            const text = (btn.textContent || '').trim();
            if (text === '+' || text.includes('New Task') || text.includes('New Chat')) {
                btn.click(); return 'clicked (text)';
            }
        }

        const bodyText = (doc.body.textContent || '').toLowerCase();
        if (bodyText.includes('what can i do for you') || bodyText.includes('type your task') || bodyText.includes('start a new')) {
            return 'clicked (already new)';
        }

        const root = doc.getElementById('root');
        const chatView = doc.querySelector('[data-testid="chat-view"]');
        if (root && root.offsetHeight === 0 && root.offsetWidth === 0 && !chatView) return 'panel_hidden';

        return 'no button found';
    } catch (e) { return 'error: ' + e.message; }
})()`;
    },

    /**
     * resolveAction(action) → boolean
     * action: 'approve' | 'reject'
     */
    resolveAction(action) {
      const escaped = JSON.stringify(action);
      return `(() => {
    try {
        const inner = document.querySelector('iframe');
        const doc = inner?.contentDocument || inner?.contentWindow?.document;
        if (!doc) return false;

        const action = ${escaped};
        const approvePatterns = ['proceed', 'approve', 'allow', 'accept', 'save', 'run command', 'yes', 'confirm', 'resume'];
        const rejectPatterns = ['reject', 'deny', 'cancel', 'skip'];
        const patterns = action === 'approve' ? approvePatterns : rejectPatterns;
        const excludeTexts = ['auto-approve', 'read', 'write', 'mcp', 'mode', 'subtasks', 'execute', 'question', 'all', 'none', 'enabled'];

        try { doc.body.click(); } catch { }

        const allBtns = [
            ...Array.from(doc.querySelectorAll('button')),
            ...Array.from(doc.querySelectorAll('vscode-button')),
        ].filter(b => b.offsetWidth > 0 && b.offsetHeight > 0);

        for (const btn of allBtns) {
            const testId = (btn.getAttribute('data-testid') || '').toLowerCase();
            if (action === 'approve' && (testId.includes('approve') || testId.includes('proceed') || testId.includes('accept') || testId.includes('primary'))) {
                btn.click(); return true;
            }
            if (action === 'reject' && (testId.includes('reject') || testId.includes('deny') || testId.includes('cancel') || testId.includes('secondary'))) {
                btn.click(); return true;
            }
        }

        const largeBtns = allBtns.filter(b => b.offsetWidth > 100);
        for (const btn of largeBtns) {
            const text = (btn.textContent || '').trim().toLowerCase();
            if (text.length === 0 || text.length > 30) continue;
            if (excludeTexts.some(e => text === e || text.startsWith('auto-approve'))) continue;
            if (patterns.some(p => text === p || text.startsWith(p))) {
                btn.click(); return true;
            }
        }

        for (const btn of allBtns) {
            const text = (btn.textContent || '').trim().toLowerCase();
            if (text.length === 0 || text.length > 30) continue;
            if (excludeTexts.some(e => text === e || text.startsWith('auto-approve'))) continue;
            if (patterns.some(p => text === p || text.startsWith(p))) {
                btn.click(); return true;
            }
        }

        for (const btn of allBtns) {
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (patterns.some(p => label.includes(p))) {
                btn.click(); return true;
            }
        }

        return false;
    } catch { return false; }
})()`;
    },

    /**
     * focusEditor → string
     */
    focusEditor() {
      return `(() => {
    try {
        const inner = document.querySelector('iframe');
        const doc = inner?.contentDocument || inner?.contentWindow?.document;
        if (!doc) return 'no doc';
        const textareas = doc.querySelectorAll('textarea');
        for (const ta of textareas) {
            if (ta.offsetParent !== null && ta.offsetHeight > 20) {
                ta.focus();
                return 'focused';
            }
        }
        return 'no textarea found';
    } catch (e) { return 'error: ' + e.message; }
})()`;
    },

    /**
     * openPanel → 'visible' | 'panel_hidden'
     */
    openPanel() {
      return `(() => {
    try {
        const inner = document.querySelector('iframe');
        const doc = inner?.contentDocument || inner?.contentWindow?.document;
        if (!doc) return 'panel_hidden';
        const root = doc.getElementById('root');
        if (root && root.offsetHeight > 0) return 'visible';
        return 'panel_hidden';
    } catch (e) { return 'error: ' + e.message; }
})()`;
    },

    /**
     * listModels → { models: string[], current: string }
     * dropdown-trigger 클릭 → 옵션 읽기 → Escape로 닫기
     */
    listModels() {
      return `(async () => {
    try {
        const inner = document.querySelector('iframe');
        const doc = inner?.contentDocument || inner?.contentWindow?.document;
        if (!doc) return JSON.stringify({ models: [], current: '', error: 'no doc' });

        // 현재 모델 읽기
        const trigger = doc.querySelector('[data-testid="dropdown-trigger"]');
        if (!trigger) return JSON.stringify({ models: [], current: '', error: 'no model trigger' });
        const current = (trigger.textContent || '').trim();

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
        trigger.click(); // fallback close

        return JSON.stringify({ models: [...new Set(models)], current });
    } catch (e) { return JSON.stringify({ models: [], current: '', error: e.message }); }
})()`;
    },

    /**
     * setModel(params) → { success: boolean }
     * params.model: 선택할 모델 이름
     */
    setModel(params) {
      const model = params?.model || params;
      const escaped = JSON.stringify(model);
      return `(async () => {
    try {
        const inner = document.querySelector('iframe');
        const doc = inner?.contentDocument || inner?.contentWindow?.document;
        if (!doc) return JSON.stringify({ success: false, error: 'no doc' });

        const target = ${escaped};
        const trigger = doc.querySelector('[data-testid="dropdown-trigger"]');
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
})()`;
    },

    /**
     * listModes → { modes: string[], current: string }
     * mode-selector-trigger 클릭 → 옵션 읽기
     */
    listModes() {
      return `(async () => {
    try {
        const inner = document.querySelector('iframe');
        const doc = inner?.contentDocument || inner?.contentWindow?.document;
        if (!doc) return JSON.stringify({ modes: [], current: '', error: 'no doc' });

        const trigger = doc.querySelector('[data-testid="mode-selector-trigger"]');
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
        trigger.click(); // fallback close

        return JSON.stringify({ modes: [...new Set(modes)], current });
    } catch (e) { return JSON.stringify({ modes: [], current: '', error: e.message }); }
})()`;
    },

    /**
     * setMode(params) → { success: boolean }
     * params.mode: 선택할 모드 이름
     */
    setMode(params) {
      const mode = params?.mode || params;
      const escaped = JSON.stringify(mode);
      return `(async () => {
    try {
        const inner = document.querySelector('iframe');
        const doc = inner?.contentDocument || inner?.contentWindow?.document;
        if (!doc) return JSON.stringify({ success: false, error: 'no doc' });

        const target = ${escaped};
        const trigger = doc.querySelector('[data-testid="mode-selector-trigger"]');
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
})()`;
    },
  },
};
