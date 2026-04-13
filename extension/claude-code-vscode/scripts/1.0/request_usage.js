;(async () => {
  try {
    const frame = document.getElementById('active-frame');
    const doc = frame?.contentDocument || frame?.contentWindow?.document || document;
    const view = doc.defaultView || window;
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const formatPlan = (value) => normalize(value)
      .replace(/^Claude\s+/i, '')
      .replace(/\bpro\b/i, 'Pro')
      .replace(/\bmax\b/i, 'Max');
    const formatUsageLabel = (value) => normalize(value)
      .replace(/^Session\s*\(([^)]+)\)$/i, 'Session $1')
      .replace(/^Weekly\s*\(([^)]+)\)$/i, 'Weekly $1');
    const formatReset = (value) => normalize(value).replace(/^Resets in\s+/i, 'reset ');
    const visible = (el) => {
      if (!el || el.closest('[inert]')) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const closeMenu = () => {
      doc.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    };

    // Open command menu via footer menu button (toggle — only click if not already open)
    const menuBtn = doc.querySelector('button.menuButton_gGYT1w');
    if (!menuBtn) {
      return JSON.stringify({ success: false, error: 'menu button not found' });
    }

    if (!doc.querySelector('.menuPopup_G_S7FQ')) {
      menuBtn.click();
      // Wait for popup to appear (poll up to 800ms)
      for (let i = 0; i < 8; i++) {
        await sleep(100);
        if (doc.querySelector('.menuPopup_G_S7FQ')) break;
      }
    }

    const usageItem = Array.from(doc.querySelectorAll('.commandItem_G_S7FQ .commandLabel_G_S7FQ'))
      .find((el) => /account/i.test(el.textContent) && /usage/i.test(el.textContent));

    if (!usageItem) {
      closeMenu();
      return JSON.stringify({ success: false, error: 'account usage menu item not found' });
    }

    usageItem.closest('.commandItem_G_S7FQ').click();
    await sleep(400);

    const dialog = doc.querySelector('.dialog_f3sAzg');
    if (!dialog || !visible(dialog)) {
      return JSON.stringify({ success: false, error: 'account usage dialog not found' });
    }

    const rows = Array.from(dialog.querySelectorAll('.accountRow_JuUW3A'));
    const account = Object.fromEntries(rows.map((row) => {
      const label = normalize(row.querySelector('.accountLabel_JuUW3A')?.textContent || '');
      const value = normalize(row.querySelector('.accountValue_JuUW3A')?.textContent || '');
      return label ? [label, value] : null;
    }).filter(Boolean));

    const usageBars = Array.from(dialog.querySelectorAll('.usageBarContainer_JuUW3A'))
      .map((container) => ({
        label: normalize(container.querySelector('.usageLabel_JuUW3A')?.textContent || ''),
        percent: normalize(container.querySelector('.usagePercent_JuUW3A')?.textContent || ''),
        reset: normalize(container.querySelector('.resetText_JuUW3A')?.textContent || ''),
      }))
      .filter((item) => item.label || item.percent);

    const plan = formatPlan(account.Plan || '');
    const summaryLines = ['Usage'];
    if (plan) summaryLines.push(plan);
    for (const item of usageBars) {
      let line = formatUsageLabel(item.label || 'Usage');
      if (item.percent) line += ` ${item.percent}`;
      if (item.reset) line += ` · ${formatReset(item.reset)}`;
      summaryLines.push(line);
    }
    const summary = summaryLines.join('\n');

    closeMenu();

    return JSON.stringify({
      success: true,
      usage: {
        plan: plan || null,
        bars: usageBars,
      },
      effects: [{
        type: 'message',
        persist: true,
        message: {
          role: 'system',
          senderName: 'Usage',
          content: summary,
          kind: 'system',
        },
      }],
    });
  } catch (e) {
    return JSON.stringify({ success: false, error: e.message || String(e) });
  }
})()
