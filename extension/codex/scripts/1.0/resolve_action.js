/**
 * Codex Extension — resolve_action
 *
 * Clicks approval/denial buttons in the Codex UI.
 * Actions: "approve", "deny", "cancel", or raw button text
 *
 * Placeholders: ${action}, ${button}
 */
(() => {
  try {
    const action = ${action};
    const buttonText = ${button};
    
    // Search in document (outer webview frame where Codex approval panel lives)
    const buttons = Array.from(document.querySelectorAll('button, [role="radio"], [role="button"], input[type="radio"] + label'))
      .filter(b => b.offsetWidth > 0 && !b.disabled && !b.closest('[inert]'));

    const actionLower = (action || '').toLowerCase();
    const patterns = {
      approve: /^(approve|accept|allow|confirm|run|proceed|yes|승인|허용|실행|확인)/i,
      deny: /^(deny|reject|no|거부|아니오)/i,
      cancel: /^(cancel|stop|취소|중지)/i,
    };

    // Determine what to search for: use buttonText if provided, otherwise match action pattern
    const searchText = buttonText || action || '';
    let targetBtn = null;

    const getBtnLabel = (b) => {
      let t = (b.textContent || '').trim();
      return t || (b.getAttribute('aria-label') || '').trim();
    };

    // 1. Try exact match on buttonText first
    if (buttonText) {
      targetBtn = buttons.find(b => getBtnLabel(b) === buttonText);
      // 2. Try startsWith match (for cases where button text has extra chars like ⏎)
      if (!targetBtn) {
        targetBtn = buttons.find(b => getBtnLabel(b).startsWith(buttonText));
      }
      // 3. Try includes match  
      if (!targetBtn) {
        targetBtn = buttons.find(b => getBtnLabel(b).includes(buttonText));
      }
    }

    // 4. Fall back to pattern-based matching
    if (!targetBtn && patterns[actionLower]) {
      targetBtn = buttons.find(b => patterns[actionLower].test(getBtnLabel(b)));
    }

    // 5. Fall back to regex on raw action text
    if (!targetBtn) {
      const escapedAction = searchText.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const pattern = new RegExp(escapedAction, 'i');
      targetBtn = buttons.find(b => pattern.test(getBtnLabel(b)));
    }

    if (targetBtn) {
      targetBtn.click();
      
      // If this is a numbered option (1., 2., 3.), also click Submit after a short delay
      const clickedText = getBtnLabel(targetBtn);
      if (/^\d+\./.test(clickedText)) {
        setTimeout(() => {
          const submitBtn = buttons.find(b => /^(제출|submit)/i.test(getBtnLabel(b)));
          if (submitBtn && submitBtn !== targetBtn) submitBtn.click();
        }, 150);
      }
      
      return JSON.stringify({ success: true, action, clicked: clickedText });
    }

    return JSON.stringify({
      success: false,
      error: `No button matching '${searchText}' found`,
      available: buttons.map(b => getBtnLabel(b)).filter(t => t.length > 0 && t.length < 80),
    });
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e) });
  }
})()
