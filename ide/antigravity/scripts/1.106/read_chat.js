/**
 * Antigravity v1 — read_chat (v4 — 스크롤 아래만, 가시 영역만 수집)
 * 
 * 원칙:
 * - 스크롤은 아래로만 (위로 절대 안 감)
 * - 가상화로 사라진 과거 사용자 메시지는 무시
 * - 현재 보이는 메시지만 수집 (최신 턴 중심)
 * 
 * DOM 구조:
 *   사용자: bg-gray-500/15 + select-text + p-2, 내부 whitespace-pre-wrap
 *   어시스턴트: .leading-relaxed.select-text
 */
(() => {
    try {
        const conv = document.querySelector('#conversation') || document.querySelector('.antigravity-agent-side-panel') || document.body;
        const scroll = conv.querySelector('.overflow-y-auto') || conv;

        // 1. 상태 감지 — 사이드바 하단 Send/Stop 버튼 기반 (오탐 방지)
        let status = 'idle';

        // 시그널 A (1순위): 사이드바 하단 빨간 Stop 사각형 (.bg-red-500) — generating 중일 때 표시됨
        const stopSquare = conv.querySelector('[class*="bg-red-500"]') || conv.querySelector('button[class*="rounded"] [class*="bg-red"]');
        if (stopSquare && stopSquare.offsetWidth > 0) {
            status = 'generating';
        }

        // 시그널 B: conv 내부의 animate-markdown (생성 중 마크다운 렌더링)
        if (status === 'idle') {
            const animMarkdown = scroll.querySelector('.leading-relaxed [class*="animate-markdown"]');
            if (animMarkdown && animMarkdown.offsetWidth > 0) status = 'generating';
        }

        const title = document.title.split(' \u2014 ')[0].trim() || 'Active Session';

        // ─── HTML → Markdown 변환기 (대시보드가 ReactMarkdown+remarkGfm 사용) ───
        // extractCodeText: layout-independent code text extraction
        // Works on cloneNode'd (detached) elements where innerText == textContent
        // Walks child nodes and inserts \n between block-level elements (DIV, P, etc.)
        const BLOCK_TAGS = new Set(['DIV', 'P', 'BR', 'LI', 'TR', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER']);
        function extractCodeText(node) {
            if (node.nodeType === 3) return node.textContent || '';
            if (node.nodeType !== 1) return '';
            if (node.tagName === 'BR') return '\n';
            const parts = [];
            for (const child of node.childNodes) {
                const isBlock = child.nodeType === 1 && BLOCK_TAGS.has(child.tagName);
                const text = extractCodeText(child);
                if (text) {
                    if (isBlock && parts.length > 0) parts.push('\n');
                    parts.push(text);
                    if (isBlock) parts.push('\n');
                }
            }
            // Collapse multiple consecutive newlines into single \n
            return parts.join('').replace(/\n{2,}/g, '\n');
        }
        function htmlToMd(node) {
            if (node.nodeType === 3) return node.textContent || '';
            if (node.nodeType !== 1) return '';
            const tag = node.tagName;

            // 스타일/스크립트 제거
            if (tag === 'STYLE' || tag === 'SCRIPT' || tag === 'SVG') return '';

            // 테이블 → GFM
            if (tag === 'TABLE') {
                const rows = Array.from(node.querySelectorAll('tr'));
                if (rows.length === 0) return '';
                const table = rows.map(tr =>
                    Array.from(tr.querySelectorAll('th, td')).map(cell => (cell.textContent || '').trim().replace(/\|/g, '\\|'))
                );
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

            if (tag === 'UL') return '\n' + Array.from(node.children).map(li => '- ' + childrenToMd(li).trim()).join('\n') + '\n';
            if (tag === 'OL') return '\n' + Array.from(node.children).map((li, i) => (i + 1) + '. ' + childrenToMd(li).trim()).join('\n') + '\n';
            if (tag === 'LI') return childrenToMd(node);

            if (tag === 'H1') return '\n# ' + childrenToMd(node).trim() + '\n';
            if (tag === 'H2') return '\n## ' + childrenToMd(node).trim() + '\n';
            if (tag === 'H3') return '\n### ' + childrenToMd(node).trim() + '\n';
            if (tag === 'H4') return '\n#### ' + childrenToMd(node).trim() + '\n';

            if (tag === 'STRONG' || tag === 'B') return '**' + childrenToMd(node).trim() + '**';
            if (tag === 'EM' || tag === 'I') return '*' + childrenToMd(node).trim() + '*';

            if (tag === 'PRE') {
                const codeEl = node.querySelector('code');
                const lang = codeEl ? (codeEl.className.match(/language-(\w+)/)?.[1] || '') : '';
                // Custom extraction: walk child nodes and insert \n between block elements
                // This works on cloneNode'd elements (no layout → innerText == textContent)
                const code = extractCodeText(codeEl || node);
                return '\n```' + lang + '\n' + code.trim() + '\n```\n';
            }
            if (tag === 'CODE') {
                if (node.parentElement && node.parentElement.tagName === 'PRE') return node.textContent || '';
                return '`' + (node.textContent || '').trim() + '`';
            }

            if (tag === 'BLOCKQUOTE') return '\n> ' + childrenToMd(node).trim().replace(/\n/g, '\n> ') + '\n';
            if (tag === 'A') return '[' + childrenToMd(node).trim() + '](' + (node.getAttribute('href') || '') + ')';
            if (tag === 'BR') return '\n';
            if (tag === 'P') return '\n' + childrenToMd(node).trim() + '\n';

            return childrenToMd(node);
        }
        function childrenToMd(node) {
            return Array.from(node.childNodes).map(htmlToMd).join('');
        }

        function getCleanMd(el) {
            const clone = el.cloneNode(true);
            // 노이즈 제거
            clone.querySelectorAll('button, [role="button"], style, script, svg, .codicon, [class*="feedback"], [aria-label*="Good"], [aria-label*="Bad"]').forEach(n => n.remove());
            // 상태 텍스트 제거 (leaf만, 60자 이하만)
            clone.querySelectorAll('*').forEach(child => {
                if (!child.parentNode) return;
                const t = (child.textContent || '').trim();
                if (t.length > 60) return;
                const low = t.toLowerCase();
                if (/^(analyzed\s+\d|edited\s+\d|ran\s+\S|terminal\s|reading|searching)/i.test(low)) child.remove();
                if (/^(mcp|customizationmcp|serversexport)/i.test(low)) child.remove();
            });
            let md = htmlToMd(clone);
            // "Thought for X seconds" 제거
            md = md.replace(/^Thought for\s+[\d.]+\s*(seconds?|s)\s*/i, '');
            md = md.replace(/\n{3,}/g, '\n\n').trim();
            return md;
        }

        // 2. 메시지 수집 (스크롤 조작 없음 — 현재 DOM에 있는 것만)
        const collected = [];
        const seenHashes = new Set();

        // 사용자 메시지 (bg-gray-500/15 + select-text + p-2)
        const allDivs = scroll.querySelectorAll('div');
        for (const el of allDivs) {
            const cls = (el.className || '');
            if (typeof cls !== 'string') continue;
            if (cls.includes('bg-gray-500/15') && cls.includes('select-text') && cls.includes('p-2')) {
                const textEl = el.querySelector('[class*="whitespace-pre-wrap"]') || el;
                const text = (textEl.innerText || '').trim();
                if (!text || text.length < 1) continue;
                const hash = 'user:' + text.slice(0, 200);
                if (seenHashes.has(hash)) continue;
                seenHashes.add(hash);
                collected.push({ role: 'user', text, el });
            }
        }

        // 어시스턴트 메시지 (leading-relaxed.select-text) — HTML→Markdown 변환
        const assistantBlocks = scroll.querySelectorAll('.leading-relaxed.select-text');
        for (const ab of assistantBlocks) {
            if (ab.offsetHeight < 10) continue;
            if (ab.closest('[class*="max-h-"][class*="overflow-y-auto"]')) continue;

            let text = getCleanMd(ab);
            if (!text || text.length < 2) continue;
            if (/^(Running command|Checked command|collectStatus)/i.test(text)) continue;

            const hash = 'assistant:' + text.slice(0, 200);
            if (seenHashes.has(hash)) continue;
            seenHashes.add(hash);
            collected.push({ role: 'assistant', text, el: ab });
        }

        // 3. DOM 순서 정렬
        collected.sort((a, b) => {
            const pos = a.el.compareDocumentPosition(b.el);
            if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
            if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
            return 0;
        });

        // 최신 30개만 유지 (대화 첫 로드 시 수백 개 수집 방지)
        const trimmed = collected.length > 30 ? collected.slice(-30) : collected;

        const final = trimmed.map((m, i) => ({
            id: 'msg_' + i,
            role: m.role,
            content: m.text.length > 6000 ? m.text.slice(0, 6000) + '\n[... truncated]' : m.text,
            index: i,
            kind: 'standard',
            vsc_history: true
        }));

        // 4. 입력창
        const editor = conv.querySelector('[contenteditable="true"][role="textbox"]') ||
            conv.querySelector('[data-lexical-editor="true"]') ||
            conv.querySelector('textarea');
        const inputContent = editor ? (editor.innerText || editor.value || '').trim() : '';

        // 5. 모달/승인 감지 — Run⌥⏎/Reject 인라인 + Deny/Allow 브라우저 승인
        let activeModal = null;
        try {
            const isApprovalLike = (el) => {
                const t = (el.textContent || '').trim().toLowerCase();
                // 드롭다운 옵션 제외
                if (t === 'ask every time') return false;
                return /^(run|reject|skip|approve|allow|deny|cancel|accept|yes|no)\b/i.test(t)
                    || t === 'always allow' || t === 'always deny'
                    || t.includes('run ') || t.includes('approve') || t.includes('reject')
                    || t.includes('skip');
            };
            // A: 전통적 모달 다이얼로그
            const dialog = document.querySelector('.monaco-dialog-box, [role="dialog"], .monaco-modal-block');
            if (dialog && dialog.offsetWidth > 80 && dialog.offsetHeight > 40) {
                const msg = (dialog.querySelector('.dialog-message, .dialog-message-text') || dialog).innerText?.trim() || '';
                const buttons = Array.from(dialog.querySelectorAll('.monaco-button, button'))
                    .map(b => (b.innerText || '').trim())
                    .filter(t => t.length > 0 && t.length < 30);
                if (msg || buttons.length > 0) {
                    activeModal = { message: msg.slice(0, 300), buttons, width: dialog.offsetWidth, height: dialog.offsetHeight };
                }
            }
            // B: 인라인 approval 버튼 (Run⌥⏎, Reject, Deny, Allow 등)
            // ⚠ 사이드바(conv) 내부의 버튼만 검사 — 에디터의 Accept/Reject Changes 제외
            if (!activeModal) {
                const panelBtns = Array.from(conv.querySelectorAll('button')).filter(b => b.offsetWidth > 0 && b.offsetHeight > 0);
                const approvalBtns = panelBtns.filter(isApprovalLike);
                if (approvalBtns.length > 0) {
                    const hasActionBtn = approvalBtns.some(b => {
                        const t = (b.textContent || '').trim().toLowerCase();
                        return t.indexOf('run') === 0 || t === 'reject' || t.indexOf('reject') === 0
                            || t === 'skip' || t.indexOf('skip') === 0
                            || t === 'deny' || t === 'allow' || t === 'always allow' || t === 'always deny'
                            || t === 'accept' || t === 'approve';
                    });
                    if (hasActionBtn) {
                        const btnTexts = [...new Set(
                            approvalBtns.map(b => (b.textContent || '').trim())
                                .filter(t => t.length > 0 && t.length < 40)
                        )];
                        const firstApproval = approvalBtns[0];
                        let wrapper = firstApproval.parentElement;
                        for (let up = 0; up < 5 && wrapper; up++, wrapper = wrapper.parentElement) {
                            if (wrapper.offsetHeight > 40) break;
                        }
                        const msg = wrapper ? (wrapper.textContent || '').trim().slice(0, 300) : '';
                        activeModal = { message: msg, buttons: btnTexts, width: 400, height: 100 };
                    }
                }
            }
            // C: footer 기반 사용량/quota 다이얼로그 (Dismiss / See Plans / Enable Overages 등)
            // <footer> 요소가 conv 안에 존재하고 2개 이상 버튼이 있으면 사용자 액션이 필요한 카드로 판단
            if (!activeModal) {
                const footers = Array.from(conv.querySelectorAll('footer')).filter(f => f.offsetWidth > 0 && f.offsetHeight > 0);
                for (const footer of footers) {
                    const footerBtns = Array.from(footer.querySelectorAll('button, a')).filter(b => b.offsetWidth > 0);
                    if (footerBtns.length >= 2) {
                        // 카드 컨테이너: footer 상위에서 충분한 높이를 가진 첫 번째 요소
                        let card = footer.parentElement;
                        for (let up = 0; up < 4 && card; up++) {
                            if (card.offsetHeight > 60) break;
                            card = card.parentElement;
                        }
                        const msg = card ? (card.innerText || '').trim().slice(0, 300) : '';
                        const btnTexts = footerBtns.map(b => (b.innerText || '').trim()).filter(t => t.length > 0 && t.length < 40);
                        if (btnTexts.length >= 2) {
                            activeModal = { message: msg, buttons: btnTexts, width: card ? card.offsetWidth : 300, height: card ? card.offsetHeight : 100 };
                            break;
                        }
                    }
                }
            }
            // 모달이 감지되면 status를 waiting_approval로 변경
            if (activeModal) status = 'waiting_approval';
        } catch (e) { activeModal = null; }

        return { id: 'active_session', status, title, messages: final, inputContent, activeModal };
    } catch (e) {
        return { id: 'error', status: 'error', error: e.message, messages: [] };
    }
})()
