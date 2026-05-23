/**
 * Trae - send_message
 *
 * Trae uses a Lexical contenteditable composer. In SOLO mode the composer can
 * accept Enter while the send button still looks disabled; when that happens we
 * must not report needsTypeAndSend, because the daemon fallback can become a
 * second send/interrupt action.
 *
 * Parameter: ${ MESSAGE }
 */
(async () => {
    try {
        const msg = ${ MESSAGE };
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
        const normalizeLoose = (value) => normalize(value).toLowerCase();
        const auxbar = document.getElementById('workbench.parts.auxiliarybar') || document;

        const query = (selector) => auxbar.querySelector(selector) || document.querySelector(selector);
        const queryAll = (selector) => {
            const fromAux = Array.from(auxbar.querySelectorAll(selector));
            if (auxbar === document) return fromAux;
            return [...fromAux, ...Array.from(document.querySelectorAll(selector)).filter(el => !fromAux.includes(el))];
        };
        const isVisible = (el) => {
            if (!el) return false;
            const rect = el.getBoundingClientRect?.();
            return !!(el.offsetWidth || el.offsetHeight || (rect && rect.width > 0 && rect.height > 0));
        };
        const elementText = (el) => normalize([
            el?.getAttribute?.('aria-label'),
            el?.getAttribute?.('title'),
            el?.textContent,
        ].filter(Boolean).join(' '));
        const isStopLike = (el) => /\b(stop|cancel|abort|interrupt|terminate|end)\b/i.test(elementText(el));
        const isDisabled = (el) => !!(
            el?.disabled ||
            el?.getAttribute?.('aria-disabled') === 'true' ||
            el?.classList?.contains('disabled')
        );

        const editor =
            query('.chat-input-v2-input-box-editable') ||
            query('[contenteditable="true"][role="textbox"]') ||
            query('[data-lexical-editor="true"]');

        if (!editor) return JSON.stringify({ sent: false, error: 'no input found' });

        const getEditorText = () => normalize(editor.textContent || editor.innerText || '');
        const getUserMessages = () => queryAll('.user-chat-bubble-request__content-wrapper')
            .map(el => normalize(el.textContent || ''))
            .filter(Boolean);
        const beforeUserMessages = getUserMessages();

        function dispatchInputSync(target, inputType = 'insertText') {
            const view = target.ownerDocument?.defaultView || window;
            if (typeof view.InputEvent === 'function') {
                target.dispatchEvent(new view.InputEvent('input', {
                    bubbles: true,
                    inputType,
                    data: null,
                }));
                return;
            }
            target.dispatchEvent(new Event('input', { bubbles: true }));
        }

        function selectEditorContents() {
            const sel = window.getSelection?.();
            const range = document.createRange?.();
            if (!sel || !range) return false;
            range.selectNodeContents(editor);
            sel.removeAllRanges();
            sel.addRange(range);
            return true;
        }

        async function replaceEditorText(text) {
            editor.focus();
            await sleep(80);
            selectEditorContents();
            await sleep(20);
            document.execCommand?.('delete', false, null);
            await sleep(20);
            document.execCommand?.('insertText', false, text);
            if (normalize(editor.textContent || '') !== normalize(text)) {
                editor.textContent = text;
            }
            dispatchInputSync(editor, 'insertText');
            await sleep(250);
        }

        function clearEditorIfStillPrompt() {
            if (normalizeLoose(getEditorText()) !== normalizeLoose(msg)) return false;
            editor.focus();
            selectEditorContents();
            document.execCommand?.('delete', false, null);
            editor.textContent = '';
            dispatchInputSync(editor, 'deleteContentBackward');
            return true;
        }

        function findSendButton() {
            const candidates = queryAll('.chat-input-v2-send-button, button, [role="button"]')
                .filter(isVisible)
                .filter(el => !isDisabled(el))
                .filter(el => !isStopLike(el));

            return candidates.find(el => el.matches?.('.chat-input-v2-send-button'))
                || candidates.find(el => /\b(send|submit)\b/i.test(elementText(el)))
                || null;
        }

        function isGeneratingOrQueued() {
            const stopButton = queryAll('button, [role="button"]')
                .some(el => isVisible(el) && isStopLike(el));
            if (stopButton) return true;

            const progress = query('.monaco-progress-container:not(.done)');
            if (progress && isVisible(progress)) return true;

            const latestBar = query('.latest-assistant-bar');
            if (latestBar && /(thinking|generating|running|searching)/i.test(latestBar.textContent || '')) return true;

            return false;
        }

        function hasNewMatchingUserMessage() {
            const after = getUserMessages();
            if (after.length <= beforeUserMessages.length) return false;
            const latest = after[after.length - 1] || '';
            return normalizeLoose(latest).includes(normalizeLoose(msg));
        }

        async function waitForSendEvidence(timeoutMs = 1600) {
            const deadline = Date.now() + timeoutMs;
            while (Date.now() < deadline) {
                if (hasNewMatchingUserMessage()) return 'user-message';
                if (isGeneratingOrQueued()) return 'generating';
                if (normalizeLoose(getEditorText()) !== normalizeLoose(msg)) return 'input-changed';
                await sleep(80);
            }
            return '';
        }

        await replaceEditorText(msg);

        const sendBtn = findSendButton();
        let method = '';
        if (sendBtn) {
            sendBtn.click();
            method = 'button';
        } else {
            const view = editor.ownerDocument?.defaultView || window;
            const enterOpts = {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true,
                composed: true,
            };
            editor.dispatchEvent(new view.KeyboardEvent('keydown', enterOpts));
            await sleep(30);
            editor.dispatchEvent(new view.KeyboardEvent('keypress', enterOpts));
            editor.dispatchEvent(new view.KeyboardEvent('keyup', enterOpts));
            method = 'keyboard';
        }

        const evidence = await waitForSendEvidence();
        if (sendBtn || evidence || method === 'keyboard') {
            const cleared = clearEditorIfStillPrompt();
            return JSON.stringify({
                sent: true,
                method,
                evidence: evidence || (method === 'keyboard' ? 'keyboard-dispatched' : 'button-clicked'),
                confirmed: !!(sendBtn || evidence),
                clearedInput: cleared,
            });
        }

        return JSON.stringify({
            sent: false,
            needsTypeAndSend: true,
            selector: '.chat-input-v2-input-box-editable',
            error: 'send was not observed',
        });
    } catch (e) {
        return JSON.stringify({ sent: false, error: e.message });
    }
})()
