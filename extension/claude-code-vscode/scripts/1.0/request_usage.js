;(async () => {
  try {
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
      const style = window.getComputedStyle(el);
      return rect.width > 8 && rect.height > 8 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const input = document.querySelector('[role="textbox"].messageInput_cKsPxg');
    if (!input) {
      return JSON.stringify({ success: false, error: 'input not found' });
    }

    const clearInput = () => {
      input.focus();
      input.textContent = '';
      input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'deleteContentBackward',
        data: null,
      }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const closeButton = () => Array.from(document.querySelectorAll('button'))
      .filter(visible)
      .find((button) => /close/i.test(normalize(button.getAttribute('aria-label') || button.getAttribute('title') || button.textContent || '')));

    input.focus();
    input.textContent = '/';
    input.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: '/',
    }));
    input.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: '/',
    }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(250);

    const usageItem = Array.from(document.querySelectorAll('.commandItem_G_S7FQ, [class*="commandItem"]'))
      .filter(visible)
      .find((el) => {
        const text = normalize(el.textContent || '');
        const title = normalize(el.getAttribute('title') || '');
        return /account\s*&\s*usage/i.test(text) || /account\s*&\s*usage/i.test(title);
      });
    if (!usageItem) {
      clearInput();
      return JSON.stringify({ success: false, error: 'account usage menu item not found' });
    }

    usageItem.click();
    await sleep(250);

    const dialog = Array.from(document.querySelectorAll('.dialog_f3sAzg, [class*="dialog"]'))
      .filter(visible)
      .find((el) => /account\s*&\s*usage/i.test(normalize(el.textContent || '')));
    if (!dialog) {
      clearInput();
      return JSON.stringify({ success: false, error: 'account usage dialog not found' });
    }

    const rows = Array.from(dialog.querySelectorAll('.accountRow_JuUW3A, [class*="accountRow"]'));
    const account = Object.fromEntries(rows.map((row) => {
      const label = normalize(row.querySelector('.accountLabel_JuUW3A, [class*="accountLabel"]')?.textContent || '');
      const value = normalize(row.querySelector('.accountValue_JuUW3A, [class*="accountValue"]')?.textContent || '');
      return label ? [label, value] : null;
    }).filter(Boolean));

    const usageBars = Array.from(dialog.querySelectorAll('.usageBarContainer_JuUW3A, [class*="usageBarContainer"]'))
      .map((container) => ({
        label: normalize(container.querySelector('.usageLabel_JuUW3A, [class*="usageLabel"]')?.textContent || ''),
        percent: normalize(container.querySelector('.usagePercent_JuUW3A, [class*="usagePercent"]')?.textContent || ''),
        reset: normalize(container.querySelector('.resetText_JuUW3A, [class*="resetText"]')?.textContent || ''),
      }))
      .filter((item) => item.label || item.percent || item.reset);

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

    closeButton()?.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    clearInput();

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
