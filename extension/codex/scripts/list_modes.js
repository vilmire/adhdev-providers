/**
 * Codex Extension — list_modes
 *
 * Reads available autonomy modes from the footer area.
 * Codex shows modes like "Low", "Medium", "High" for autonomy level.
 */
(() => {
  try {
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

    // Find the mode/autonomy button in footer area
    const buttons = Array.from(doc.querySelectorAll('button')).filter(b => b.offsetWidth > 0);
    const modePatterns = /^(낮음|중간|높음|low|medium|high|full auto|semi auto|manual|suggest|auto-edit|auto)$/i;
    
    let currentMode = '';
    for (const btn of buttons) {
      const text = (btn.textContent || '').trim();
      if (modePatterns.test(text)) {
        currentMode = text;
        break;
      }
    }

    if (!currentMode) {
      return JSON.stringify({ modes: [], currentMode: '' });
    }

    // Click the mode button to see available options
    const modeBtn = buttons.find(b => (b.textContent || '').trim() === currentMode);
    if (!modeBtn) {
      return JSON.stringify({ modes: [currentMode], currentMode });
    }

    // Use PointerEvent sequence for Radix dropdown
    const rect = modeBtn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    
    modeBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: cx, clientY: cy, pointerId: 1 }));
    modeBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: cx, clientY: cy }));
    modeBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: cx, clientY: cy, pointerId: 1 }));
    modeBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: cx, clientY: cy }));
    modeBtn.click();

    // Wait for dropdown then read
    return new Promise(resolve => {
      setTimeout(() => {
        const items = Array.from(doc.querySelectorAll('[role="menuitem"], [role="option"], [role="menuitemradio"]'));
        const modes = items.map(el => (el.textContent || '').trim()).filter(t => t.length > 0 && t.length < 30);

        // Close dropdown
        doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        if (modes.length > 0) {
          resolve(JSON.stringify({ modes, currentMode }));
        } else {
          resolve(JSON.stringify({ modes: [currentMode], currentMode }));
        }
      }, 600);
    });
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
})()
