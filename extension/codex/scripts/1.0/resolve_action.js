/**
 * Codex Extension — resolve_action
 *
 * Clicks approval/denial buttons in the Codex UI.
 * Actions: "approve", "deny", "cancel"
 *
 * Placeholder: ${ACTION}
 */
(() => {
  try {
    const action = ${ACTION};
    
    const buttons = Array.from(document.querySelectorAll('button, [role="radio"], [role="button"], input[type="radio"] + label'))
      .filter(b => b.offsetWidth > 0 && !b.disabled && !b.closest('[inert]'));

    const actionLower = (action || '').toLowerCase();
    const patterns = {
      approve: /^(approve|accept|allow|confirm|run|proceed|yes|승인|허용|실행|확인)/i,
      deny: /^(deny|reject|no|거부|아니오)/i,
      cancel: /^(cancel|stop|취소|중지)/i,
    };

    let pattern;
    if (patterns[actionLower]) {
      pattern = patterns[actionLower];
    } else {
      // Escape custom string for regex
      const escapedAction = action.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      pattern = new RegExp(`^${escapedAction}$`, 'i');
    }

    const getBtnLabel = (b) => {
      let t = (b.textContent || '').trim();
      return t || (b.getAttribute('aria-label') || '').trim();
    };

    for (const btn of buttons) {
      const text = getBtnLabel(btn);
      if (pattern.test(text)) {
        btn.click();
        
        // If this is a multiple-choice form, we likely just clicked a radio option.
        // We must also click "Submit(제출)" immediately after.
        if (!/^(제출|submit|건너뛰기|skip|cancel|취소)$/i.test(action)) {
          setTimeout(() => {
            const submitBtn = buttons.find(b => /^(제출|submit)$/i.test(getBtnLabel(b)));
            if (submitBtn && submitBtn !== btn) submitBtn.click();
          }, 100);
        }
        
        return JSON.stringify({ success: true, action, clicked: text });
      }
    }

    return JSON.stringify({
      success: false,
      error: `No button matching action '${action}' found`,
      available: buttons.map(b => (b.textContent || '').trim()).filter(t => t.length > 0 && t.length < 40),
    });
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e) });
  }
})()
