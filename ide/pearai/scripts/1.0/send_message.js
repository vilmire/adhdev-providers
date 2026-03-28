/**
 * PearAI — webview_send_message
 */
(async () => {
    try {
        const message = ${ MESSAGE };
        const editor = document.querySelector('textarea[placeholder*="Type your task" i]')
            || document.querySelector('textarea')
            || document.querySelector('[contenteditable="true"]');

        if (!editor) {
            return JSON.stringify({ sent: false, error: 'input not found' });
        }

        editor.scrollIntoView({ block: 'center' });
        editor.focus();
        await new Promise((resolve) => setTimeout(resolve, 100));

        const isTextarea = editor.tagName === 'TEXTAREA';
        if (isTextarea) {
            const previousValue = editor.value;
            const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
            if (nativeSetter) nativeSetter.call(editor, message);
            else editor.value = message;
            if (editor._valueTracker) {
                editor._valueTracker.setValue(previousValue);
            }
            editor.dispatchEvent(new Event('input', {
                bubbles: true,
                cancelable: true,
                composed: true,
            }));
            editor.dispatchEvent(new Event('change', { bubbles: true }));

            if ((editor.value || '') !== message) {
                editor.value = '';
                editor.setSelectionRange?.(0, 0);
                editor.setRangeText?.(message, 0, editor.value.length, 'end');
                editor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }));
                editor.dispatchEvent(new Event('change', { bubbles: true }));
            }

            if ((editor.value || '') !== message) {
                editor.focus();
                editor.select?.();
                document.execCommand?.('insertText', false, message);
                editor.dispatchEvent(new Event('input', { bubbles: true, cancelable: true, composed: true }));
                editor.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } else {
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(editor);
            selection.removeAllRanges();
            selection.addRange(range);
            document.execCommand('delete', false, null);
            document.execCommand('insertText', false, message);
            editor.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                composed: true,
                data: message,
                inputType: 'insertText',
            }));
        }

        await new Promise((resolve) => setTimeout(resolve, 350));

        const sendButton = Array.from(document.querySelectorAll('button'))
            .find((button) => /send/i.test((button.textContent || '').trim()) && !button.disabled);

        if (sendButton) {
            sendButton.scrollIntoView({ block: 'center' });
            sendButton.focus?.();
            for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
                sendButton.dispatchEvent(new PointerEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    pointerId: 1,
                    pointerType: 'mouse',
                }));
            }
        }

        const enterOptions = {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
            composed: true,
        };

        editor.dispatchEvent(new KeyboardEvent('keydown', enterOptions));
        editor.dispatchEvent(new KeyboardEvent('keypress', enterOptions));
        editor.dispatchEvent(new KeyboardEvent('keyup', enterOptions));

        return JSON.stringify({ sent: true });
    } catch (error) {
        return JSON.stringify({ sent: false, error: String(error && error.message || error) });
    }
})()
