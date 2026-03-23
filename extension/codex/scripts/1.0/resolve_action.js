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
    
    const buttons = Array.from(document.querySelectorAll('button'))
      .filter(b => b.offsetWidth > 0);

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

    for (const btn of buttons) {
      const text = (btn.textContent || '').trim();
      const label = btn.getAttribute('aria-label') || '';
      if (pattern.test(text) || pattern.test(label)) {
        btn.click();
        return JSON.stringify({ success: true, action, clicked: text || label });
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
