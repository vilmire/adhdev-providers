/**
 * Codex Extension — set_mode
 *
 * Opens the mode dropdown via pointer events, clicks the target mode.
 *
 * Placeholder: ${MODE}
 */
(() => {
  try {
    const targetMode = ${MODE};

    let doc = document;
    let root = doc.getElementById('root');
    if (!root) {
      const iframes = doc.querySelectorAll('iframe');
      for (const iframe of iframes) {
        try {
          const innerDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (innerDoc?.getElementById('root')) {
            doc = innerDoc;
            root = innerDoc.getElementById('root');
            break;
          }
        } catch (e) { /* cross-origin */ }
      }
    }
    if (!root) return JSON.stringify({ error: 'no root' });

    const buttons = Array.from(doc.querySelectorAll('button')).filter(b => b.offsetWidth > 0);
    const modePatterns = /^(낮음|중간|높음|low|medium|high|full auto|semi auto|manual|suggest|auto-edit|auto)$/i;
    
    const modeBtn = buttons.find(b => modePatterns.test((b.textContent || '').trim()));
    if (!modeBtn) return JSON.stringify({ error: 'mode button not found' });

    const currentMode = (modeBtn.textContent || '').trim();
    if (currentMode.toLowerCase() === targetMode.toLowerCase()) {
      return JSON.stringify({ success: true, mode: currentMode, changed: false });
    }

    // Open dropdown via PointerEvent sequence
    const rect = modeBtn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    modeBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: cx, clientY: cy, pointerId: 1 }));
    modeBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: cx, clientY: cy }));
    modeBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: cx, clientY: cy, pointerId: 1 }));
    modeBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: cx, clientY: cy }));
    modeBtn.click();

    return new Promise(resolve => {
      setTimeout(() => {
        const items = Array.from(doc.querySelectorAll('[role="menuitem"], [role="option"], [role="menuitemradio"]'));
        const match = items.find(el => {
          const text = (el.textContent || '').trim();
          return text.toLowerCase() === targetMode.toLowerCase() || text.toLowerCase().includes(targetMode.toLowerCase());
        });

        if (match) {
          match.click();
          setTimeout(() => {
            resolve(JSON.stringify({ success: true, mode: targetMode, changed: true }));
          }, 300);
        } else {
          // Close dropdown
          doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          resolve(JSON.stringify({ error: `mode "${targetMode}" not found`, available: items.map(el => (el.textContent || '').trim()) }));
        }
      }, 600);
    });
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
})()
