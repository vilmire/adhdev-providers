/**
 * Cline v1 — resolve_action
 *
 * Cline의 승인/거부 처리.
 * Cline은 button 태그 외에 vscode-button 웹 컴포넌트도 사용.
 * chatState.primaryButtonText / secondaryButtonText로 정확한 매칭.
 *
 * 파라미터: ${ ACTION } — "approve" 또는 "reject"
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

        const action = ${ ACTION };
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
