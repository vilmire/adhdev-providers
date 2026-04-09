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
    const timeSelectors = '.tabular-nums, [class*="tabular-nums"], [class*="text-right"]';
    const getRowTime = (el) => {
      const direct = Array.from(el.querySelectorAll(timeSelectors))
        .filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > 8 && rect.height > 8;
        })
        .map((node) => normalize(node.textContent || ''))
        .find(Boolean);
      if (direct) return direct;
      const sibling = Array.from(el.parentElement?.querySelectorAll?.(timeSelectors) || [])
        .filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > 8 && rect.height > 8;
        })
        .map((node) => normalize(node.textContent || ''))
        .find(Boolean);
      if (sibling) return sibling;
      const raw = normalize(el.textContent || '');
      const fallback = raw.match(/(\d+\s?[smhdw]|today|yesterday|just now|\d{1,2}:\d{2}\s?(?:am|pm))$/i);
      return normalize(fallback?.[1] || '');
    };
    const stripTrailingTime = (raw, timeText) => {
      const source = normalize(raw);
      const time = normalize(timeText);
      if (!source) return '';
      if (!time) return source;
      if (source.endsWith(time)) return normalize(source.slice(0, -time.length));
      return source;
    };
    const isVisible = (el) => {
      if (!el || el.closest('[inert]')) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return false;
      return rect.bottom >= 36 && rect.top <= viewportHeight() - 12;
    };
    const isHistoryPopover = (el) => {
      if (!isVisible(el)) return false;
      return Array.from(el.querySelectorAll('[role="button"], [role="menuitem"], [role="menuitemradio"], button, div, li, a'))
        .filter(isVisible)
        .some((node) => !!getRowTime(node));
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
    const findRecentTasksButton = () => allButtons()
      .filter((button) => {
        const rect = button.getBoundingClientRect();
        return rect.top <= 40 && rect.height <= 28 && rect.width <= 40;
      })
      .find((button) => button.getAttribute('aria-haspopup') === 'menu') || null;
    const hasInlineSessionRows = () => Array.from(getDoc().querySelectorAll('div[role="button"], [role="button"], div, li, a'))
      .filter(isVisible)
      .some((node) => {
        const rect = node.getBoundingClientRect();
        if (rect.top < 32 || rect.top > 180 || rect.height < 20 || rect.height > 40) return false;
        return !!getRowTime(node);
      });
    const inTasksView = () => !getDoc().querySelector('[data-content-search-turn-key]') && hasInlineSessionRows();
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
      return false;
    };

    const selector = '[role="button"], [role="menuitem"], [role="menuitemradio"], button';
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
      return value || null;
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
      .filter(({ el, rect, text }) => {
        if (!text || text.length < 3 || text.length > 140) return false;
        if (rect.height < 20 || rect.height > 42) return false;
        if (bounds && (rect.top < bounds.top || rect.bottom > bounds.bottom + 4)) return false;
        if (!bounds && (rect.top < 40 || rect.top > 240)) return false;
        const lowered = text.toLowerCase();
        if (!getRowTime(el)) return false;
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
      const title = parseTitle(stripTrailingTime(candidate.text, getRowTime(candidate.el)));
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
