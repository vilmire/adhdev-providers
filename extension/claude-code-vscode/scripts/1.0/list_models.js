(() => {
  try {
    const frame = document.getElementById('active-frame');
    const doc = frame?.contentDocument || frame?.contentWindow?.document || document;

    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const dedupe = (values) => Array.from(new Set(values.filter(Boolean)));

    const findCurrentShellModelTrigger = () => {
      const ariaButton = doc.querySelector('button[aria-label^="Select model"]');
      if (ariaButton && ariaButton.offsetWidth > 0) return ariaButton;
      const exact = doc.querySelector('.flex.min-w-0.max-w-full.cursor-pointer.items-center');
      if (exact && exact.offsetWidth > 0) return exact;
      return Array.from(doc.querySelectorAll('div, button')).find((el) => {
        const cls = String(el.className || '');
        return cls.includes('min-w-0')
          && cls.includes('max-w-full')
          && cls.includes('cursor-pointer')
          && cls.includes('items-center')
          && el.offsetWidth > 0;
      }) || null;
    };

    const currentShellItems = Array.from(doc.querySelectorAll('.px-2.py-1.flex.items-center.justify-between.cursor-pointer'));
    const shellModels = dedupe(currentShellItems.map((item) => normalize(
      item.querySelector('.text-xs.font-medium')?.textContent
      || item.textContent
      || ''
    )).filter((text) => text.length > 0 && text.length < 80 && !/^Model$/i.test(text)));

    const shellTrigger = findCurrentShellModelTrigger();
    const shellCurrent = normalize(
      shellTrigger?.textContent
      || shellTrigger?.getAttribute?.('aria-label')?.replace(/^Select model, current:\s*/i, '')
      || ''
    );

    if (shellModels.length > 0 || shellCurrent) {
      return JSON.stringify({
        options: shellModels.map((model) => ({ value: model, label: model })),
        currentValue: shellCurrent,
      });
    }

    return JSON.stringify({
      options: [
        { value: 'default', label: 'default' },
        { value: 'opus', label: 'opus' },
        { value: 'haiku', label: 'haiku' },
      ],
    });
  } catch (e) {
    return JSON.stringify({ options: [], currentValue: '', error: e.message || String(e) });
  }
})();
