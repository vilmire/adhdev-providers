/**
 * Codex Extension — list_sessions
 *
 * Opens the recent tasks view if needed, scrapes visible session rows,
 * then returns to the original conversation when possible.
 */
;(async () => {
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
    const stripTrailingTime = (raw, timeText) => {
      const source = normalize(raw);
      const time = normalize(timeText);
      if (!source) return '';
      if (!time) return source;
      if (source.endsWith(time)) return normalize(source.slice(0, -time.length));
      return source;
    };
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
    const clickElement = (el) => {
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
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
      if (inTasksView() || hasVisibleHistoryPopover()) return { opened: false };
      const recentTasks = findRecentTasksButton();
      if (recentTasks) {
        clickElement(recentTasks);
        await sleep(550);
        if (inTasksView()) return { opened: true, restore: 'back' };
        if (hasVisibleHistoryPopover()) return { opened: true, restore: 'none' };
      }
      return { opened: false };
    };

    const restoreConversation = async () => {};

    const parseEntry = (el, currentTitle) => {
      const rect = el.getBoundingClientRect();
      const raw = normalize(el.textContent || el.getAttribute?.('aria-label') || '');
      const timeText = getRowTime(el);
      if (!raw || raw.length < 3 || raw.length > 140) return null;
      if (rect.top < 40 || rect.top > 240 || rect.height < 20 || rect.height > 42) return null;
      if (!timeText) return null;
      const lowered = raw.toLowerCase();
      if (/^view all\b/.test(lowered)) return null;
      if (/archive chat/.test(lowered)) return null;
      if (/^(local|remote|default permissions|full access|read only|write enabled)$/.test(lowered)) return null;
      if (/approve|reject|load older messages|processing/.test(lowered)) return null;

      const title = stripTrailingTime(raw, timeText);
      const timeLine = normalize(timeText);
      if (!title || title.length < 3) return null;

      return {
        id: title,
        title,
        time: timeLine || null,
        active: normalize(currentTitle).toLowerCase() === title.toLowerCase(),
        _sortTop: rect.top,
      };
    };

    const collectMenuSessions = (currentTitle) => {
      const popovers = getVisibleHistoryPopovers();
      if (popovers.length === 0) return [];

      const entries = [];
      for (const popover of popovers) {
        const bounds = popover.getBoundingClientRect();
        const nodes = Array.from(popover.querySelectorAll('[role="button"], [role="menuitem"], [role="menuitemradio"], button'))
          .filter(isVisible);
        for (const node of nodes) {
          const rect = node.getBoundingClientRect();
          if (rect.top < bounds.top || rect.bottom > bounds.bottom + 4) continue;
          const parsed = parseEntry(node, currentTitle);
          if (!parsed) continue;
          entries.push(parsed);
        }
      }

      const dedup = new Map();
      for (const entry of entries) {
        const key = entry.title.toLowerCase();
        const existing = dedup.get(key);
        if (!existing || entry._sortTop < existing._sortTop) dedup.set(key, entry);
      }

      return Array.from(dedup.values())
        .sort((a, b) => a._sortTop - b._sortTop)
        .map((entry, index) => ({
          id: entry.id,
          title: entry.title,
          time: entry.time || undefined,
          active: entry.active,
          index,
        }));
    };

    const collectSessions = (currentTitle) => {
      if (!inTasksView()) return collectMenuSessions(currentTitle);
      const candidates = Array.from(getDoc().querySelectorAll('[role="button"], [role="menuitem"], [role="menuitemradio"], button')).filter(isVisible);

      const dedup = new Map();
      for (const candidate of candidates) {
        const parsed = parseEntry(candidate, currentTitle);
        if (!parsed) continue;
        const key = parsed.title.toLowerCase();
        const existing = dedup.get(key);
        if (!existing || parsed._sortTop < existing._sortTop) dedup.set(key, parsed);
      }

      return Array.from(dedup.values())
        .sort((a, b) => a._sortTop - b._sortTop)
        .map((entry, index) => ({
          id: entry.id,
          title: entry.title,
          time: entry.time || undefined,
          active: entry.active,
          index,
        }));
    };

    const currentTitle = getHeaderText();
    const nav = await openTasksView();
    const headerAfterOpen = getHeaderText();
    const sessions = collectSessions(currentTitle);

    if (nav.opened) await restoreConversation();

    const finalSessions = sessions.length > 0
      ? sessions
      : !nav.opened && currentTitle && !inTasksView()
        ? [{ id: currentTitle, title: currentTitle, active: true, index: 0 }]
        : [];

    return JSON.stringify({
      sessions: finalSessions,
      source: inTasksView() || nav.opened ? 'recent_tasks' : 'current_view',
      header: headerAfterOpen || currentTitle || null,
    });
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e), sessions: [] });
  }
})()
