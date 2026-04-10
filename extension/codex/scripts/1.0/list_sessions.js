/**
 * Codex Extension — list_sessions
 *
 * Opens the recent tasks view, and if the first surface is an intermediate
 * IDE/session hub, drills one level deeper before scraping visible task rows.
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
    const selector = '[role="button"], [role="menuitem"], [role="menuitemradio"], button';

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
      return Array.from(el.querySelectorAll(selector + ', div, li, a'))
        .filter(isVisible)
        .some((node) => !!getRowTime(node));
    };

    const getVisibleHistoryPopovers = () => Array.from(getDoc().querySelectorAll('[role="menu"], [role="listbox"], [data-radix-popper-content-wrapper], [data-side]'))
      .filter(isHistoryPopover);

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
        return rect.top <= 48 && rect.height <= 32 && rect.width <= 48;
      })
      .find((button) => button.getAttribute('aria-haspopup') === 'menu') || null;

    const hasInlineSessionRows = () => Array.from(getDoc().querySelectorAll('div[role="button"], [role="button"], div, li, a'))
      .filter(isVisible)
      .some((node) => {
        const rect = node.getBoundingClientRect();
        if (rect.top < 32 || rect.top > 320 || rect.height < 20 || rect.height > 48) return false;
        return !!getRowTime(node);
      });

    const inTasksView = () => !getDoc().querySelector('[data-content-search-turn-key]') && hasInlineSessionRows();
    const hasVisibleHistoryPopover = () => getVisibleHistoryPopovers().length > 0;

    const openTasksView = async () => {
      if (inTasksView() || hasVisibleHistoryPopover()) return true;
      const recentTasks = findRecentTasksButton();
      if (!recentTasks) return false;
      clickElement(recentTasks, { useNativeClick: true });
      await sleep(550);
      return inTasksView() || hasVisibleHistoryPopover();
    };

    const isIgnorableText = (lowered) => {
      if (!lowered) return true;
      if (/^view all\b/.test(lowered)) return true;
      if (/archive chat/.test(lowered)) return true;
      if (/approve|reject|load older messages|processing/.test(lowered)) return true;
      if (/^(local|remote|default permissions|full access|read only|write enabled)$/.test(lowered)) return true;
      return false;
    };

    const buildEntries = (root, bounds, currentTitle) => Array.from(root.querySelectorAll(selector))
      .filter(isVisible)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const raw = normalize(el.textContent || el.getAttribute?.('aria-label') || '');
        const timeText = getRowTime(el);
        const lowered = raw.toLowerCase();
        if (!raw || raw.length < 3 || raw.length > 180) return null;
        if (rect.height < 20 || rect.height > 48) return null;
        if (bounds && (rect.top < bounds.top || rect.bottom > bounds.bottom + 6)) return null;
        if (!bounds && (rect.top < 32 || rect.top > 420)) return null;
        if (!timeText) return null;
        if (isIgnorableText(lowered)) return null;
        const title = stripTrailingTime(raw, timeText);
        if (!title || title.length < 3) return null;
        return {
          el,
          id: title,
          title,
          time: normalize(timeText) || undefined,
          active: normalize(currentTitle).toLowerCase() === title.toLowerCase(),
          _sortTop: rect.top,
        };
      })
      .filter(Boolean);

    const dedupeEntries = (entries) => {
      const dedup = new Map();
      for (const entry of entries) {
        const key = entry.title.toLowerCase();
        const existing = dedup.get(key);
        if (!existing || entry._sortTop < existing._sortTop) dedup.set(key, entry);
      }
      return Array.from(dedup.values()).sort((a, b) => a._sortTop - b._sortTop);
    };

    const collectSessions = (currentTitle) => {
      const popovers = getVisibleHistoryPopovers();
      if (popovers.length > 0) {
        return dedupeEntries(popovers.flatMap((popover) => buildEntries(popover, popover.getBoundingClientRect(), currentTitle)));
      }
      if (!inTasksView()) return [];
      return dedupeEntries(buildEntries(getDoc(), null, currentTitle));
    };

    const collectDrillCandidates = (currentTitle) => {
      const popovers = getVisibleHistoryPopovers();
      const roots = popovers.length > 0 ? popovers : [getDoc()];
      const entries = [];
      for (const root of roots) {
        const bounds = root === getDoc() ? null : root.getBoundingClientRect();
        const nodes = Array.from(root.querySelectorAll(selector)).filter(isVisible);
        for (const el of nodes) {
          const rect = el.getBoundingClientRect();
          const raw = normalize(el.textContent || el.getAttribute?.('aria-label') || '');
          const lowered = raw.toLowerCase();
          if (!raw || raw.length < 3 || raw.length > 180) continue;
          if (rect.height < 20 || rect.height > 52) continue;
          if (bounds && (rect.top < bounds.top || rect.bottom > bounds.bottom + 6)) continue;
          if (!bounds && (rect.top < 32 || rect.top > 420)) continue;
          if (isIgnorableText(lowered)) continue;
          entries.push({
            el,
            title: raw,
            active: normalize(currentTitle).toLowerCase() === raw.toLowerCase(),
            _sortTop: rect.top,
          });
        }
      }
      const seen = new Set();
      return entries
        .filter((entry) => {
          const key = entry.title.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => {
          if (a.active !== b.active) return a.active ? -1 : 1;
          return a._sortTop - b._sortTop;
        });
    };

    const drillIntoNestedListIfNeeded = async (currentTitle) => {
      const initial = collectSessions(currentTitle);
      if (initial.length > 1) return initial;

      const candidates = collectDrillCandidates(currentTitle);
      for (const candidate of candidates.slice(0, 3)) {
        clickElement(candidate.el, { useNativeClick: true });
        await sleep(550);
        const after = collectSessions(currentTitle);
        if (after.length > initial.length) return after;
        if (after.length > 1) return after;
        if (!inTasksView() && !hasVisibleHistoryPopover()) {
          const reopened = await openTasksView();
          if (!reopened) break;
        }
      }
      return initial;
    };

    const currentTitle = getHeaderText();
    const opened = await openTasksView();
    const sessions = opened ? await drillIntoNestedListIfNeeded(currentTitle) : [];

    const finalSessions = sessions.length > 0
      ? sessions.map((entry, index) => ({
        id: entry.id,
        title: entry.title,
        time: entry.time,
        active: entry.active,
        index,
      }))
      : currentTitle
        ? [{ id: currentTitle, title: currentTitle, active: true, index: 0 }]
        : [];

    return JSON.stringify({
      sessions: finalSessions,
      source: opened ? 'recent_tasks' : 'current_view',
      header: getHeaderText() || currentTitle || null,
    });
  } catch (e) {
    return JSON.stringify({ error: e.message || String(e), sessions: [] });
  }
})()
