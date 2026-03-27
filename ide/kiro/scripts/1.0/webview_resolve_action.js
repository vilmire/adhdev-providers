/**
 * Kiro — webview_resolve_action
 * Kiro's approval dialog uses buttons in the kiro-snackbar.
 * 파라미터: ${ BUTTON_TEXT }
 */
(() => {
    try {
        const want = ${ BUTTON_TEXT };
        const wantNorm = (want || '').replace(/\s+/g, ' ').trim().toLowerCase();
        
        function matches(el) {
            const t = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
            if (!t) return false;
            if (t === wantNorm || t.startsWith(wantNorm) || wantNorm.startsWith(t)) return true;
            if (/^(run|approve|allow|accept|yes|trust)\b/.test(wantNorm)) {
                if (/^(run|allow|accept|approve|trust)\b/.test(t)) return true;
            }
            if (/^(reject|deny|no|abort|cancel)\b/.test(wantNorm)) {
                if (/^(reject|deny|cancel)\b/.test(t)) return true;
            }
            return false;
        }
        
        const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
        let found = null;
        for (const b of btns.slice().reverse()) {
            const attrText = (b.getAttribute('title') || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().toLowerCase();
            const hasPlay = b.querySelector('.codicon-play, .codicon-check') !== null;
            const hasReject = b.querySelector('.codicon-chrome-close, .codicon-close') !== null;
            
            // Check direct match
            if (matches(b)) {
                found = b;
                break;
            }
            
            // Checks for 'run/approve' intent
            if (/^(run|approve|allow|accept|yes|trust)\b/.test(wantNorm)) {
                if (hasPlay || attrText.includes('run') || attrText.includes('approve') || attrText.includes('allow') || attrText.includes('trust')) {
                    found = b;
                    break;
                }
            }
            
            // Checks for 'reject/deny/cancel' intent
            if (/^(reject|deny|no|abort|cancel)\b/.test(wantNorm)) {
                if (hasReject || attrText.includes('reject') || attrText.includes('deny') || attrText.includes('cancel')) {
                    found = b;
                    break;
                }
            }
        }
        
        if (found) {
            found.click();
            return JSON.stringify({ resolved: true, method: 'webview_button_click' });
        }
        return JSON.stringify({ resolved: false, want: wantNorm, error: 'Button not found' });
    } catch (e) {
        return JSON.stringify({ resolved: false, error: e.message });
    }
})()
