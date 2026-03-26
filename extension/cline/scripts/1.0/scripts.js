module.exports = {
  focus_editor: `/**
 * Cline v1 — focus_editor
 *
 * Cline webview iframe 내부의 입력 필드에 포커스.
 * send_message 전에 호출하거나, 대시보드 "Focus" 버튼에 사용.
 *
 * 최종 확인: 2026-03-07
 */
(() => {
    try {
        const inner = document.querySelector('iframe');
        const doc = inner?.contentDocument || inner?.contentWindow?.document;
        if (!doc) return 'no doc';

        // data-testid 우선 → fallback
        let target = doc.querySelector('[data-testid="chat-input"]');
        if (!target) {
            const textareas = doc.querySelectorAll('textarea');
            for (const ta of textareas) {
                if (ta.offsetParent !== null && ta.offsetHeight > 20) {
                    target = ta;
                    break;
                }
            }
        }
        if (!target) {
            // contenteditable fallback
            const editables = doc.querySelectorAll('[contenteditable="true"]');
            for (const el of editables) {
                if (el.offsetParent !== null && el.offsetHeight > 10) {
                    target = el;
                    break;
                }
            }
        }
        if (!target) return 'no input';

        target.focus();
        // 커서를 끝으로 이동
        if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
            const len = (target.value || '').length;
            target.setSelectionRange(len, len);
        }
        return 'focused';
    } catch (e) {
        return 'error: ' + e.message;
    }
})()
`,
  list_chats: `/**
 * Cline v1 — list_chats (Fiber + DOM 이중 접근)
 *
 * 1차: React Fiber에서 taskHistory 배열 추출
 *      __reactFiber, __reactProps, __reactContainer 모두 탐색
 * 2차: Virtuoso DOM 파싱
 *
 * 반환: JSON 문자열 — [{id, title, status, time, cost, tokensIn, tokensOut, modelId}]
 *
 * 최종 확인: 2026-03-07
 */
(() => {
    try {
        const inner = document.querySelector('iframe');
        const doc = inner?.contentDocument || inner?.contentWindow?.document;
        if (!doc) return JSON.stringify({ error: 'no_doc', panel: 'hidden' });

        // Fiber 키 찾기 helper — __reactFiber, __reactProps, __reactContainer 모두 검색
        const findFiberKey = (el) => Object.keys(el).find(k =>
            k.startsWith('__reactFiber') || k.startsWith('__reactProps') || k.startsWith('__reactContainer'));

        const getFiber = (el) => {
            const fk = findFiberKey(el);
            if (!fk) return null;
            let fiber = el[fk];
            // __reactContainer인 경우 내부 fiber tree root로 접근
            if (fk.startsWith('__reactContainer') && fiber?._internalRoot?.current) {
                fiber = fiber._internalRoot.current;
            }
            return fiber;
        };

        // ─── 1차: Fiber props에서 taskHistory 찾기 ───
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
                // memoizedState 체인에서도 탐색
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
            const results = taskHistory.slice(0, 50).map((task, i) => ({
                id: task.id || String(task.ts),
                title: (task.task || '').substring(0, 120),
                status: i === 0 ? 'current' : '',
                time: task.ts ? new Date(task.ts).toISOString() : '',
                cost: task.totalCost ? \`$\${task.totalCost.toFixed(4)}\` : '',
                tokensIn: task.tokensIn || 0,
                tokensOut: task.tokensOut || 0,
                modelId: task.modelId || '',
                size: task.size || 0,
                isFavorited: !!task.isFavorited,
            }));
            return JSON.stringify(results);
        }

        // ─── 2차: Virtuoso DOM 파싱 ───
        const items = doc.querySelectorAll('[data-item-index]');
        if (items.length > 0) {
            const results = Array.from(items).slice(0, 50).map(el => ({
                id: el.getAttribute('data-item-index') || '',
                title: (el.textContent || '').trim().substring(0, 120),
                status: '',
            }));
            return JSON.stringify(results);
        }

        return JSON.stringify([]);
    } catch (e) {
        return JSON.stringify({ error: e.message || String(e) });
    }
})()
`,
  list_models: `/**
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
  list_modes: `/**
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
  new_session: `/**
 * Cline v1 — new_session
 *
 * 구조:
 *   1. "New Task" 버튼 또는 "+" 버튼 클릭
 *   2. data-testid 우선 → aria-label → 텍스트 매칭
 *
 * 최종 확인: 2026-03-07
 */
(() => {
    try {
        const inner = document.querySelector('iframe');
        const doc = inner?.contentDocument || inner?.contentWindow?.document;
        if (!doc) return 'no doc';

        const buttons = Array.from(doc.querySelectorAll('button'))
            .filter(b => b.offsetWidth > 0 && b.offsetHeight > 0);

        // ─── 1단계: data-testid 기반 ───
        for (const btn of buttons) {
            const testId = (btn.getAttribute('data-testid') || '').toLowerCase();
            if (testId.includes('new-task') || testId.includes('new-chat') || testId.includes('new_task')) {
                btn.click();
                return 'clicked (testid)';
            }
        }

        // ─── 2단계: aria-label 기반 ───
        for (const btn of buttons) {
            const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (ariaLabel.includes('new task') || ariaLabel.includes('new chat')
                || ariaLabel.includes('plus') || ariaLabel === 'new') {
                btn.click();
                return 'clicked (aria)';
            }
        }

        // ─── 3단계: 텍스트 매칭 ───
        for (const btn of buttons) {
            const text = (btn.textContent || '').trim();
            if (text === '+' || text.includes('New Task') || text.includes('New Chat')) {
                btn.click();
                return 'clicked (text)';
            }
        }

        // ─── 4단계: SVG plus 아이콘 버튼 ───
        for (const btn of buttons) {
            const svg = btn.querySelector('svg');
            if (!svg) continue;
            const path = svg.querySelector('path');
            if (path) {
                const d = path.getAttribute('d') || '';
                // SVG plus icon의 일반적인 path pattern
                if (d.includes('M12') && (d.includes('H5') || d.includes('h') || d.includes('v'))) {
                    // 다른 버튼 텍스트가 없는 아이콘 전용 버튼
                    const text = (btn.textContent || '').trim();
                    if (text.length < 3) {
                        btn.click();
                        return 'clicked (svg)';
                    }
                }
            }
        }

        // ─── 5단계: 웰컴 화면 감지 (이미 새 세션) ───
        const bodyText = (doc.body.textContent || '').toLowerCase();
        if (bodyText.includes('what can i do for you') || bodyText.includes('start a new task') || bodyText.includes('type your task')) {
            return 'clicked (already new)';
        }

        // ─── 6단계: History 뷰 감지 → Done 클릭으로 웰컴 복귀 ───
        if (bodyText.includes('history') && bodyText.includes('done')) {
            for (const btn of buttons) {
                const text = (btn.textContent || '').trim();
                if (text === 'Done') {
                    btn.click();
                    return 'clicked (history done)';
                }
            }
        }

        return 'no button found';
    } catch (e) { return 'error: ' + e.message; }
})()
`,
  open_panel: `/**
 * Cline v1 — open_panel
 *
 * 패널 상태 확인 및 열기 시도.
 *
 * iframe 컨텍스트에서는 VS Code API 접근이 제한적이므로,
 * 패널이 숨겨져 있을 때는 'panel_hidden' 상태를 반환.
 * → daemon의 AgentStreamManager 또는
 *   agent_stream_focus 메시지를 통해 열어야 함.
 *
 * 반환: 'visible' | 'panel_hidden'
 * 최종 확인: 2026-03-07
 */
(() => {
    try {
        const inner = document.querySelector('iframe');
        const doc = inner?.contentDocument || inner?.contentWindow?.document;
        if (!doc) return 'panel_hidden';

        const root = doc.getElementById('root');
        if (root && root.offsetHeight > 0) return 'visible';

        return 'panel_hidden';
    } catch (e) { return 'error: ' + e.message; }
})()
`,
  read_chat: `/**
 * Cline v1 — read_chat (v2 — Fiber 기반 역할 판별)
 *
 * 구조 (Cline 3.x — saoudrizwan.claude-dev):
 *   1. outer webview iframe → inner contentDocument
 *   2. data-testid="virtuoso-item-list" (React Virtuoso) — 활성 메시지 블록
 *   3. React Fiber → data 배열에서 메시지 타입 직접 추출
 *      - type: "say", say: "user_feedback" → user
 *      - type: "say", say: "text" → assistant
 *      - type: "say", say: "checkpoint_created" → system (skip)
 *      - type: "ask", ask: "followup" → assistant (질문)
 *      - type: "ask", ask: "tool" → assistant (tool 승인 대기)
 *   4. DOM textContent에서 콘텐츠 추출 + 정제
 *
 * 최종 확인: 2026-03-07
 */
(() => {
    try {
        const inner = document.querySelector('iframe');
        if (!inner) return JSON.stringify({ error: 'no inner iframe' });
        const doc = inner.contentDocument || inner.contentWindow?.document;
        if (!doc) return JSON.stringify({ error: 'cannot access contentDocument' });

        const root = doc.getElementById('root');
        if (!root) return JSON.stringify({ error: 'no root element' });

        const isVisible = root.offsetHeight > 0;

        // ─── 1. Fiber에서 data 배열 추출 ───
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
            // ★ Fiber 기반: 가장 정확한 역할 판별
            for (let i = 0; i < fiberData.length; i++) {
                const item = fiberData[i];
                if (!item || typeof item !== 'object') continue;

                const msgType = item.type;  // "say" or "ask"
                const saySub = item.say;    // "user_feedback", "text", "checkpoint_created", etc.
                const askSub = item.ask;    // "followup", "tool", "command", etc.
                const text = item.text || '';

                // 시스템 이벤트 스킵
                if (saySub === 'checkpoint_created') continue;
                if (saySub === 'api_req_started' || saySub === 'api_req_finished') continue;
                if (saySub === 'shell_integration_warning') continue;

                // 역할 판별
                let role = 'assistant';
                if (saySub === 'user_feedback') role = 'user';
                if (saySub === 'user_feedback_diff') role = 'user';

                // 콘텐츠 추출
                let content = '';
                if (text) {
                    // ask.followup의 text는 JSON일 수 있음
                    if (askSub === 'followup' && text.startsWith('{')) {
                        try {
                            const parsed = JSON.parse(text);
                            content = parsed.question || parsed.text || text;
                        } catch { content = text; }
                    } else {
                        content = text;
                    }
                }

                // DOM 텍스트 fallback (Fiber text가 비어있을 때)
                if (!content && virtuosoList && virtuosoList.children[i]) {
                    content = (virtuosoList.children[i].textContent || '').trim();
                }

                // 너무 짧거나 빈 콘텐츠 스킵
                if (!content || content.length < 2) continue;

                // 노이즈 정리
                content = content
                    .replace(/CheckpointCompareRestore(Save)?/gi, '')
                    .replace(/^\\s*API Request.*$/gm, '')
                    .replace(/^\\s*Cost:.*$/gm, '')
                    .replace(/\\s{3,}/g, '\\n')
                    .trim();

                if (content.length < 2) continue;

                // 코드 블록 보존 (DOM에서 구조 추출)
                if (virtuosoList.children[i]) {
                    const domItem = virtuosoList.children[i];
                    const preBlocks = domItem.querySelectorAll('pre');
                    if (preBlocks.length > 0 && role === 'assistant') {
                        let structured = '';
                        const walk = (node) => {
                            if (node.nodeType === 3) {
                                structured += node.textContent;
                                return;
                            }
                            if (node.nodeType !== 1) return;
                            const el = node;
                            if (el.tagName === 'PRE') {
                                const codeEl = el.querySelector('code');
                                const lang = codeEl ? (codeEl.className.match(/language-(\\w+)/)?.[1] || '') : '';
                                const BLOCK_TAGS_C = new Set(['DIV', 'P', 'BR', 'LI', 'TR']);
                                const extractCode = (n) => {
                                    if (n.nodeType === 3) return n.textContent || '';
                                    if (n.nodeType !== 1) return '';
                                    if (n.tagName === 'BR') return '\\n';
                                    const ps = [];
                                    for (const c of n.childNodes) {
                                        const ib = c.nodeType === 1 && BLOCK_TAGS_C.has(c.tagName);
                                        const tx = extractCode(c);
                                        if (tx) { if (ib && ps.length > 0) ps.push('\\n'); ps.push(tx); if (ib) ps.push('\\n'); }
                                    }
                                    return ps.join('').replace(/\\n{2,}/g, '\\n');
                                };
                                const code = extractCode(codeEl || el);
                                structured += '\\n\`\`\`' + lang + '\\n' + code.trim() + '\\n\`\`\`\\n';
                                return;
                            }
                            for (const child of el.childNodes) walk(child);
                        };
                        walk(domItem);
                        const cleaned = structured.replace(/CheckpointCompareRestore(Save)?/gi, '').trim();
                        if (cleaned.length > content.length * 0.5) {
                            content = cleaned;
                        }
                    }
                }

                // 길이 제한
                if (content.length > 2000) content = content.substring(0, 2000) + '…';

                messages.push({
                    role,
                    content,
                    timestamp: item.ts || (Date.now() - (fiberData.length - i) * 1000),
                    // 디버그: 메시지 서브타입
                    _type: msgType,
                    _sub: saySub || askSub,
                });
            }
        } else if (virtuosoList && virtuosoList.children.length > 0) {
            // Fallback: DOM 기반 파싱 (Fiber 접근 실패 시)
            for (let i = 0; i < virtuosoList.children.length; i++) {
                const item = virtuosoList.children[i];
                const rawText = (item.textContent || '').trim();
                if (!rawText || rawText.length < 2) continue;
                if (/^Checkpoint(Compare|Restore|Save)/i.test(rawText)) continue;
                if (/^(Thinking\\.\\.\\.|Loading\\.\\.\\.)$/i.test(rawText)) continue;

                let role = 'assistant';
                let content = rawText
                    .replace(/CheckpointCompareRestore(Save)?/gi, '')
                    .replace(/\\s{3,}/g, '\\n')
                    .trim();
                if (content.length < 2) continue;
                if (content.length > 2000) content = content.substring(0, 2000) + '…';

                messages.push({ role, content, timestamp: Date.now() - (virtuosoList.children.length - i) * 1000 });
            }
        }

        // ─── 3. 입력 필드 ───
        let inputContent = '';
        const chatInput = doc.querySelector('[data-testid="chat-input"]');
        if (chatInput) {
            inputContent = chatInput.value || chatInput.textContent || '';
        }

        // ─── 4. 상태 판별 ───
        let status = 'idle';
        const buttons = Array.from(doc.querySelectorAll('button'))
            .filter(b => b.offsetWidth > 0);
        const buttonTexts = buttons.map(b => (b.textContent || '').trim().toLowerCase());

        if (buttonTexts.includes('cancel')) status = 'generating';

        // Fiber data에서 마지막 type=ask인지 확인
        if (fiberData && fiberData.length > 0) {
            const last = fiberData[fiberData.length - 1];
            if (last.type === 'ask') {
                if (last.ask === 'followup') status = 'waiting_approval';
                if (last.ask === 'tool' || last.ask === 'command') status = 'waiting_approval';
            }
        }

        // 버튼 기반 보완
        const approvalPatterns = /^(proceed|approve|allow|accept|save|run command|yes|confirm)/i;
        if (buttonTexts.some(b => approvalPatterns.test(b))) status = 'waiting_approval';

        if (!isVisible && messages.length === 0) status = 'panel_hidden';

        // ─── 5. 모델/모드 ───
        let model = '';
        const modeSwitch = doc.querySelector('[data-testid="mode-switch"]');
        if (modeSwitch) model = (modeSwitch.textContent || '').trim();
        if (!model) {
            const modelSel = doc.querySelector('[data-testid*="model"], [aria-label*="model" i]');
            if (modelSel) model = (modelSel.textContent || '').trim();
        }
        const mode = modeSwitch ? (modeSwitch.textContent || '').trim() : '';

        // ─── 6. 승인 모달 ───
        let activeModal = null;
        if (status === 'waiting_approval') {
            const approvalBtns = buttons
                .map(b => (b.textContent || '').trim())
                .filter(t => t && t.length > 0 && t.length < 40 &&
                    /proceed|approve|allow|accept|run|yes|reject|deny|cancel|no|skip|save|confirm/i.test(t));

            let modalMessage = 'Cline wants to perform an action';
            if (fiberData && fiberData.length > 0) {
                const last = fiberData[fiberData.length - 1];
                if (last.ask === 'followup' && last.text) {
                    try {
                        const parsed = JSON.parse(last.text);
                        modalMessage = parsed.question || last.text.substring(0, 200);
                    } catch { modalMessage = last.text.substring(0, 200); }
                } else if (last.ask === 'tool' || last.ask === 'command') {
                    modalMessage = \`Cline wants to use \${last.ask}\`;
                }
            }

            if (approvalBtns.length > 0) {
                activeModal = { message: modalMessage, buttons: [...new Set(approvalBtns)] };
            }
        }

        // ─── 7. 토큰/비용 ───
        let tokenInfo = '';
        const costEl = doc.querySelector('[data-testid*="cost"], [data-testid*="token"]');
        if (costEl) tokenInfo = (costEl.textContent || '').trim();

        return JSON.stringify({
            agentType: 'cline',
            agentName: 'Cline',
            extensionId: 'saoudrizwan.claude-dev',
            status,
            isVisible,
            messages: messages.slice(-30),
            inputContent,
            model,
            mode,
            tokenInfo,
            activeModal,
        });
    } catch (e) {
        return JSON.stringify({ error: e.message || String(e) });
    }
})()
`,
  resolve_action: `/**
 * Cline v1 — resolve_action
 *
 * Cline의 승인/거부 처리.
 * Cline은 button 태그 외에 vscode-button 웹 컴포넌트도 사용.
 * chatState.primaryButtonText / secondaryButtonText로 정확한 매칭.
 *
 * 파라미터: \${ ACTION } — "approve" 또는 "reject"
 *
 * 전략:
 *   1. chatState.primaryButtonText == Approve → primary vscode-button 클릭
 *   2. data-testid 기반 탐색
 *   3. 텍스트 매칭 (button + vscode-button)
 *   4. Fiber onSendMessage로 직접 승인 전달
 *
 * 최종 확인: 2026-03-07
 */
(() => {
    try {
        const inner = document.querySelector('iframe');
        const doc = inner?.contentDocument || inner?.contentWindow?.document;
        if (!doc) return false;

        const action = \${ ACTION };
        const approvePatterns = ['proceed', 'approve', 'allow', 'accept', 'save', 'run', 'yes', 'confirm', 'resume'];
        const rejectPatterns = ['reject', 'deny', 'cancel', 'no', 'skip'];
        const patterns = action === 'approve' ? approvePatterns : rejectPatterns;

        // ─── 모든 클릭 가능 요소 수집 (button + vscode-button) ───
        const allBtns = [
            ...Array.from(doc.querySelectorAll('button')),
            ...Array.from(doc.querySelectorAll('vscode-button')),
        ].filter(b => b.offsetWidth > 0 && b.offsetHeight > 0);

        // ─── 1단계: data-testid 기반 ───
        for (const btn of allBtns) {
            const testId = (btn.getAttribute('data-testid') || '').toLowerCase();
            if (action === 'approve' && (testId.includes('approve') || testId.includes('proceed') || testId.includes('accept') || testId.includes('run') || testId.includes('primary'))) {
                btn.click(); return true;
            }
            if (action === 'reject' && (testId.includes('reject') || testId.includes('deny') || testId.includes('cancel') || testId.includes('secondary'))) {
                btn.click(); return true;
            }
        }

        // ─── 2단계: 텍스트 매칭 ───
        for (const btn of allBtns) {
            const text = (btn.textContent || '').trim().toLowerCase();
            if (text.length === 0 || text.length > 40) continue;
            if (patterns.some(p => text.startsWith(p) || text === p || text.includes(p))) {
                btn.click(); return true;
            }
        }

        // ─── 3단계: aria-label ───
        for (const btn of allBtns) {
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (patterns.some(p => label.includes(p))) {
                btn.click(); return true;
            }
        }

        // ─── 4단계: chatState 기반 — primary/secondary 버튼 직접 매칭 ───
        // chatState.primaryButtonText = "Approve", secondaryButtonText = "Reject"
        // 가장 큰 vscode-button이 primary 버튼
        const vscBtns = Array.from(doc.querySelectorAll('vscode-button'))
            .filter(b => b.offsetWidth > 100);  // 큰 버튼만
        if (vscBtns.length > 0) {
            if (action === 'approve') {
                // 가장 큰 버튼이 primary
                vscBtns.sort((a, b) => b.offsetWidth - a.offsetWidth);
                vscBtns[0].click(); return true;
            }
            // reject: 가장 작은 큰 버튼
            if (action === 'reject' && vscBtns.length > 1) {
                vscBtns.sort((a, b) => a.offsetWidth - b.offsetWidth);
                vscBtns[0].click(); return true;
            }
        }

        return false;
    } catch { return false; }
})()
`,
  send_message: `/**
 * Cline v1 — send_message
 *
 * 구조:
 *   1. outer webview → inner iframe의 contentDocument 접근
 *   2. data-testid="chat-input" textarea에 값 설정 (React controlled)
 *   3. React Fiber에서 onSend 함수 찾아 직접 호출 (가장 확실한 방법)
 *   4. Fallback: data-testid="send-button" 클릭 or Enter 키
 *
 * ⚠️ Cline의 send-button은 DIV 태그이며, 일반 click 이벤트로는 React가
 *    전송을 처리하지 않음. Fiber onSend()를 직접 호출해야 정확하게 동작.
 *
 * 최종 확인: 2026-03-07
 */
(async () => {
    try {
        const inner = document.querySelector('iframe');
        const doc = inner?.contentDocument || inner?.contentWindow?.document;
        if (!doc) return 'error: no doc';

        // ─── 1. 입력 필드 찾기 ───
        let target = doc.querySelector('[data-testid="chat-input"]');
        if (!target) {
            const textareas = doc.querySelectorAll('textarea');
            for (const ta of textareas) {
                if (ta.offsetParent !== null && ta.offsetHeight > 20) {
                    target = ta;
                    break;
                }
            }
        }
        if (!target) return 'error: no chat-input';

        // ─── 2. React controlled input 값 설정 ───
        const proto = inner.contentWindow?.HTMLTextAreaElement?.prototype
            || HTMLTextAreaElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

        if (nativeSetter) {
            nativeSetter.call(target, \${ MESSAGE });
        } else {
            target.value = \${ MESSAGE };
        }

        // React 이벤트 트리거
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));

        // React setState 반영 대기
        await new Promise(r => setTimeout(r, 300));

        // ─── 3. Fiber onSend 직접 호출 (최우선) ───
        const allEls = doc.querySelectorAll('*');
        for (const el of allEls) {
            const fk = Object.keys(el).find(k => k.startsWith('__reactFiber'));
            if (!fk) continue;
            let fiber = el[fk];
            for (let d = 0; d < 15 && fiber; d++) {
                const props = fiber.memoizedProps || fiber.pendingProps;
                if (props && typeof props.onSend === 'function') {
                    props.onSend();
                    return 'sent';
                }
                fiber = fiber.return;
            }
        }

        // ─── 4. Fallback: send-button 클릭 ───
        const sendBtn = doc.querySelector('[data-testid="send-button"]');
        if (sendBtn) {
            try {
                const rect = sendBtn.getBoundingClientRect();
                const opts = {
                    bubbles: true, cancelable: true, view: inner.contentWindow,
                    clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2
                };
                sendBtn.dispatchEvent(new MouseEvent('mousedown', opts));
                sendBtn.dispatchEvent(new MouseEvent('mouseup', opts));
                sendBtn.dispatchEvent(new MouseEvent('click', opts));
                return 'sent';
            } catch (e) { }
        }

        // ─── 5. 최후 Fallback: Enter 키 ───
        target.focus();
        target.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter', code: 'Enter', keyCode: 13,
            bubbles: true, cancelable: true,
        }));

        return 'sent';
    } catch (e) {
        return 'error: ' + e.message;
    }
})()
`,
  set_mode: `/**
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
  set_model: `/**
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
  switch_session: `/**
 * Cline v1 — switch_session (Fiber hooks → showTaskWithId gRPC)
 *
 * 전략:
 * 1. Fiber DFS에서 taskHistory, showHistoryView 찾기
 * 2. Done 클릭으로 히스토리 닫기 → showHistoryView() → 재열기
 * 3. Virtuoso 렌더링 대기 (최대 5초, 500ms 간격 재시도 + scroll/resize 트리거)
 * 4. 렌더된 아이템의 Fiber hooks에서 showTaskWithId 콜백 추출
 * 5. showTaskWithId(taskId) 호출 → gRPC로 Task 전환
 *
 * 파라미터: \${ SESSION_ID } — task ID (숫자 문자열) 또는 제목
 * 최종 확인: 2026-03-07
 */
(async () => {
    try {
        const inner = document.querySelector('iframe');
        const doc = inner?.contentDocument || inner?.contentWindow?.document;
        if (!doc) return false;

        const sessionId = \${ SESSION_ID };
        if (!sessionId) return false;

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

        // ─── 1. Fiber DFS에서 taskHistory, showHistoryView 찾기 ───
        const root = doc.getElementById('root');
        if (!root) return false;
        const rootFk = findFiberKey(root);
        if (!rootFk) return false;
        let rootFiber = root[rootFk];
        if (rootFk.startsWith('__reactContainer') && rootFiber?._internalRoot?.current)
            rootFiber = rootFiber._internalRoot.current;

        let showHistoryView = null;
        let taskHistory = null;
        const visited = new Set();
        const scanFiber = (f, depth) => {
            if (!f || depth > 60 || visited.has(f)) return;
            visited.add(f);
            const props = f.memoizedProps || f.pendingProps;
            if (props) {
                if (typeof props.showHistoryView === 'function' && !showHistoryView)
                    showHistoryView = props.showHistoryView;
                if (props.taskHistory && Array.isArray(props.taskHistory) && !taskHistory)
                    taskHistory = props.taskHistory;
            }
            if (!taskHistory && f.memoizedState) {
                let st = f.memoizedState;
                while (st) {
                    try {
                        const ms = st.memoizedState;
                        if (ms?.taskHistory && Array.isArray(ms.taskHistory)) {
                            taskHistory = ms.taskHistory;
                            break;
                        }
                    } catch { }
                    st = st.next;
                }
            }
            if (f.child) scanFiber(f.child, depth + 1);
            if (f.sibling) scanFiber(f.sibling, depth + 1);
        };
        scanFiber(rootFiber, 0);

        if (!taskHistory || taskHistory.length === 0) return false;

        // 대상 task 찾기 (ID 또는 제목 매칭)
        const norm = s => (s || '').trim().toLowerCase().replace(/\\s+/g, ' ');
        const idNorm = norm(sessionId);
        let targetTask = taskHistory.find(t => String(t.id) === sessionId);
        if (!targetTask) {
            targetTask = taskHistory.find(t => {
                const title = norm(t.task || '');
                return title.includes(idNorm) || idNorm.includes(title);
            });
        }
        if (!targetTask) return false;
        const targetId = String(targetTask.id);

        // ─── 2. showHistoryView가 없으면 Fiber root DFS 재시도 ───
        if (!showHistoryView) {
            // DOM 요소 기반 탐색 (Fiber root에서 못 찾은 경우)
            for (const el of doc.querySelectorAll('*')) {
                let fiber = getFiber(el);
                for (let d = 0; d < 20 && fiber; d++) {
                    const p = fiber.memoizedProps;
                    if (p && typeof p.showHistoryView === 'function') {
                        showHistoryView = p.showHistoryView;
                        break;
                    }
                    fiber = fiber.return;
                }
                if (showHistoryView) break;
            }
        }
        if (!showHistoryView) return false;

        // ─── 3. 히스토리 뷰 토글 (닫기 → 열기) ───
        // Done 버튼으로 닫기
        const doneBtn = Array.from(doc.querySelectorAll('button'))
            .find(b => b.textContent.trim() === 'Done' && b.offsetHeight > 0);
        if (doneBtn) {
            doneBtn.click();
            await new Promise(r => setTimeout(r, 400));
        }

        // 히스토리 열기
        showHistoryView();

        // ─── 4. Virtuoso 렌더링 대기 (최대 5초, 500ms 간격 재시도) ───
        let il = null;
        for (let attempt = 0; attempt < 10; attempt++) {
            await new Promise(r => setTimeout(r, 500));
            // scroll + resize 트리거
            const sd = doc.querySelector('.overflow-y-scroll, [data-testid=virtuoso-scroller]');
            if (sd) {
                sd.dispatchEvent(new Event('scroll', { bubbles: true }));
                doc.defaultView?.dispatchEvent(new Event('resize'));
            }
            il = doc.querySelector('[data-testid=virtuoso-item-list]');
            if (il && il.children.length > 0) break;
        }

        if (!il || il.children.length === 0) return false;

        // ─── 5. Fiber hooks에서 showTaskWithId 추출 ───
        let showTaskFn = null;
        const findFiberKeySimple = (el) => Object.keys(el).find(k => k.startsWith('__reactFiber'));

        for (const child of il.children) {
            // child 또는 child 내부의 모든 요소에서 탐색
            const targets = [child, ...child.querySelectorAll('*')];
            for (const el of targets) {
                const fk = findFiberKeySimple(el);
                if (!fk) continue;
                let fiber = el[fk];
                for (let d = 0; d < 30 && fiber; d++) {
                    if (fiber.memoizedState) {
                        let hook = fiber.memoizedState;
                        let hookIdx = 0;
                        while (hook && hookIdx < 30) {
                            const ms = hook.memoizedState;
                            if (Array.isArray(ms) && ms.length === 2 && typeof ms[0] === 'function') {
                                const fnSrc = ms[0].toString();
                                if (fnSrc.includes('showTaskWithId')) {
                                    showTaskFn = ms[0];
                                    break;
                                }
                            }
                            hook = hook.next;
                            hookIdx++;
                        }
                    }
                    if (showTaskFn) break;
                    fiber = fiber.return;
                }
                if (showTaskFn) break;
            }
            if (showTaskFn) break;
        }

        // Fallback: Fiber DFS 전체 탐색
        if (!showTaskFn) {
            const visited2 = new Set();
            const dfs2 = (f, depth) => {
                if (!f || depth > 60 || visited2.has(f) || showTaskFn) return;
                visited2.add(f);
                if (f.memoizedState) {
                    let h = f.memoizedState; let i = 0;
                    while (h && i < 30) {
                        const ms = h.memoizedState;
                        if (Array.isArray(ms) && ms.length === 2 && typeof ms[0] === 'function' &&
                            ms[0].toString().includes('showTaskWithId')) {
                            showTaskFn = ms[0]; return;
                        }
                        h = h.next; i++;
                    }
                }
                if (f.child) dfs2(f.child, depth + 1);
                if (f.sibling) dfs2(f.sibling, depth + 1);
            };
            dfs2(rootFiber, 0);
        }

        if (!showTaskFn) return false;

        // ─── 6. showTaskWithId(targetId) 호출 ───
        try {
            await showTaskFn(targetId);
        } catch {
            return false;
        }

        await new Promise(r => setTimeout(r, 1500));
        return true;
    } catch { return false; }
})()
`,
};
