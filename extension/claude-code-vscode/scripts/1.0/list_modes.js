(() => {
  try {
    const frame = document.getElementById('active-frame');
    const doc = frame?.contentDocument || frame?.contentWindow?.document || document;

    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const dedupe = (values) => Array.from(new Set(values.filter(Boolean)));

    const findCurrentShellModeTrigger = () => {
      const ariaButton = doc.querySelector('button[aria-label^="Select conversation mode"]');
      if (ariaButton && ariaButton.offsetWidth > 0) return ariaButton;
      return Array.from(doc.querySelectorAll('button, span')).find((el) => {
        const cls = String(el.className || '');
        const text = normalize(el.textContent || '');
        return cls.includes('py-1')
          && cls.includes('pl-1')
          && cls.includes('pr-2')
          && el.offsetWidth > 0
          && (text === 'Fast' || text === 'Planning' || text === 'Normal');
      }) || null;
    };

    const shellModes = [];
    const headers = Array.from(doc.querySelectorAll('.text-xs.px-2.pb-1.opacity-80'));
    for (const header of headers) {
      if (normalize(header.textContent || '') !== 'Conversation mode') continue;
      const panel = header.parentElement;
      if (!panel) continue;
      shellModes.push(...Array.from(panel.querySelectorAll('.font-medium')).map((item) => normalize(item.textContent || '')));
      break;
    }

    const currentShell = findCurrentShellModeTrigger();
    const current = normalize(
      currentShell?.textContent
      || currentShell?.getAttribute?.('aria-label')?.replace(/^Select conversation mode, current:\s*/i, '')
      || ''
    );

    if (shellModes.length > 0 || current) {
      return JSON.stringify({
        options: dedupe(shellModes).map((mode) => ({ value: mode, label: mode })),
        currentValue: current,
      });
    }

    return JSON.stringify({
      options: [
        { value: 'Ask before edits', label: 'Ask before edits' },
        { value: 'Edit automatically', label: 'Edit automatically' },
        { value: 'Plan mode', label: 'Plan mode' },
      ],
    });
  } catch (e) {
    return JSON.stringify({ options: [], currentValue: '', error: e.message || String(e) });
  }
})();
