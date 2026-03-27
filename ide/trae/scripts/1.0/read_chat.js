/**
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
                    content = Array.from(mdBlocks).map(b => b.textContent.trim()).join('\n');
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
                    actions: buttons,
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
