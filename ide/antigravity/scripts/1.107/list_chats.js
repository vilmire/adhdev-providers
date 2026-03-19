/**
 * Antigravity v1 — list_chats (v3 — 강화된 셀렉터)
 *
 * 히스토리 토글을 클릭하여 대화 목록 패널을 열고,
 * DOM에서 직접 대화 목록을 파싱한 뒤 패널을 닫고 결과를 반환.
 *
 * DOM 구조 (2026-03-03 확인):
 *   토글: [data-past-conversations-toggle="true"]
 *   패널: input[placeholder="Select a conversation"] 근처
 *   섹션 헤더: .opacity-50 텍스트 (Current, Recent, Other)
 *   행: .cursor-pointer.justify-between.rounded-md
 *     ├── 제목: span > span
 *     ├── 워크스페이스: .opacity-50.truncate > span
 *     └── 시간: .opacity-50.flex-shrink-0
 */
(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    try {
        // 1. 토글 클릭하여 히스토리 패널 열기
        const toggle = document.querySelector('[data-past-conversations-toggle="true"]');
        if (!toggle) return [];
        toggle.click();
        await sleep(1000);

        // 2. 정확한 검색 input 찾기 (placeholder 정확 매칭)
        const allInputs = document.querySelectorAll('input[type="text"]');
        let searchInput = null;
        for (const inp of allInputs) {
            if (inp.placeholder === 'Select a conversation' && inp.offsetWidth > 0) {
                searchInput = inp;
                break;
            }
        }

        if (!searchInput) {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
            return [];
        }

        // 3. "Current" 텍스트를 기준으로 대화 목록 스크롤 컨테이너 찾기
        let container = null;
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
        while (walker.nextNode()) {
            if (walker.currentNode.textContent.trim() === 'Current') {
                // "Current" 텍스트의 조상 — overflow-auto/scroll이 있는 스크롤 컨테이너까지 올라감
                let el = walker.currentNode.parentElement;
                for (let i = 0; i < 10 && el; i++) {
                    const cls = (el.className || '');
                    if (typeof cls === 'string' && (cls.includes('overflow-auto') || cls.includes('overflow-y-scroll'))) {
                        container = el;
                        break;
                    }
                    el = el.parentElement;
                }
                // overflow 컨테이너 못 찾으면 행이 가장 많은 조상 사용
                if (!container) {
                    el = walker.currentNode.parentElement;
                    let bestEl = null;
                    let bestCount = 0;
                    for (let i = 0; i < 8 && el; i++) {
                        const rows = el.querySelectorAll('[class*="cursor-pointer"][class*="justify-between"][class*="rounded-md"]');
                        if (rows.length > bestCount) {
                            bestCount = rows.length;
                            bestEl = el;
                        }
                        el = el.parentElement;
                    }
                    container = bestEl;
                }
                if (container) break;
            }
        }

        // 폴백: "Current" 텍스트가 없을 때 (새 대화 직후 등) searchInput 기반
        if (!container && searchInput) {
            let el = searchInput.parentElement;
            for (let i = 0; i < 10 && el; i++) {
                const cls = (el.className || '');
                if (typeof cls === 'string' && (cls.includes('overflow-auto') || cls.includes('overflow-y-scroll'))) {
                    container = el; break;
                }
                const rows = el.querySelectorAll('[class*="cursor-pointer"][class*="justify-between"][class*="rounded-md"]');
                if (rows.length > 0 && !container) {
                    container = el;
                }
                el = el.parentElement;
            }
        }

        if (!container) {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
            return [];
        }

        // 4. 대화 행 파싱
        const rows = container.querySelectorAll('[class*="cursor-pointer"][class*="justify-between"][class*="rounded-md"]');
        const chats = [];

        for (const row of rows) {
            const titleEl = row.querySelector('span span');
            const title = titleEl ? titleEl.textContent.trim() : '';
            if (!title) continue;

            const timeEl = row.querySelector('span[class*="opacity-50"][class*="flex-shrink-0"]');
            const time = timeEl ? timeEl.textContent.trim() : '';

            const wsEl = row.querySelector('span[class*="opacity-50"][class*="truncate"] span');
            const workspace = wsEl ? wsEl.textContent.trim() : '';

            const isCurrent = (row.className || '').includes('focusBackground');

            let section = '';
            const sectionHeader = row.parentElement?.querySelector('[class*="opacity-50"]:not([class*="cursor-pointer"])');
            if (sectionHeader) {
                section = sectionHeader.textContent.trim();
            }

            chats.push({
                id: title,
                title,
                status: isCurrent ? 'current' : '',
                time,
                workspace,
                section,
            });
        }

        // 5. 패널 닫기
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));

        return chats;
    } catch (e) {
        try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); } catch (_) { }
        return [];
    }
})()
