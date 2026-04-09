/**
 * Codex Extension — switch_session
 *
 * Opens the recent tasks view, clicks the requested session row, and confirms
 * the resulting header changed to the requested conversation title.
 */
(async (args = {}) => {
  try {
    const resolveDoc = () => {
      if (document.getElementById('root')) return document;
      for (const iframe of document.querySelectorAll('iframe')) {
        try {
          const innerDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (innerDoc?.getElementById('root')) return innerDoc;
        } catch {}
      }
      return document;
    };

    const getDoc = () => resolveDoc();
    const viewportHeight = () => getDoc().defaultView?.innerHeight || window.innerHeight || 900;
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const getHeaderText = () => normalize(getDoc().querySelector('[style*="view-transition-name: header-title"]')?.textContent || '');
    const isVisible = (el) => {
      if (!el || el.closest('[inert]')) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return false;
      return rect.bottom >= 36 && rect.top <= viewportHeight() - 12;
    };
    const isHistoryPopover = (el) => {
      if (!isVisible(el)) return false;
      const text = normalize(el.textContent || '').toLowerCase();
      if (!text) return false;
      if (text.includes('search recent tasks') || text.includes('all tasks')) return true;
      return Array.from(el.querySelectorAll('[role="button"], [role="menuitem"], [role="menuitemradio"], button, div, li, a'))
        .filter(isVisible)
        .some((node) => /(\d+\s?[smhdw]|today|yesterday|just now|\d{1,2}:\d{2}\s?(?:am|pm))$/i.test(normalize(node.textContent || '')));
    };
    const getVisibleHistoryPopovers = () => Array.from(getDoc().querySelectorAll('[role="menu"], [role="listbox"], [data-radix-popper-content-wrapper], [data-side]'))
      .filter(isHistoryPopover);
    const isInteractive = (el) => {
      if (!el) return false;
      const role = (el.getAttribute?.('role') || '').toLowerCase();
      const tag = (el.tagName || '').toLowerCase();
      if (tag === 'button' || tag === 'a') return true;
      if (role === 'button' || role === 'menuitem' || role === 'menuitemradio' || role === 'option') return true;
      if (typeof el.onclick === 'function') return true;
      if (typeof el.tabIndex === 'number' && el.tabIndex >= 0) return true;
      const className = typeof el.className === 'string' ? el.className : '';
      return /cursor-interaction|cursor-pointer/.test(className);
    };
    const resolveClickTarget = (el) => el?.closest?.('button, a, [role="button"], [role="menuitem"], [role="menuitemradio"], [role="option"]') || el;
    const clickElement = (el, options = {}) => {
      const { useNativeClick = false } = options;
      const target = resolveClickTarget(el);
      const rect = target.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
      target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
      target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
      if (useNativeClick && typeof target.click === 'function') target.click();
    };
    const allButtons = () => Array.from(getDoc().querySelectorAll('button, [role="button"]')).filter(isVisible);
    const findButton = (predicate) => allButtons().find((button) => predicate(normalize(`${button.getAttribute('aria-label') || ''} ${button.textContent || ''}`).toLowerCase(), button));
    const findBackButton = () => findButton((label) => /\bback\b|go back/.test(label));
    const findRecentTasksButton = () => findButton((label) => /recent tasks|task in progress|tasks?/.test(label) && !/new chat/.test(label));
    const inTasksView = () => /^tasks$/i.test(getHeaderText());
    const hasVisibleHistoryPopover = () => getVisibleHistoryPopovers().length > 0;

    const openTasksView = async () => {
      if (inTasksView() || hasVisibleHistoryPopover()) return true;
      const recentTasks = findRecentTasksButton();
      if (recentTasks) {
        clickElement(recentTasks);
        await sleep(550);
        if (inTasksView()) return true;
        if (hasVisibleHistoryPopover()) return true;
      }
      const backButton = findBackButton();
      if (backButton) {
        clickElement(backButton);
        await sleep(550);
        if (inTasksView()) return true;
        if (hasVisibleHistoryPopover()) return true;
      }
      return false;
    };

    const selector = 'button, [role="button"], div, li, a';
    const rawTitle = typeof args === 'string' ? args : args?.title;
    const targetTitle = normalize(rawTitle || '');
    const targetIndex = Number.isFinite(Number(args?.index)) ? Number(args.index) : null;
    const currentHeader = getHeaderText();

    if (!targetTitle && targetIndex == null) {
      return JSON.stringify({ switched: false, error: 'title or index is required' });
    }

    const opened = await openTasksView();
    if (!opened) {
      return JSON.stringify({ switched: false, error: 'Recent tasks view not available' });
    }

    const parseTitle = (raw) => {
      const value = normalize(raw || '');
      if (!value) return null;
      const match = value.match(/^(.*?)(\d+\s?[smhdw]|today|yesterday|just now|\d{1,2}:\d{2}\s?(?:am|pm))$/i);
      return normalize(match?.[1] || value) || null;
    };

    const buildCandidates = (root, bounds) => Array.from(root.querySelectorAll(selector))
      .filter(isVisible)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const text = normalize(el.textContent || el.getAttribute?.('aria-label') || '');
        const role = (el.getAttribute?.('role') || '').toLowerCase();
        const className = typeof el.className === 'string' ? el.className : '';
        const clickTarget = resolveClickTarget(el);
        const interactive = isInteractive(el) || isInteractive(clickTarget);
        const area = Math.round(rect.width * rect.height);
        return { el, rect, text, role, className, interactive, area };
      })
      .filter(({ rect, text }) => {
        if (!text || text.length < 3 || text.length > 140) return false;
        if (rect.height < 20 || rect.height > 42) return false;
        if (bounds && (rect.top < bounds.top || rect.bottom > bounds.bottom + 4)) return false;
        if (!bounds && (rect.top < 40 || rect.top > 240)) return false;
        const lowered = text.toLowerCase();
        if (/^(back|new chat|tasks?|recent tasks?)$/.test(lowered)) return false;
        if (/^\d+\s+task(s)?\s+in\s+progress$/.test(lowered)) return false;
        if (/^view all\b/.test(lowered)) return false;
        if (/archive chat/.test(lowered)) return false;
        if (/approve|reject|load older messages|processing/.test(lowered)) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.rect.top !== b.rect.top) return a.rect.top - b.rect.top;
        if (a.interactive !== b.interactive) return a.interactive ? -1 : 1;
        return b.area - a.area;
      });

    const popovers = getVisibleHistoryPopovers();
    const candidates = popovers.length > 0
      ? popovers.flatMap((popover) => buildCandidates(popover, popover.getBoundingClientRect()))
      : buildCandidates(getDoc(), null);

    const dedup = [];
    const seen = new Set();
    for (const candidate of candidates) {
      const title = parseTitle(candidate.text);
      const key = title.toLowerCase();
      if (!title || seen.has(key)) continue;
      seen.add(key);
      dedup.push({ ...candidate, title });
    }

    let target = null;
    if (targetTitle) {
      const lowered = targetTitle.toLowerCase();
      target = dedup.find((candidate) => candidate.title.toLowerCase() === lowered)
        || dedup.find((candidate) => candidate.title.toLowerCase().includes(lowered) || lowered.includes(candidate.title.toLowerCase()));
    }
    if (!target && targetIndex != null) target = dedup[targetIndex] || null;

    if (!target) {
      const available = dedup.map((candidate) => candidate.title);
      const backButton = findBackButton();
      if (backButton) clickElement(backButton);
      return JSON.stringify({ switched: false, error: 'Session not found', available });
    }

    clickElement(target.el, { useNativeClick: true });

    let newHeader = currentHeader;
    let switched = false;
    for (let attempt = 0; attempt < 18; attempt += 1) {
      await sleep(150);
      newHeader = getHeaderText();
      switched = !inTasksView() && (
        !currentHeader
        || newHeader.toLowerCase() === target.title.toLowerCase()
        || newHeader.toLowerCase().includes(target.title.toLowerCase())
        || target.title.toLowerCase().includes(newHeader.toLowerCase())
        || (newHeader && newHeader !== currentHeader)
      );
      if (switched) break;
    }

    return JSON.stringify({
      switched,
      title: target.title,
      previousTitle: currentHeader || null,
      currentTitle: newHeader || null,
    });
  } catch (e) {
    return JSON.stringify({ switched: false, error: e.message || String(e) });
  }
})
