/**
 * PearAI — webview_switch_session (webview iframe 내부에서 실행)
 *
 * data-testid="task-item-{UUID}" 항목을 클릭하여 세션 전환.
 * SESSION_ID는 task UUID 형태 (예: "51a08aba-1078-410c-a601-0e859205b12c")
 */
(() => {
    try {
        const targetId = ${SESSION_ID};

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
