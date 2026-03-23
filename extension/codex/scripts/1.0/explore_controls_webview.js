/**
 * Codex — Explore model/mode selectors and session management UI
 */
(() => {
  try {
    // 1. Model selector area — footer buttons
    const footerArea = document.querySelector('[class*="thread-composer-max-width"][class*="pb-2"]')
      || document.querySelector('[class*="thread-composer-max-width"]');
    
    const footerButtons = footerArea ? Array.from(footerArea.querySelectorAll('button')).map(b => ({
      text: (b.textContent || '').trim().substring(0, 80),
      ariaLabel: b.getAttribute('aria-label')?.substring(0, 80),
      ariaHasPopup: b.getAttribute('aria-haspopup'),
      ariaExpanded: b.getAttribute('aria-expanded'),
      dataState: b.getAttribute('data-state'),
      id: b.id || null,
      class: b.className?.substring(0, 150),
    })) : [];

    // 2. Look for dropdown/popover menus
    const popovers = document.querySelectorAll('[role="menu"], [role="listbox"], [data-radix-popper-content-wrapper], [data-side]');
    const popoverInfo = Array.from(popovers).map(el => ({
      tag: el.tagName?.toLowerCase(),
      role: el.getAttribute('role'),
      class: (el.className && typeof el.className === 'string') ? el.className.substring(0, 200) : null,
      childCount: el.children?.length || 0,
      text: (el.textContent || '').trim().substring(0, 300),
    }));

    // 3. Header buttons (back, new chat, etc.)
    const headerArea = document.querySelector('[class*="draggable"]');
    const headerButtons = headerArea ? Array.from(headerArea.querySelectorAll('button')).map(b => ({
      text: (b.textContent || '').trim().substring(0, 60),
      ariaLabel: b.getAttribute('aria-label')?.substring(0, 80),
      class: b.className?.substring(0, 100),
    })) : [];

    // 4. All buttons with aria-labels (important for functionality mapping)
    const allButtons = Array.from(document.querySelectorAll('button')).filter(b => b.offsetWidth > 0);
    const labeledButtons = allButtons
      .filter(b => b.getAttribute('aria-label'))
      .map(b => ({
        text: (b.textContent || '').trim().substring(0, 60),
        ariaLabel: b.getAttribute('aria-label')?.substring(0, 80),
        ariaHasPopup: b.getAttribute('aria-haspopup'),
      }));

    // 5. Check for "new chat" button
    const newChatBtn = allButtons.find(b => {
      const label = (b.getAttribute('aria-label') || '').toLowerCase();
      const text = (b.textContent || '').trim().toLowerCase();
      return label.includes('new') || label.includes('새') || text.includes('new') || text.includes('새');
    });

    // 6. Look for back/navigation buttons
    const backBtn = allButtons.find(b => {
      const label = (b.getAttribute('aria-label') || '').toLowerCase();
      return label.includes('back') || label.includes('뒤로') || label.includes('돌아가');
    });

    return JSON.stringify({
      footerButtons,
      headerButtons,
      labeledButtons,
      popoverCount: popovers.length,
      popovers: popoverInfo,
      hasNewChatBtn: !!newChatBtn,
      newChatBtnLabel: newChatBtn?.getAttribute('aria-label') || null,
      hasBackBtn: !!backBtn,
      backBtnLabel: backBtn?.getAttribute('aria-label') || null,
    });
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e) });
  }
})()
